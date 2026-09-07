// What the offseason did, as rows: the draft into draft_picks, and every move
// the engine reported or the diff reveals into transactions.

import type { Db } from '../db.ts';
import type { League, CareerPlayer, PlayerContract } from '../../engine/offseason/index.ts';
import { deadMoneyIfCut } from '../../engine/offseason/index.ts';
import type { DraftResult } from '../../engine/offseason/draft.ts';
import type { OffseasonResult } from '../../engine/offseason/population.ts';
import { contractIdFor } from './contracts.ts';
import { ENGINE_DATA_CLASS } from './players.ts';

export interface PlayerBefore {
  readonly name: string;
  readonly teamId: string | null;
  readonly previousTeamId: string | null;
  readonly contract: PlayerContract | null;
  readonly player: CareerPlayer;
}

/** The league as it stood, with each contract copied: the engine mutates
 *  contracts in place, and a diff against the same object sees nothing. */
export function snapshotPlayers(league: League): Map<string, PlayerBefore> {
  return new Map(league.players.map((p) => [p.id, {
    name: p.name, teamId: p.teamId, previousTeamId: p.previousTeamId,
    contract: p.contract === null ? null : { ...p.contract },
    player: { ...p, contract: p.contract === null ? null : { ...p.contract } },
  }]));
}

export type Drafted = Map<string, { round: number; overall: number; year: number }>;

export const pickIdFor = (year: number, round: number, slot: number): string =>
  `DP${String(year)}R${String(round)}P${String(slot).padStart(2, '0')}`;

/** draft_picks rows for the class the engine just drafted. The engine picks in
 *  its own strength order and trades nothing, so a template row for the same
 *  pick is overwritten with the club that actually picked. */
export function draftedMap(draft: DraftResult): Drafted {
  const drafted: Drafted = new Map();
  for (const pick of draft.picks) {
    drafted.set(pick.prospectId, { round: pick.round, overall: pick.overall, year: pick.season });
  }
  return drafted;
}

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

/** Returns the number of signings logged. */
export async function logTransactions(
  db: Db, saveId: string, season: number, league: League,
  before: ReadonlyMap<string, PlayerBefore>, result: OffseasonResult,
): Promise<number> {
  const clubs = league.teamIds.length;
  const rows: Tx[] = [];
  const signings = new Map(result.freeAgency.signings.map((s) => [s.playerId, s]));
  const picks = new Map(result.draft.picks.map((p) => [p.prospectId, p]));

  for (const p of result.retired) {
    rows.push({ kind: 'RETIREMENT', teamId: before.get(p.id)?.teamId ?? null, playerId: p.id,
      playerName: p.name, detail: `Retired at ${String(p.age)}`, capImpact: null, contractId: null, pickId: null });
  }

  for (const p of league.players) {
    const was = before.get(p.id);
    const pick = picks.get(p.id);
    if (pick !== undefined && p.teamId !== null) {
      rows.push({
        kind: 'DRAFT_SELECTION', teamId: p.teamId, playerId: p.id, playerName: p.name,
        detail: `Round ${String(pick.round)}, pick ${String(pick.overall)} overall`,
        capImpact: p.contract?.aav ?? null,
        contractId: p.contract === null ? null : contractIdFor(p, p.contract.signedSeason),
        pickId: pickIdFor(pick.season, pick.round, pick.overall - (pick.round - 1) * clubs),
      });
      continue;
    }
    const from = was?.teamId ?? null;
    if (p.teamId !== null && from !== p.teamId) {
      const signing = signings.get(p.id);
      const kind = signing !== undefined && was?.previousTeamId === p.teamId ? 'RE_SIGNING' : 'FREE_AGENT_SIGNING';
      rows.push({
        kind, teamId: p.teamId, playerId: p.id, playerName: p.name,
        detail: signing === undefined
          ? (was === undefined ? 'Signed as an undrafted rookie' : 'Signed at the minimum to fill the roster')
          : `${String(signing.years)} years, ${String(signing.bids)} bids`,
        capImpact: p.contract?.aav ?? null,
        contractId: p.contract === null ? null : contractIdFor(p, p.contract.signedSeason),
        pickId: null,
      });
    } else if (p.teamId === null && from !== null && was !== undefined
               && was.contract !== null && was.contract.yearsRemaining > 1) {
      // Under contract beyond this year and now without a club: released.
      // A deal that simply ran out is not logged; the schema has no kind for
      // an expiry, and calling it a release would be wrong.
      rows.push({
        kind: 'RELEASE', teamId: from, playerId: p.id, playerName: p.name,
        detail: `${String(was.contract.yearsRemaining - 1)} years remained`,
        capImpact: deadMoneyIfCut(was.player), contractId: null, pickId: null,
      });
    }
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
  return rows.filter((r) => r.kind === 'FREE_AGENT_SIGNING' || r.kind === 'RE_SIGNING').length;
}
