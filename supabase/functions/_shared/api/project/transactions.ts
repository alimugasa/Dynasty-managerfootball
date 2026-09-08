// What the offseason did, as rows: the draft into draft_picks, and every move
// the engine reports into transactions.
//
// The engine reports its picks, signings, retirements, expiries and releases.
// The one move it does not name is the minimum signing that fills a roster
// hole, which shows as a club change in the before-and-after diff and is
// logged as a signing at the minimum. Nothing else is inferred.

import type { Db } from '../db.ts';
import type { League, CareerPlayer, PlayerContract } from '../../engine/offseason/index.ts';
import type { DraftResult } from '../../engine/offseason/draft.ts';
import type { FreeAgencyResult, Release } from '../../engine/offseason/index.ts';
import { contractIdFor } from './contracts.ts';
import { retirementReason } from '../../engine/offseason/retirement.ts';
import { ENGINE_DATA_CLASS } from './players.ts';

export interface PlayerBefore {
  readonly name: string;
  readonly teamId: string | null;
  readonly previousTeamId: string | null;
  readonly contract: PlayerContract | null;
}

/** The league as it stood, with each contract copied: the engine mutates
 *  contracts in place, and a diff against the same object sees nothing. */
export function snapshotPlayers(league: League): Map<string, PlayerBefore> {
  return new Map(league.players.map((p) => [p.id, {
    name: p.name, teamId: p.teamId, previousTeamId: p.previousTeamId,
    contract: p.contract === null ? null : { ...p.contract },
  }]));
}

export type Drafted = Map<string, { round: number; overall: number; year: number }>;

export const pickIdFor = (year: number, round: number, slot: number): string =>
  `DP${String(year)}R${String(round)}P${String(slot).padStart(2, '0')}`;

export function draftedMap(draft: DraftResult): Drafted {
  const drafted: Drafted = new Map();
  for (const pick of draft.picks) {
    drafted.set(pick.prospectId, { round: pick.round, overall: pick.overall, year: pick.season });
  }
  return drafted;
}

/** draft_picks rows for the class the engine just drafted. The engine picks in
 *  its own strength order and trades nothing, so a template row for the same
 *  pick is overwritten with the club that actually picked. */
export async function recordDraft(
  db: Db, saveId: string, league: League, draft: DraftResult,
): Promise<void> {
  const clubs = league.teamIds.length;
  if (draft.picks.length === 0) return;
  const slot = (overall: number, round: number): number => overall - (round - 1) * clubs;
  await db`
    insert into public.draft_picks (
      save_id, pick_id, draft_year, round, pick_in_round, overall_pick,
      original_team_id, current_owner_team_id, compensatory, selected_player_id, data_class)
    select ${saveId}, u.pick_id, u.year, u.round, u.slot, u.overall, u.team_id, u.team_id,
           false, u.player_id, ${ENGINE_DATA_CLASS}
      from unnest(
        ${draft.picks.map((p) => pickIdFor(p.season, p.round, slot(p.overall, p.round)))}::text[],
        ${draft.picks.map((p) => p.season)}::int[], ${draft.picks.map((p) => p.round)}::int[],
        ${draft.picks.map((p) => slot(p.overall, p.round))}::int[],
        ${draft.picks.map((p) => p.overall)}::int[], ${draft.picks.map((p) => p.teamId)}::text[],
        ${draft.picks.map((p) => p.prospectId)}::text[]
      ) as u(pick_id, year, round, slot, overall, team_id, player_id)
    on conflict (save_id, pick_id) do update
      set current_owner_team_id = excluded.current_owner_team_id,
          selected_player_id = excluded.selected_player_id,
          pick_in_round = excluded.pick_in_round, overall_pick = excluded.overall_pick,
          data_class = excluded.data_class`;
}

interface Tx {
  kind: string; teamId: string | null; playerId: string; playerName: string;
  detail: string | null; capImpact: number | null; contractId: string | null; pickId: string | null;
}

export interface TransactionCounts { readonly [kind: string]: number }

/**
 * What the engine reported, as rows.
 *
 * A stage of the offseason reports only its own moves, so every field is
 * optional and an absent one means "this stage did not do that" rather than
 * "nothing happened". The one-shot path passes the whole result; a stepped
 * offseason passes the draft after the draft and the signings after the
 * market, with `before` snapshotted at the start of that stage.
 */
export interface ReportedMoves {
  readonly retired?: readonly CareerPlayer[];
  readonly expired?: readonly CareerPlayer[];
  readonly draft?: DraftResult;
  readonly freeAgency?: FreeAgencyResult;
  readonly released?: readonly Release[];
}

