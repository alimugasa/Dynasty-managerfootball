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

/**
 * Puts a player on a club's roster with a number he is allowed to wear.
 *
 * Two clubs each have a number 12 and only one of them can keep it:
 * team_rosters carries a unique index on (club, number) for active players,
 * so moving a player across while keeping his jersey fails outright the moment
 * a move happens to collide -- which is often, and which surfaced only once
 * trades started moving players in volume. The waiver path had the same latent
 * fault and had simply not been pushed hard enough to show it.
 *
 * So both go through here. His own number if it is free at the new club, the
 * lowest free one otherwise, and no number at all in the impossible case where
 * none is -- unknown rather than invented.
 */
export async function assignToRoster(
  db: Db, saveId: string, playerId: string, teamId: string,
  acquisition: string, season: number, position: string,
): Promise<void> {
  await db`
    insert into public.team_rosters (
      save_id, team_id, player_id, position, roster_status,
      acquisition_type, acquisition_year, jersey_number)
    values (${saveId}, ${teamId}, ${playerId}, ${position}, 'ACTIVE',
            ${acquisition}, ${season}, null)
    on conflict (save_id, player_id) do update
      set team_id = excluded.team_id, position = excluded.position,
          roster_status = 'ACTIVE',
          acquisition_type = excluded.acquisition_type,
          acquisition_year = excluded.acquisition_year,
          jersey_number = case
            when public.team_rosters.jersey_number is not null and not exists (
              select 1 from public.team_rosters other
               where other.save_id = ${saveId} and other.team_id = ${teamId}
                 and other.player_id <> ${playerId}
                 and other.jersey_number = public.team_rosters.jersey_number
                 and other.roster_status = 'ACTIVE')
            then public.team_rosters.jersey_number
            else (
              select n from generate_series(1, 99) as n
               where not exists (
                 select 1 from public.team_rosters taken
                  where taken.save_id = ${saveId} and taken.team_id = ${teamId}
                    and taken.player_id <> ${playerId}
                    and taken.jersey_number = n
                    and taken.roster_status = 'ACTIVE')
               limit 1)
          end`;
  // And the same number on the player himself.
  //
  // players.jersey_number is what the offseason projection copies back into
  // team_rosters at every rollover -- it nulls it only when *it* sees a club
  // change, and an in-season move is a club change it never saw. Leaving it
  // meant a traded player carried his old number into the next projection and
  // collided with whoever wore it at his new club, months later, in a function
  // that had nothing to do with trading.
  await db`
    update public.players p
       set jersey_number = r.jersey_number
      from public.team_rosters r
     where p.save_id = ${saveId} and p.player_id = ${playerId}
       and r.save_id = p.save_id and r.player_id = p.player_id`;
}
