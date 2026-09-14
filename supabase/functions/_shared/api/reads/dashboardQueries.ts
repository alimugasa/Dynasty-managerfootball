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
  /** Where the club sits in its conference's field once the bracket is drawn.
   *  Null through the regular season, and null afterwards for a club that
   *  missed it -- two different facts the screen tells apart. */
  conference_seed: number | null;
  eliminated: boolean | null;
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
           conference_seed, eliminated,
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

/**
 * How many of the club's players miss this week.
 *
 * The same arithmetic absentPlayers() uses when the week is played, so the
 * number on the screen is the number the simulation acts on. An injury report
 * that disagreed with who actually misses the game would be worse than no
 * injury report.
 */
export interface InjuryRow { out: string; starters: string }

export async function injuryCount(
  db: Db, saveId: string, season: number, week: number, teamId: string,
  /** The thirteen groups a depth chart is judged on, so "a starter" means the
   *  man at the top of one of those rather than of the seed's finer slots. */
  groups: readonly string[],
): Promise<InjuryRow | undefined> {
  const [row] = await db<InjuryRow[]>`
    with out_this_week as (
      select player_id from public.player_injuries
       where save_id = ${saveId} and team_id = ${teamId} and injured_season = ${season}
         and injured_week < ${week}
         and injured_week + weeks_out_estimate - 1 >= ${week}
    )
    select
      (select count(*) from out_this_week)::text as out,
      -- The ones it actually costs a Sunday: a man first in line in one of the
      -- thirteen groups. Six backups out is a thinner roster; one starter out
      -- is a different team, and the warning before a sim should say which.
      (select count(distinct d.player_id) from public.team_depth_charts d
        join out_this_week o on o.player_id = d.player_id
       where d.save_id = ${saveId} and d.team_id = ${teamId}
         and d.depth_order = 1 and d.slot = any(${groups}::text[]))::text as starters`;
  return row;
}

export interface ResultRow {
  game_id: string; week: number; home_team_id: string; away_team_id: string;
  home_score: number; away_score: number; playoff_round: string | null;
}

/** The club's most recent result this season, for the screen that just
 *  simulated it. Null before a game is played. */
export async function lastResult(
  db: Db, saveId: string, season: number, teamId: string,
): Promise<ResultRow | undefined> {
  const [row] = await db<ResultRow[]>`
    select g.game_id, g.week, g.home_team_id, g.away_team_id,
           g.home_score, g.away_score, f.playoff_round
      from public.game_results g
      join public.season_schedule f on f.save_id = g.save_id and f.game_id = g.game_id
     where g.save_id = ${saveId} and g.season = ${season}
       and (g.home_team_id = ${teamId} or g.away_team_id = ${teamId})
     order by g.week desc limit 1`;
  return row;
}

export interface MarginRow {
  game_id: string; week: number; opponent: string;
  team_score: number; opponent_score: number; margin: number;
}

/**
 * The club's biggest win and heaviest defeat this season.
 *
 * Two rows off the results rather than a summary, because the season summary
 * is shown the moment the last week is played and no roll-up has run yet.
 * Ties are broken by the earlier week, so the same season always names the
 * same two games.
 */
export async function marginRows(
  db: Db, saveId: string, season: number, teamId: string,
): Promise<MarginRow[]> {
  return db<MarginRow[]>`
    with mine as (
      select game_id, week,
             case when home_team_id = ${teamId} then away_team_id else home_team_id end as opponent,
             case when home_team_id = ${teamId} then home_score else away_score end as team_score,
             case when home_team_id = ${teamId} then away_score else home_score end as opponent_score
        from public.game_results
       where save_id = ${saveId} and season = ${season}
         and (home_team_id = ${teamId} or away_team_id = ${teamId})
    ),
    scored as (select *, team_score - opponent_score as margin from mine)
    (select * from scored where margin > 0 order by margin desc, week limit 1)
    union all
    (select * from scored where margin < 0 order by margin asc, week limit 1)`;
}
