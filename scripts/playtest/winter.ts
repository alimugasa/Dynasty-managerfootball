// The offseason, in the play-test build, one step at a time.
//
// The same four stages the server runs (api/rollover.ts), in the same order,
// from the same engine functions -- settle, draft, market, camp -- with the
// same five decisions in the manager's hands. Where the server keeps what is
// decided but not committed in a column beside the save document, this keeps
// it on the game object, which is the same idea with less plumbing.

import { createRng } from '../../supabase/functions/_shared/engine/rng.ts';
import { offseasonStream, scheduleStream } from '../../supabase/functions/_shared/api/save.ts';
import { permuteSchedule } from '../../supabase/functions/_shared/engine/season.ts';
import { createLedger } from '../../supabase/functions/_shared/engine/news/index.ts';
import {
  buildIndex, campStage, capRules, capSheet, draftStage, evaluateTrade, marketStage,
  reSignAsk, reSignContract, releaseCost, rosterOf, strengthOrder,
  OFFSEASON_QUOTA, type CareerPlayer, type League, type UserOffer,
} from '../../supabase/functions/_shared/engine/offseason/index.ts';
import {
  chartFor, freshTable, settleWinter, type Game, type Move, type WinterPhase,
} from './host.ts';

/** Where each stage draws from, so stopping between two of them changes
 *  nothing about what either does. */
const streams = {
  settle: (seed: number, season: number): number => offseasonStream(seed, season),
  draft: (seed: number, season: number, from: number): number =>
    offseasonStream(seed, season) + 7919 * from,
  market: (seed: number, season: number): number => offseasonStream(seed, season) + 104_729,
  camp: (seed: number, season: number): number => offseasonStream(seed, season) + 1_299_709,
};

export const WINTER_PHASES: readonly WinterPhase[] = [
  'OFFSEASON', 'AWARDS', 'RECAP', 'RETIREMENTS', 'DRAFT', 'FREE_AGENCY', 'CAMP',
];

export const PHASE_LABEL: Readonly<Record<WinterPhase, string>> = {
  OFFSEASON: 'Season over',
  AWARDS: 'The awards',
  RECAP: 'The year in review',
  RETIREMENTS: 'Contracts',
  DRAFT: 'The draft',
  FREE_AGENCY: 'Free agency',
  CAMP: 'Camp',
};

export const PHASE_ACTION: Readonly<Record<WinterPhase, string>> = {
  OFFSEASON: 'Close the season',
  AWARDS: 'The year in review',
  RECAP: 'Start the offseason',
  RETIREMENTS: 'Open the draft',
  DRAFT: 'Advance the draft',
  FREE_AGENCY: 'Open the market',
  CAMP: 'Break camp',
};

export const isWinter = (phase: string): phase is WinterPhase =>
  (WINTER_PHASES as readonly string[]).includes(phase);

export const capRoom = (league: League, teamId: string): number =>
  capSheet(teamId, rosterOf(league, teamId), capRules(league.season),
    league.deadMoney.get(teamId) ?? 0).available;

/** What a move did, in the words the screen shows. */
export interface MoveResult {
  readonly game: Game;
  readonly done: boolean;
  readonly detail: string;
}

const refused = (game: Game, detail: string): MoveResult => ({ game, done: false, detail });
const money = (n: number): string => `${(n / 1e6).toFixed(1)}M`;

const find = (game: Game, playerId: string): CareerPlayer | undefined =>
  game.league.players.find((p) => p.id === playerId && !p.retired);

/** Keep one of your own before the market opens. */
export function reSign(game: Game, playerId: string, years: number, aav?: number): MoveResult {
  if (game.phase !== 'RETIREMENTS') return refused(game, 'That belongs to the contract stage');
  const player = find(game, playerId);
  if (player === undefined) return refused(game, 'No such player');
  if (player.teamId !== null) return refused(game, `${player.name} is under contract`);
  if (player.previousTeamId !== game.userTeamId) return refused(game, `${player.name} is not one of yours`);

  const rules = capRules(game.league.season);
  const ask = reSignAsk(player, rules);
  const offered = aav ?? ask;
  if (offered < ask) return refused(game, `${player.name} wants ${money(ask)} a year to stay`);
  if (offered > capRoom(game.league, game.userTeamId)) {
    return refused(game, `You have ${money(capRoom(game.league, game.userTeamId))} of room`);
  }
  const held = rosterOf(game.league, game.userTeamId).filter((p) => p.group === player.group);
  if (held.length >= OFFSEASON_QUOTA[player.group]) {
    return refused(game, `You are carrying as many ${player.group} as camp allows`);
  }
  player.teamId = game.userTeamId;
  player.contract = reSignContract(offered, years, game.league.season);
  return {
    game: { ...game, moves: [...game.moves, {
      season: game.season, kind: 'RE-SIGNED', name: player.name,
      detail: `${String(player.contract.years)} yrs · ${money(offered)}`,
    }] },
    done: true,
    detail: `${player.name} re-signed for ${String(player.contract.years)} years`,
  };
}

