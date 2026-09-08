// The moves a manager makes himself.
//
// Re-sign one of your own, release someone, take a player when the draft
// reaches your pick, put an offer in before the market opens, propose a trade.
// Five decisions; every one of them is refused by the same rules the engine
// applies to the thirty-one clubs it plays.
//
// Nothing here decides a football outcome. The price a player accepts, what a
// club will trade for, what it costs to cut someone: all of it comes from the
// engine (offseason/deals.ts), so a manager and a computer club are answering
// the same question.

import type { Db } from './db.ts';
import { badRequest, notFound } from './context.ts';
import type { SaveRow } from './save.ts';
import { loadEngineState } from './saveStore.ts';
import { projectWorld } from './project/index.ts';
import { recordDraft, snapshotPlayers, logTransactions } from './project/transactions.ts';
import { readState, requireOffseason, saveLeague, writeState } from './phases.ts';
import { draftStageOn } from './rollover.ts';
import {
  capRules, capSheet, evaluateTrade, marketValue, OFFSEASON_QUOTA, reSignAsk, reSignContract,
  releaseCost, rosterOf, tradeValue, type CareerPlayer, type League,
} from '../engine/offseason/index.ts';

/** The club the save manages, and its cap position right now. */
function room(league: League, teamId: string): number {
  const rules = capRules(league.season);
  return capSheet(teamId, rosterOf(league, teamId), rules, league.deadMoney.get(teamId) ?? 0)
    .available;
}

const find = (league: League, playerId: string): CareerPlayer => {
  const player = league.players.find((p) => p.id === playerId && !p.retired);
  if (player === undefined) throw notFound('player');
  return player;
};

export interface MoveOutcome {
  readonly done: boolean;
  readonly detail: string;
  /** Cap room left afterwards, so the screen never has to work it out. */
  readonly capRoom: number;
}

/**
 * Re-sign one of your own before the market opens.
 *
 * The price is his, not yours: the ask comes from the engine, weighted by how
 * much this player cares about money. Offering it is the whole negotiation --
 * a player who has reached free agency has already decided he will listen.
 */
export async function reSign(
  db: Db, save: SaveRow, playerId: string, years: number, aav?: number,
): Promise<MoveOutcome> {
  requireOffseason(save, 'RETIREMENTS');
  const { league } = await loadEngineState(db, save.id);
  const player = find(league, playerId);
  const teamId = save.user_team_id;
  if (player.teamId !== null) throw badRequest(`${player.name} is under contract`);
  if (player.previousTeamId !== teamId) throw badRequest(`${player.name} is not one of yours`);

  const rules = capRules(league.season);
  const ask = reSignAsk(player, rules);
  const offered = aav ?? ask;
  if (offered < ask) {
    return {
      done: false,
      detail: `${player.name} wants ${String(Math.round(ask / 1e5) / 10)}M a year to stay`,
      capRoom: room(league, teamId),
    };
  }
  if (offered > room(league, teamId)) {
    return {
      done: false,
      detail: `You have ${String(Math.round(room(league, teamId) / 1e5) / 10)}M of room`,
      capRoom: room(league, teamId),
    };
  }
  const squad = rosterOf(league, teamId);
  if (squad.filter((p) => p.group === player.group).length >= OFFSEASON_QUOTA[player.group]) {
    return {
      done: false,
      detail: `You are carrying as many ${player.group} as camp allows`,
      capRoom: room(league, teamId),
    };
  }

  const before = snapshotPlayers(league);
  player.teamId = teamId;
  player.contract = reSignContract(offered, years, league.season);
  await projectWorld(db, save.id, league, { previousIds: new Set(before.keys()) });
  await logTransactions(db, save.id, save.season, league, before, {
    freeAgency: {
      signings: [{
        playerId: player.id, teamId, aav: offered, years: player.contract.years,
        marketValue: marketValue(player, rules), premium: offered / Math.max(1, ask),
        bids: 1, outbidByAnother: false, personality: player.personality,
      }],
      unsigned: 0,
    },
  });
  await saveLeague(db, save, league, save.phase);
  return {
    done: true,
    detail: `${player.name} re-signed for ${String(player.contract.years)} years`,
    capRoom: room(league, teamId),
  };
}

