// Closing a season and opening the next: the pieces of the rollover that are
// about the calendar and the book rather than about football.
//
// Split out of rollover.ts so that file can be about the order the stages run
// in. Everything here is called by both paths through an offseason -- the one
// that runs it in a single call, and the one a manager plays through a step at
// a time.

import type { Db } from '../db.ts';
import { scheduleStream } from '../save.ts';
import { createRng } from '../../engine/rng.ts';
import { permuteSchedule } from '../../engine/season.ts';
import { expectedWins, type CoachRecord, type League } from '../../engine/offseason/index.ts';
import { ENGINE_DATA_CLASS } from '../project/players.ts';

/**
 * What each club's season was, as the carousel judges it: the record it
 * actually had against what its roster said it should have had.
 *
 * The expectation is the roster's, not the club's history: a club that
 * stripped down and won four is not judged against the eleven it won two
 * years ago. Roster strength is the mean of a club's best 24 abilities, the
 * same measure the news feed calls a club's rating.
 */
export async function seasonRecords(
  db: Db, saveId: string, season: number, league: League, weeks: number,
): Promise<Map<string, CoachRecord>> {
  const rows = await db<{
    team_id: string; wins: number; losses: number; ties: number; playoff_result: string | null;
  }[]>`
    select st.team_id, st.wins, st.losses, st.ties, h.playoff_result
      from public.standings st
      left join public.league_history h
        on h.save_id = st.save_id and h.season = st.season and h.team_id = st.team_id
     where st.save_id = ${saveId} and st.season = ${season}`;
  const rating = (teamId: string): number => {
    const top = league.players
      .filter((p) => p.teamId === teamId && !p.retired)
      .map((p) => p.ability).sort((a, b) => b - a).slice(0, 24);
    return top.reduce((a, b) => a + b, 0) / Math.max(1, top.length);
  };
  const ratings = new Map(league.teamIds.map((id) => [id, rating(id)]));
  const values = [...ratings.values()];
  const mean = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
  return new Map(rows.map((r) => [r.team_id, {
    wins: r.wins, losses: r.losses, ties: r.ties,
    expectedWins: expectedWins(ratings.get(r.team_id) ?? mean, mean, weeks - 1),
    champion: r.playoff_result === 'CHAMPION',
    madePlayoffs: r.playoff_result !== null && r.playoff_result !== 'MISSED',
  }]));
}

/** The table's final line into league_history. The row already exists --
 *  the final wrote it, with the seed and the playoff result -- so only the
 *  record and the roster's mean are set here. */
export async function closeSeason(db: Db, saveId: string, season: number, meanOverall: Map<string, number>): Promise<void> {
  await db`
    insert into public.league_history (
      save_id, season, team_id, wins, losses, ties, points_for, points_against, mean_overall)
    select st.save_id, st.season, st.team_id, st.wins, st.losses, st.ties,
           st.points_for, st.points_against, u.mean_overall
      from public.standings st
      left join unnest(${[...meanOverall.keys()]}::text[], ${[...meanOverall.values()]}::numeric[])
        as u(team_id, mean_overall) on u.team_id = st.team_id
     where st.save_id = ${saveId} and st.season = ${season}
    on conflict (save_id, season, team_id) do update
      set wins = excluded.wins, losses = excluded.losses, ties = excluded.ties,
          points_for = excluded.points_for, points_against = excluded.points_against,
          mean_overall = excluded.mean_overall`;
  await db`select public.refresh_team_season_summary(${saveId}::uuid, ${season})`;
}

/** The shape of the season just played: the same games, weeks and byes with
 *  the clubs renamed by a seeded permutation, so every year is 17 games over
 *  18 weeks like the seed's, and not the byeless 18 the round-robin makes. */
export async function writeSchedule(
  db: Db, saveId: string, season: number, teamIds: readonly string[], seed32: number,
): Promise<void> {
  const shape = await db<{ week: number; home_team_id: string; away_team_id: string }[]>`
    select week, home_team_id, away_team_id from public.season_schedule
     where save_id = ${saveId} and season = ${season - 1} and competition = 'REGULAR'
     order by week, game_id`;
  if (shape.length === 0) throw new Error(`No ${String(season - 1)} schedule to shape ${String(season)} from`);
  const fixtures = permuteSchedule(
    shape.map((r) => ({ week: r.week, homeTeamId: r.home_team_id, awayTeamId: r.away_team_id })),
    teamIds, createRng(scheduleStream(seed32, season)));
  const perWeek = new Map<number, number>();
  const ids = fixtures.map((f) => {
    const n = (perWeek.get(f.week) ?? 0) + 1;
    perWeek.set(f.week, n);
    return `G${String(season)}W${String(f.week).padStart(2, '0')}${String(n).padStart(3, '0')}`;
  });
  await db`
    insert into public.season_schedule (
      save_id, game_id, season, week, competition, home_team_id, away_team_id, status, data_class)
    select ${saveId}, u.game_id, ${season}, u.week, 'REGULAR', u.home, u.away, 'SCHEDULED',
           ${ENGINE_DATA_CLASS}
      from unnest(${ids}::text[], ${fixtures.map((f) => f.week)}::int[],
                  ${fixtures.map((f) => f.homeTeamId)}::text[],
                  ${fixtures.map((f) => f.awayTeamId)}::text[]) as u(game_id, week, home, away)`;
}