/** Cut a player, and pay what the engine says it costs. */
export function release(game: Game, playerId: string): MoveResult {
  const player = find(game, playerId);
  if (player === undefined) return refused(game, 'No such player');
  if (player.teamId !== game.userTeamId) return refused(game, `${player.name} is not on your roster`);
  const dead = releaseCost(player);
  game.league.deadMoney.set(
    game.userTeamId, (game.league.deadMoney.get(game.userTeamId) ?? 0) + dead);
  player.previousTeamId = player.teamId;
  player.teamId = null;
  player.contract = null;
  return {
    game: { ...game, moves: [...game.moves, {
      season: game.season, kind: 'RELEASED', name: player.name,
      detail: dead > 0 ? `${money(dead)} dead money` : 'No dead money',
    }] },
    done: true,
    detail: dead > 0 ? `${player.name} released, ${money(dead)} dead money` : `${player.name} released`,
  };
}

/** Take a player with the pick the draft is waiting on. */
export function draftPick(game: Game, prospectId: string): MoveResult {
  if (game.phase !== 'DRAFT') return refused(game, 'The draft is not open');
  const onBoard = game.league.pipeline.get(game.league.season) ?? [];
  const prospect = onBoard.find((p) => p.id === prospectId);
  if (prospect === undefined) return refused(game, 'That prospect is not on the board');

  const result = draftStage(
    game.league, createRng(streams.draft(game.seed, game.season, game.nextPick)), {
      order: game.draftOrder, startAt: game.nextPick,
      choices: {
        teamId: game.userTeamId, picks: new Map([[game.nextPick, prospectId]]), stopForUser: true,
      },
    });
  const paused = result.paused;
  return {
    game: {
      ...game,
      phase: paused === null ? 'FREE_AGENCY' : 'DRAFT',
      nextPick: paused === null ? game.nextPick : paused.overall,
      moves: [...game.moves, {
        season: game.season, kind: 'DRAFTED', name: prospect.name,
        detail: `${prospect.group} · pick ${String(game.nextPick)} overall`,
      }],
    },
    done: true,
    detail: `You took ${prospect.name}, ${prospect.group}`,
  };
}

/** Put an offer in, or withdraw one by offering nothing. */
export function makeOffer(game: Game, playerId: string, aav: number, years: number): MoveResult {
  if (game.phase !== 'FREE_AGENCY') return refused(game, 'The market is not open');
  const kept = game.offers.filter((o) => o.playerId !== playerId);
  if (aav <= 0) return { game: { ...game, offers: kept }, done: true, detail: 'Offer withdrawn' };

  const player = find(game, playerId);
  if (player === undefined || player.teamId !== null) return refused(game, 'He is not a free agent');
  const committed = kept.reduce((a, o) => a + o.aav, 0) + aav;
  const room = capRoom(game.league, game.userTeamId);
  if (committed > room) {
    return refused(game, `Your offers would total more than the ${money(room)} you have`);
  }
  const offer: UserOffer = { playerId, teamId: game.userTeamId, aav, years };
  return {
    game: { ...game, offers: [...kept, offer] },
    done: true,
    detail: `Offer made: ${money(aav)} a year for ${String(years)}`,
  };
}

/** Propose a trade, and hear why if they say no. */
export function proposeTrade(
  game: Game, otherTeamId: string, give: readonly string[], get: readonly string[],
): MoveResult {
  if (otherTeamId === game.userTeamId) return refused(game, 'You cannot trade with yourself');
  const giving = give.map((id) => find(game, id)).filter((p): p is CareerPlayer => p !== undefined);
  const getting = get.map((id) => find(game, id)).filter((p): p is CareerPlayer => p !== undefined);
  if (giving.some((p) => p.teamId !== game.userTeamId)) return refused(game, 'That is not your player');
  if (getting.some((p) => p.teamId !== otherTeamId)) return refused(game, 'He does not play for them');

  const rules = capRules(game.league.season);
  const verdict = evaluateTrade(
    { teamId: game.userTeamId, players: giving }, { teamId: otherTeamId, players: getting },
    rules, capRoom(game.league, otherTeamId));
  if (!verdict.accepted) return refused(game, verdict.reason);

  const incoming = getting.reduce((a, p) => a + (p.contract?.aav ?? 0), 0);
  const outgoing = giving.reduce((a, p) => a + (p.contract?.aav ?? 0), 0);
  if (incoming - outgoing > capRoom(game.league, game.userTeamId)) {
    return refused(game, 'You cannot fit the contracts coming back');
  }
  for (const p of giving) { p.previousTeamId = p.teamId; p.teamId = otherTeamId; }
  for (const p of getting) { p.previousTeamId = p.teamId; p.teamId = game.userTeamId; }
  return {
    game: { ...game, moves: [...game.moves, ...getting.map((p) => ({
      season: game.season, kind: 'TRADED FOR', name: p.name,
      detail: `From ${otherTeamId} · ${p.group}`,
    })), ...giving.map((p) => ({
      season: game.season, kind: 'TRADED AWAY', name: p.name,
      detail: `To ${otherTeamId} · ${p.group}`,
    }))] },
    done: true,
    detail: `Trade agreed with ${otherTeamId}`,
  };
}