/** Release a player. The dead money is the engine's number, not a penalty
 *  invented here, and it is charged before the screen is told anything. */
export async function release(
  db: Db, save: SaveRow, playerId: string,
): Promise<MoveOutcome> {
  requireOffseason(save);
  const { league } = await loadEngineState(db, save.id);
  const player = find(league, playerId);
  if (player.teamId !== save.user_team_id) throw badRequest(`${player.name} is not on your roster`);

  const dead = releaseCost(player);
  const before = snapshotPlayers(league);
  league.deadMoney.set(save.user_team_id, (league.deadMoney.get(save.user_team_id) ?? 0) + dead);
  player.previousTeamId = player.teamId;
  player.teamId = null;
  player.contract = null;
  await projectWorld(db, save.id, league, { previousIds: new Set(before.keys()) });
  await logTransactions(db, save.id, save.season, league, before, {
    released: [{ playerId: player.id, teamId: save.user_team_id, deadMoney: dead, reason: 'CAP' }],
  });
  await saveLeague(db, save, league, save.phase);
  return {
    done: true,
    detail: dead > 0
      ? `${player.name} released, ${String(Math.round(dead / 1e5) / 10)}M dead money`
      : `${player.name} released`,
    capRoom: room(league, save.user_team_id),
  };
}

/** Take a player with the pick the draft is waiting on. */
export async function draftPick(
  db: Db, save: SaveRow, prospectId: string,
): Promise<MoveOutcome> {
  requireOffseason(save, 'DRAFT');
  const state = await readState(db, save.id);
  const { league } = await loadEngineState(db, save.id);
  const onBoard = league.pipeline.get(league.season) ?? [];
  const prospect = onBoard.find((p) => p.id === prospectId);
  if (prospect === undefined) throw badRequest('That prospect is not on the board');

  const { draft } = await draftStageOn(db, save, league, {
    order: state.draftOrder,
    startAt: state.nextPick,
    choices: {
      teamId: save.user_team_id,
      picks: new Map([[state.nextPick, prospectId]]),
      stopForUser: true,
    },
  });
  await recordDraft(db, save.id, league, draft);
  const paused = draft.paused;
  const phase = paused === null ? 'FREE_AGENCY' : 'DRAFT';
  await saveLeague(db, save, league, phase);
  await writeState(db, save.id, {
    ...state, nextPick: paused === null ? state.nextPick : paused.overall,
  });
  await db`
    update public.draft_picks set made_by_user = true
     where save_id = ${save.id} and selected_player_id = ${prospectId}`;
  await db`update public.saves set phase = ${phase} where id = ${save.id}`;
  return {
    done: true,
    detail: `You took ${prospect.name}, ${prospect.group}`,
    capRoom: room(league, save.user_team_id),
  };
}

/** Put an offer in, or withdraw one. Offers go to market together. */
export async function offer(
  db: Db, save: SaveRow, playerId: string, aav: number, years: number,
): Promise<MoveOutcome> {
  requireOffseason(save, 'FREE_AGENCY');
  const { league } = await loadEngineState(db, save.id);
  const state = await readState(db, save.id);
  const teamId = save.user_team_id;
  const kept = state.offers.filter((o) => o.playerId !== playerId);

  if (aav <= 0) {
    await writeState(db, save.id, { ...state, offers: kept });
    return { done: true, detail: 'Offer withdrawn', capRoom: room(league, teamId) };
  }

  const player = find(league, playerId);
  if (player.teamId !== null) throw badRequest(`${player.name} is not a free agent`);
  const committed = kept.reduce((a, o) => a + o.aav, 0) + aav;
  if (committed > room(league, teamId)) {
    return {
      done: false,
      detail: `Your offers would total more than the ${String(Math.round(room(league, teamId) / 1e5) / 10)}M you have`,
      capRoom: room(league, teamId),
    };
  }
  await writeState(db, save.id, {
    ...state, offers: [...kept, { playerId, teamId, aav, years }],
  });
  const ask = marketValue(player, capRules(league.season));
  return {
    done: true,
    detail: aav >= ask
      ? `Offer made. He is asking about ${String(Math.round(ask / 1e5) / 10)}M`
      : `Offer made, below the ${String(Math.round(ask / 1e5) / 10)}M he is asking`,
    capRoom: room(league, teamId),
  };
}

