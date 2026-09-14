// Room on the roster, and room under the cap.
//
// Every in-season move asks the same two questions -- can this club hold
// another player, and can it pay him -- and both were previously answered only
// at projection time, from the engine's league document, once per season
// rollover. That was fine while nothing moved during a season. The wire moves
// players during a season, so both answers have to be readable from the rows
// the move itself changes.
//
// The cap arithmetic is the engine's own rule restated against those rows: the
// top 51 charges count, a rostered player with no contract counts at the
// veteran minimum, and dead money sits on top. Restated rather than imported
// because the engine's capSheet takes a league document this never loads --
// but the rule is one line and is tested against the projection, so the two
// cannot quietly disagree.

import type { Db } from './db.ts';
import { capRules } from '../engine/offseason/frontOffice.ts';

/** The in-season limit. Camp's larger limit belongs to camp; once the season
 *  opens a club carries 53 and the wire has to respect it. */
export const ACTIVE_ROSTER_LIMIT = 53;

/** Charges that count against the cap. The engine counts its 51 largest. */
export const CAP_COUNTED_CONTRACTS = 51;

export async function teamRosterCount(db: Db, saveId: string, teamId: string): Promise<number> {
  const [row] = await db<{ n: string }[]>`
    select count(*)::text as n from public.team_rosters
     where save_id = ${saveId} and team_id = ${teamId}`;
  return Number(row?.n ?? 0);
}

export interface CapPosition {
  readonly capLimit: number;
  readonly committed: number;
  readonly deadMoney: number;
  readonly available: number;
  readonly contracts: number;
}

/**
 * What a club has left, from its roster and contract rows.
 *
 * Dead money is read from the stored sheet rather than recomputed: it is the
 * accumulated cost of past cuts, which no current row records. A club with no
 * sheet yet carries none, and that is a fact about the save rather than a
 * default -- a league that has never released anybody has no dead money.
 */
export async function teamCapPosition(
  db: Db, saveId: string, season: number, teamId: string,
): Promise<CapPosition> {
  const rules = capRules(season);
  const rows = await db<{ aav: string | null }[]>`
    select c.average_annual_value::text as aav
      from public.team_rosters r
      left join public.player_contracts c
        on c.save_id = r.save_id and c.player_id = r.player_id
       and c.contract_status = 'ACTIVE'
     where r.save_id = ${saveId} and r.team_id = ${teamId}`;
  const [sheet] = await db<{ dead_money: string | null }[]>`
    select dead_money::text from public.salary_cap
     where save_id = ${saveId} and team_id = ${teamId} and season = ${season}`;

  const hits = rows
    .map((r) => (r.aav === null ? rules.veteranMinimum : Number(r.aav)))
    .sort((a, b) => b - a)
    .slice(0, CAP_COUNTED_CONTRACTS);
  const committed = hits.reduce((a, b) => a + b, 0);
  const deadMoney = Number(sheet?.dead_money ?? 0);
  return {
    capLimit: rules.salaryCap,
    committed,
    deadMoney,
    available: rules.salaryCap - committed - deadMoney,
    contracts: rows.length,
  };
}

export async function teamCapSpace(
  db: Db, saveId: string, season: number, teamId: string,
): Promise<number> {
  return (await teamCapPosition(db, saveId, season, teamId)).available;
}

/**
 * Writes a club's sheet back, so every screen that reads salary_cap sees the
 * move that just happened.
 *
 * `addedDeadMoney` is the charge a release just created, which is the only
 * cap number that is not derivable from the rows afterwards -- the player and
 * his contract are both gone by then.
 */
export async function refreshCapSheet(
  db: Db, saveId: string, season: number, teamId: string, addedDeadMoney = 0,
): Promise<CapPosition> {
  if (addedDeadMoney > 0) {
    await db`
      insert into public.salary_cap (
        save_id, team_id, season, cap_limit, committed, dead_money, available,
        contracts_counted, rollover_from_prior, data_class)
      values (${saveId}, ${teamId}, ${season}, 0, 0, ${addedDeadMoney}, 0, 0, 0, 'ENGINE')
      on conflict (save_id, team_id, season) do update
        set dead_money = public.salary_cap.dead_money + ${addedDeadMoney}`;
  }
  const position = await teamCapPosition(db, saveId, season, teamId);
  await db`
    insert into public.salary_cap (
      save_id, team_id, season, cap_limit, committed, dead_money, available,
      contracts_counted, rollover_from_prior, data_class)
    values (${saveId}, ${teamId}, ${season}, ${position.capLimit}, ${position.committed},
            ${position.deadMoney}, ${position.available}, ${position.contracts}, 0, 'ENGINE')
    on conflict (save_id, team_id, season) do update
      set cap_limit = excluded.cap_limit, committed = excluded.committed,
          dead_money = excluded.dead_money, available = excluded.available,
          contracts_counted = excluded.contracts_counted`;
  return position;
}