/** The last step: camp, and the calendar for the year that follows. */
function breakCamp(game: Game): Game {
  const season = game.season;
  const released = campStage(game.league, createRng(streams.camp(game.seed, season)));
  const moves: Move[] = [...game.moves];
  for (const r of released) {
    if (r.teamId !== game.userTeamId) continue;
    const player = game.league.players.find((x) => x.id === r.playerId);
    moves.push({
      season, kind: 'RELEASED', name: player?.name ?? r.playerId,
      detail: r.reason === 'QUOTA' ? 'Cut to the roster limit' : 'Cut to the cap',
    });
  }

  const teamIds = game.league.teamIds;
  // Next year keeps this year's shape -- 17 games, 18 weeks, the byes where
  // they were -- with the clubs renamed by a seeded permutation.
  const schedule = permuteSchedule(
    game.schedule, teamIds, createRng(scheduleStream(game.seed, game.league.season)));
  const userTeamId = teamIds.includes(game.userTeamId) ? game.userTeamId : (teamIds[0] ?? '');

  return {
    ...game,
    season: game.league.season, week: 1, phase: 'REGULAR_SEASON',
    schedule, results: [], seeds: [], playoffs: [], standings: freshTable(teamIds),
    news: [], ledger: createLedger(game.league.season),
    absence: new Map(), userTeamId, depthChart: chartFor(game.league, userTeamId),
    offers: [], draftOrder: [], nextPick: 1,
    moves, abandoned: [],
  };
}

/**
 * One step of the winter, whatever step it is at.
 *
 * The draft stops when the manager's pick comes up; everything else runs to
 * the end of its stage. Same order, same engine calls and same streams as the
 * server, so the winter plays the same way in the page as it does on a save.
 */
export function stepWinter(game: Game): Game {
  if (game.phase === 'OFFSEASON') return settleWinter(game);
  // Two stops that change nothing: the vote has been taken and the book is
  // written, and a season that ends in a contract list has nowhere to say who
  // won anything.
  if (game.phase === 'AWARDS') return { ...game, phase: 'RECAP' };
  if (game.phase === 'RECAP') return { ...game, phase: 'RETIREMENTS' };
  if (game.phase === 'RETIREMENTS') {
    const order = strengthOrder(game.league, buildIndex(game.league.teamIds, game.league.players));
    return { ...game, phase: 'DRAFT', draftOrder: [...order], nextPick: 1 };
  }
  if (game.phase === 'DRAFT') {
    const result = draftStage(
      game.league, createRng(streams.draft(game.seed, game.season, game.nextPick)), {
        order: game.draftOrder, startAt: game.nextPick,
        choices: { teamId: game.userTeamId, stopForUser: true },
      });
    const paused = result.paused;
    return {
      ...game,
      phase: paused === null ? 'FREE_AGENCY' : 'DRAFT',
      nextPick: paused === null ? game.nextPick : paused.overall,
    };
  }
  if (game.phase === 'FREE_AGENCY') {
    const market = marketStage(
      game.league, createRng(streams.market(game.seed, game.season)), game.offers);
    const moves: Move[] = [...game.moves];
    for (const s of market.signings) {
      if (s.teamId !== game.userTeamId) continue;
      const player = game.league.players.find((x) => x.id === s.playerId);
      moves.push({
        season: game.season, kind: 'SIGNED', name: player?.name ?? s.playerId,
        detail: `${String(s.years)} yrs · ${(s.aav / 1e6).toFixed(1)}M · ${String(s.bids)} bids`,
      });
    }
    return { ...game, phase: 'CAMP', offers: [], moves };
  }
  return breakCamp(game);
}

/** The rest of the winter, in one go, from wherever it has got to. */
export function runWinter(game: Game): Game {
  let next = game;
  for (let guard = 0; guard < 400 && next.phase !== 'REGULAR_SEASON'; guard += 1) {
    if (next.phase === 'DRAFT' && next.draftOrder.length > 0) {
      // Nobody is waiting on a pick when the staff is making them: the draft
      // runs to the end in one call, from wherever the manager left it.
      draftStage(next.league, createRng(streams.draft(next.seed, next.season, next.nextPick)),
        { order: next.draftOrder, startAt: next.nextPick });
      next = { ...next, phase: 'FREE_AGENCY', nextPick: 1 };
      continue;
    }
    next = stepWinter(next);
  }
  return next;
}


export { streams };
