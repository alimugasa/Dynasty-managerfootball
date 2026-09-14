// The queries behind the franchise dashboard.
//
// Split from the handler for the same reason teamBoard.ts is split from
// teamProfiles.ts: this file is SQL and the shapes it returns, dashboard.ts is
// what those rows mean.
//
// Every one of these is scoped to one save and one season. Nothing here reads
// the template world -- the dashboard is about the club you are managing now,
// which has a record, a cap sheet and a fixture list of its own.

import type { Db } from '../db.ts';

export interface StandingRow {
  team_id: string; wins: number; losses: number; ties: number;
  points_for: number; points_against: number; streak: string | null;
  rank: string;
}

/** Every club's record this season, ranked the way the league ranks them.
 *
 *  All thirty-two rather than two, because the dashboard needs its own record,
 *  its league position and its next opponent's record, and one pass over a
 *  thirty-two-row table costs less than three round trips. */
export async function standingRows(
  db: Db, saveId: string, season: number,
): Promise<StandingRow[]> {
  return db<StandingRow[]>`
    select team_id, wins, losses, ties, points_for, points_against, streak,
           rank() over (
             order by win_pct desc, points_for - points_against desc, team_id
           )::text as rank
      from public.standings
     where save_id = ${saveId} and season = ${season}`;
}

export interface TurnoverRow { giveaways: string | null; takeaways: string | null; games: string }

/**
 * Turnovers given and taken, this season, by the club you manage.
 *
 * Read off the box scores rather than a summary table, because the summary is
 * written when a season closes and this has to be true in week three. Both
 * columns are nullable in the schema, so a season whose games recorded no
 * turnover data sums to null and is reported as unmeasured rather than as a
 * differential of zero -- which is a real and very different thing.
 */
export async function turnoverRow(
  db: Db, saveId: string, season: number, teamId: string,
): Promise<TurnoverRow | undefined> {
  const [row] = await db<TurnoverRow[]>`
    select sum(case when home_team_id = ${teamId} then home_turnovers
                    else away_turnovers end)::text as giveaways,
           sum(case when home_team_id = ${teamId} then away_turnovers
                    else home_turnovers end)::text as takeaways,
           count(*)::text as games
      from public.game_results
     where save_id = ${saveId} and season = ${season}
       and (home_team_id = ${teamId} or away_team_id = ${teamId})`;
  return row;
}

export interface FixtureRow {
  game_id: string; week: number; home_team_id: string; away_team_id: string;
  playoff_round: string | null;
}

/** This week's game for the club you manage, if it has one. */
export async function weekFixture(
  db: Db, saveId: string, season: number, week: number, teamId: string,
): Promise<FixtureRow | undefined> {
  const [row] = await db<FixtureRow[]>`
    select game_id, week, home_team_id, away_team_id, playoff_round
      from public.season_schedule
     where save_id = ${saveId} and season = ${season} and week = ${week}
       and (home_team_id = ${teamId} or away_team_id = ${teamId})`;
  return row;
}

export interface ShapeRow {
  fixtures: string; played: string; roster: string; groups: string;
  starters: string;
}

/**
 * The counts the "before week one" checklist reports, in one row.
 *
 * Each is a fact about rows that exist, not about anything the player has
 * done: the app does not record whether somebody has looked at their roster,
 * and a tick that claimed otherwise would be the first lie on the screen.
 *
 * `groups` is how many position groups have a depth chart at all and
 * `starters` how many have somebody first in line, which together say whether
 * the chart is set -- the only part of that checklist the save can answer.
 */
export async function shapeRow(
  db: Db, saveId: string, season: number, teamId: string,
  /** The thirteen the chart is judged on. The table also holds the seed's own
   *  finer slots -- LT, NICKEL, GUNNER, forty-four of them -- and counting
   *  those would report a chart three times as complete as it is. */
  groups: readonly string[],
): Promise<ShapeRow | undefined> {
  const [row] = await db<ShapeRow[]>`
    select
      (select count(*) from public.season_schedule
        where save_id = ${saveId} and season = ${season})::text as fixtures,
      (select count(*) from public.game_results
        where save_id = ${saveId} and season = ${season})::text as played,
      (select count(*) from public.team_rosters
        where save_id = ${saveId} and team_id = ${teamId})::text as roster,
      (select count(distinct slot) from public.team_depth_charts
        where save_id = ${saveId} and team_id = ${teamId}
          and slot = any(${groups}::text[]))::text as groups,
      (select count(*) from public.team_depth_charts
        where save_id = ${saveId} and team_id = ${teamId}
          and slot = any(${groups}::text[]) and depth_order = 1)::text as starters`;
  return row;
}

export interface OwnerRow {
  owner_name: string; archetype: string | null;
  patience: number | null; win_now_bias: string | null; tenure_years: number | null;
}

/** The owner of the club you manage. Absent on a world that shipped none. */
export async function ownerRow(
  db: Db, saveId: string, teamId: string,
): Promise<OwnerRow | undefined> {
  const [row] = await db<OwnerRow[]>`
    select owner_name, archetype, patience, win_now_bias::text, tenure_years
      from public.owners where save_id = ${saveId} and team_id = ${teamId}`;
  return row;
}
