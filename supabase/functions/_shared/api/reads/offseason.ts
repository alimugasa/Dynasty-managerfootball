// offseason: where the winter is, and what you can do about it.
//
// One read per phase, because a manager looking at the contract screen does
// not need the draft board and a manager on the clock does not need the
// retirement list. Everything comes from rows the engine wrote, and every
// price on it -- what a player will re-sign for, what he is worth in a trade,
// what cutting him costs -- is the engine's own number.

import type { Handler } from '../context.ts';
import { ownedSave } from '../save.ts';
import { optionalString, rawOf, requireString } from '../parse.ts';
import { loadEngineState } from '../saveStore.ts';
import { isOffseasonPhase, PHASE_ACTION, PHASE_LABEL, readState } from '../phases.ts';
import {
  capRules, capSheet, marketValue, reSignAsk, releaseCost, rosterOf, tradeValue,
  type CareerPlayer,
} from '../../engine/offseason/index.ts';

export interface OffseasonIn {
  readonly saveId: string;
  /** A club to look at for a trade. Its roster comes back with the same
   *  valuations yours does, which is what makes an offer comparable. */
  readonly teamId?: string;
}

export interface OffseasonPlayer {
  readonly playerId: string;
  readonly name: string;
  readonly group: string;
  readonly age: number;
  readonly overall: number;
  /** What he will re-sign for, or what he costs on the open market. */
  readonly ask: number | null;
  /** What cutting him costs you. */
  readonly deadMoney: number | null;
  readonly aav: number | null;
  readonly yearsLeft: number | null;
  readonly tradeValue: number;
}

export interface ProspectOut {
  readonly prospectId: string;
  readonly name: string;
  readonly group: string;
  readonly age: number;
  /** What your scouts think, not what he is: the estimate carries their error. */
  readonly estimate: number;
}

export interface OffseasonOut {
  readonly phase: string;
  readonly label: string;
  readonly action: string;
  readonly season: number;
  readonly capRoom: number;
  readonly capLimit: number;
  /** Your own players whose deals ran out, with the price to keep them. */
  readonly expiring: readonly OffseasonPlayer[];
  /** Your roster, for releases and for trades. */
  readonly roster: readonly OffseasonPlayer[];
  /** The market, when it is open. */
  readonly market: readonly OffseasonPlayer[];
  /** Offers you have made and not yet taken to market. */
  readonly offers: readonly { readonly playerId: string; readonly name: string; readonly aav: number; readonly years: number }[];
  /** The board, when the draft is waiting on you. */
  readonly board: readonly ProspectOut[];
  readonly onTheClock: { readonly overall: number; readonly round: number } | null;
  /** The club asked about, and what it has. Empty when none was asked about. */
  readonly partner: { readonly teamId: string; readonly players: readonly OffseasonPlayer[] } | null;
  /** Picks made so far this draft, newest first. */
  readonly picks: readonly { readonly overall: number; readonly round: number; readonly teamId: string; readonly name: string; readonly yours: boolean }[];
}

const MARKET_SHOWN = 40;
const BOARD_SHOWN = 30;

export const offseason: Handler<OffseasonIn, OffseasonOut> = {
  auth: 'required',
  parse: (raw) => {
    const r = rawOf(raw);
    const teamId = optionalString(r, 'teamId');
    return { saveId: requireString(r, 'saveId'), ...(teamId === undefined ? {} : { teamId }) };
  },
  run: async ({ sql, userId }, input) => {
    const s = await ownedSave(sql, userId, input.saveId);
    const { league } = await loadEngineState(sql, s.id);
    const state = await readState(sql, s.id);
    const rules = capRules(league.season);
    const squad = rosterOf(league, s.user_team_id);
    const sheet = capSheet(s.user_team_id, squad, rules, league.deadMoney.get(s.user_team_id) ?? 0);
    const phase = isOffseasonPhase(s.phase) ? s.phase : null;

    const asPlayer = (p: CareerPlayer, ask: number | null): OffseasonPlayer => ({
      playerId: p.id, name: p.name, group: p.group,
      age: Math.round(p.age), overall: Math.round(p.ability + p.mental),
      ask, deadMoney: p.contract === null ? null : releaseCost(p),
      aav: p.contract?.aav ?? null, yearsLeft: p.contract?.yearsRemaining ?? null,
      tradeValue: tradeValue(p, rules),
    });

    const expiring = phase === 'RETIREMENTS'
      ? league.players
        .filter((p) => !p.retired && p.teamId === null && p.previousTeamId === s.user_team_id)
        .sort((a, b) => b.ability - a.ability)
        .map((p) => asPlayer(p, reSignAsk(p, rules)))
      : [];

    const market = phase === 'FREE_AGENCY'
      ? league.players
        .filter((p) => !p.retired && p.teamId === null)
        .sort((a, b) => b.reputation - a.reputation)
        .slice(0, MARKET_SHOWN)
        .map((p) => asPlayer(p, marketValue(p, rules)))
      : [];

    const board = phase === 'DRAFT'
      ? (league.pipeline.get(league.season) ?? [])
        .map((p) => ({
          prospectId: p.id, name: p.name, group: p.group, age: Math.round(p.age),
          // The board shows what a club can know. Ability itself is never sent
          // to a client: it is the one number nobody in the game may see.
          estimate: Math.round(p.ability * 0.55 + p.potential * 0.45),
        }))
        .sort((a, b) => b.estimate - a.estimate)
        .slice(0, BOARD_SHOWN)
      : [];

    const picks = phase === 'DRAFT'
      ? (await sql<{
        overall_pick: number; round: number; current_owner_team_id: string;
        display_name: string | null; made_by_user: boolean;
      }[]>`
        select d.overall_pick, d.round, d.current_owner_team_id, p.display_name, d.made_by_user
          from public.draft_picks d
          left join public.players p
            on p.save_id = d.save_id and p.player_id = d.selected_player_id
         where d.save_id = ${s.id} and d.draft_year = ${league.season}
           and d.selected_player_id is not null
         order by d.overall_pick desc limit 12`).map((r) => ({
        overall: r.overall_pick, round: r.round, teamId: r.current_owner_team_id,
        name: r.display_name ?? '', yours: r.made_by_user,
      }))
      : [];

    const nameOf = new Map(league.players.map((p) => [p.id, p.name]));
    return {
      phase: s.phase,
      label: phase === null ? '' : PHASE_LABEL[phase],
      action: phase === null ? '' : PHASE_ACTION[phase],
      season: s.season,
      capRoom: sheet.available,
      capLimit: sheet.capLimit,
      expiring,
      roster: squad.sort((a, b) => b.ability - a.ability).map((p) => asPlayer(p, null)),
      market,
      offers: state.offers.map((o) => ({
        playerId: o.playerId, name: nameOf.get(o.playerId) ?? o.playerId,
        aav: o.aav, years: o.years,
      })),
      board,
      partner: input.teamId === undefined || input.teamId === s.user_team_id ? null : {
        teamId: input.teamId,
        players: rosterOf(league, input.teamId)
          .sort((a, b) => tradeValue(b, rules) - tradeValue(a, rules))
          .slice(0, 25)
          .map((p) => asPlayer(p, null)),
      },
      onTheClock: phase === 'DRAFT' && state.draftOrder.length > 0
        && state.draftOrder[(state.nextPick - 1) % state.draftOrder.length] === s.user_team_id
        ? {
          overall: state.nextPick,
          round: Math.floor((state.nextPick - 1) / state.draftOrder.length) + 1,
        }
        : null,
      picks,
    };
  },
};