/** Returns the rows logged, by kind. */
export async function logTransactions(
  db: Db, saveId: string, season: number, league: League,
  before: ReadonlyMap<string, PlayerBefore>, moves: ReportedMoves,
): Promise<TransactionCounts> {
  const result = {
    retired: moves.retired ?? [],
    expired: moves.expired ?? [],
    draft: moves.draft ?? { picks: [], undrafted: [], signedUndrafted: 0, paused: null, onBoard: [] },
    freeAgency: moves.freeAgency ?? { signings: [], unsigned: 0 },
    released: moves.released ?? [],
  };
  const clubs = league.teamIds.length;
  const rows: Tx[] = [];
  const byId = new Map(league.players.map((p) => [p.id, p]));
  const nameOf = (id: string): string => byId.get(id)?.name ?? before.get(id)?.name ?? id;
  const dealOf = (p: CareerPlayer | undefined): { aav: number | null; id: string | null } => ({
    aav: p?.contract?.aav ?? null,
    id: p === undefined || p.contract === null ? null : contractIdFor(p, p.contract.signedSeason),
  });

  for (const p of result.retired) {
    const kind = retirementReason(p);
    rows.push({ kind, teamId: before.get(p.id)?.teamId ?? null, playerId: p.id,
      playerName: p.name,
      detail: kind === 'RETIREMENT'
        ? `Retired at ${String(p.age)}`
        : `Out of the league at ${String(p.age)}, rated ${String(Math.round(p.ability))}`,
      capImpact: null, contractId: null, pickId: null });
  }

  for (const p of result.expired) {
    const was = before.get(p.id);
    rows.push({
      kind: 'CONTRACT_EXPIRY', teamId: was?.teamId ?? p.previousTeamId, playerId: p.id,
      playerName: p.name,
      detail: was?.contract === null || was === undefined
        ? null
        : `${String(was.contract.years)}-year deal at ${String(was.contract.aav)} ran out`,
      capImpact: null, contractId: null, pickId: null,
    });
  }

  for (const pick of result.draft.picks) {
    const p = byId.get(pick.prospectId);
    const deal = dealOf(p);
    rows.push({
      kind: 'DRAFT_SELECTION', teamId: pick.teamId, playerId: pick.prospectId,
      playerName: nameOf(pick.prospectId),
      detail: `Round ${String(pick.round)}, pick ${String(pick.overall)} overall`,
      capImpact: deal.aav, contractId: deal.id,
      pickId: pickIdFor(pick.season, pick.round, pick.overall - (pick.round - 1) * clubs),
    });
  }

  const signed = new Set<string>();
  for (const s of result.freeAgency.signings) {
    signed.add(s.playerId);
    const p = byId.get(s.playerId);
    const deal = dealOf(p);
    rows.push({
      kind: before.get(s.playerId)?.previousTeamId === s.teamId ? 'RE_SIGNING' : 'FREE_AGENT_SIGNING',
      teamId: s.teamId, playerId: s.playerId, playerName: nameOf(s.playerId),
      detail: `${String(s.years)} years, ${String(s.bids)} bids`,
      capImpact: s.aav, contractId: deal.id, pickId: null,
    });
  }

  for (const r of result.released) {
    rows.push({
      kind: 'RELEASE', teamId: r.teamId, playerId: r.playerId, playerName: nameOf(r.playerId),
      detail: `${r.reason === 'QUOTA' ? 'Cut to the roster limit' : 'Cut to the cap'}, `
        + (r.deadMoney > 0 ? `${String(r.deadMoney)} dead money` : 'no dead money'),
      capImpact: r.deadMoney, contractId: null, pickId: null,
    });
  }

  // Minimum signings by the compliance pass, and undrafted rookies who caught
  // on: a club where there was none, and no signing reported for it.
  const drafted = draftedMap(result.draft);
  for (const p of league.players) {
    if (p.teamId === null || signed.has(p.id) || drafted.has(p.id)) continue;
    const from = before.get(p.id)?.teamId ?? null;
    if (from === p.teamId) continue;
    const deal = dealOf(p);
    rows.push({
      kind: 'FREE_AGENT_SIGNING', teamId: p.teamId, playerId: p.id, playerName: p.name,
      detail: before.has(p.id) ? 'Signed at the minimum to fill the roster' : 'Signed as an undrafted rookie',
      capImpact: deal.aav, contractId: deal.id, pickId: null,
    });
  }

  if (rows.length > 0) {
    await db`
      insert into public.transactions (
        save_id, season, week, phase, kind, team_id, player_id, player_name, team_abbr,
        detail, cap_impact, contract_id, pick_id)
      select ${saveId}, ${season}, null, 'OFFSEASON', u.kind, u.team_id, u.player_id,
             u.player_name, u.team_id, u.detail, u.cap_impact, u.contract_id, u.pick_id
        from unnest(
          ${rows.map((r) => r.kind)}::text[], ${rows.map((r) => r.teamId)}::text[],
          ${rows.map((r) => r.playerId)}::text[], ${rows.map((r) => r.playerName)}::text[],
          ${rows.map((r) => r.detail)}::text[], ${rows.map((r) => r.capImpact)}::bigint[],
          ${rows.map((r) => r.contractId)}::text[], ${rows.map((r) => r.pickId)}::text[]
        ) as u(kind, team_id, player_id, player_name, detail, cap_impact, contract_id, pick_id)`;
  }
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
  return counts;
}