export interface TradeOutcome extends MoveOutcome {
  /** What the other club thought the two sides were worth. */
  readonly offered: number;
  readonly wanted: number;
}

/**
 * Propose a trade.
 *
 * The other club answers with the engine's valuation and says why when it says
 * no. It wants more than it gives, it will not take on money it cannot fit,
 * and it does not care that you need the player.
 */
export async function proposeTrade(
  db: Db, save: SaveRow, otherTeamId: string, give: readonly string[], get: readonly string[],
): Promise<TradeOutcome> {
  requireOffseason(save);
  const { league } = await loadEngineState(db, save.id);
  const mine = save.user_team_id;
  if (otherTeamId === mine) throw badRequest('You cannot trade with yourself');
  if (!league.teamIds.includes(otherTeamId)) throw notFound('team');

  const giving = give.map((id) => find(league, id));
  const getting = get.map((id) => find(league, id));
  for (const p of giving) {
    if (p.teamId !== mine) throw badRequest(`${p.name} is not on your roster`);
  }
  for (const p of getting) {
    if (p.teamId !== otherTeamId) throw badRequest(`${p.name} does not play for them`);
  }

  const rules = capRules(league.season);
  const verdict = evaluateTrade(
    { teamId: mine, players: giving },
    { teamId: otherTeamId, players: getting },
    rules, room(league, otherTeamId));
  const values = { offered: verdict.value, wanted: verdict.asked };
  if (!verdict.accepted) {
    return { done: false, detail: verdict.reason, capRoom: room(league, mine), ...values };
  }

  const incoming = getting.reduce((a, p) => a + (p.contract?.aav ?? 0), 0);
  const outgoing = giving.reduce((a, p) => a + (p.contract?.aav ?? 0), 0);
  if (incoming - outgoing > room(league, mine)) {
    return {
      done: false, detail: 'You cannot fit the contracts coming back',
      capRoom: room(league, mine), ...values,
    };
  }

  const before = snapshotPlayers(league);
  for (const p of giving) { p.previousTeamId = p.teamId; p.teamId = otherTeamId; }
  for (const p of getting) { p.previousTeamId = p.teamId; p.teamId = mine; }
  await projectWorld(db, save.id, league, { previousIds: new Set(before.keys()) });
  const rows = [...giving.map((p) => ({ p, to: otherTeamId })), ...getting.map((p) => ({ p, to: mine }))];
  await db`
    insert into public.transactions (
      save_id, season, week, phase, kind, team_id, counterparty_team_id,
      player_id, player_name, team_abbr, detail, cap_impact)
    select ${save.id}, ${save.season}, null, 'OFFSEASON', 'TRADE', u.to_team, u.from_team,
           u.player_id, u.name, u.to_team, u.detail, u.aav
      from unnest(
        ${rows.map((r) => r.to)}::text[],
        ${rows.map((r) => (r.to === mine ? otherTeamId : mine))}::text[],
        ${rows.map((r) => r.p.id)}::text[], ${rows.map((r) => r.p.name)}::text[],
        ${rows.map((r) => `Traded ${r.to === mine ? 'to' : 'from'} ${mine}`)}::text[],
        ${rows.map((r) => r.p.contract?.aav ?? null)}::bigint[]
      ) as u(to_team, from_team, player_id, name, detail, aav)`;
  await saveLeague(db, save, league, save.phase);
  return {
    done: true,
    detail: `Trade agreed with ${otherTeamId}`,
    capRoom: room(league, mine),
    ...values,
  };
}

export { tradeValue, reSignAsk };
