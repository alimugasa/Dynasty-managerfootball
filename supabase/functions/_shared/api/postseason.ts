// The postseason, on the server: seeding the table and keeping the bracket.
//
// The bracket is the schedule. When the regular season ends the fourteen
// seeds are written onto standings and the Opening Round's fixtures into
// season_schedule; each playoff week plays the fixtures it finds there and,
// from every playoff result so far, writes the next round's. Nothing is kept
// in step with anything: the seeds and the results are the state, and the
// engine derives the round from them every time.
//
// Ties on record are broken by the engine (playoffs.ts) with a coin from the
// season's own stream, so a save reloaded a year later seeds the same table
// the same way.

import type { Db } from './db.ts';
import type { Rng } from '../engine/rng.ts';
import {
  bracket, outcomes, rankClubs, seedLeague, PLAYOFF_ROUNDS,
  type ClubRecord, type PlayoffFixture, type PlayoffResult, type Result, type Seed,
} from '../engine/playoffs.ts';
import { ENGINE_DATA_CLASS } from './project/players.ts';

/** Weeks the postseason adds after the regular season. */
export const PLAYOFF_WEEKS = PLAYOFF_ROUNDS.length;

interface ClubRow {
  team_id: string; conference_id: string; division_id: string;
  wins: number; losses: number; ties: number; points_for: number; points_against: number;
  division_wins: number; division_losses: number; division_ties: number;
  conference_wins: number; conference_losses: number; conference_ties: number;
}

async function clubRecords(db: Db, saveId: string, season: number): Promise<ClubRecord[]> {
  const rows = await db<ClubRow[]>`
    select st.team_id, t.conference_id, t.division_id, st.wins, st.losses, st.ties,
           st.points_for, st.points_against,
           st.division_wins, st.division_losses, st.division_ties,
           st.conference_wins, st.conference_losses, st.conference_ties
      from public.standings st
      join public.teams t on t.save_id = st.save_id and t.team_id = st.team_id
     where st.save_id = ${saveId} and st.season = ${season}
     order by st.team_id`;
  return rows.map((r) => ({
    teamId: r.team_id, conferenceId: r.conference_id, divisionId: r.division_id,
    wins: r.wins, losses: r.losses, ties: r.ties,
    pointsFor: r.points_for, pointsAgainst: r.points_against,
    divisionWins: r.division_wins, divisionLosses: r.division_losses, divisionTies: r.division_ties,
    conferenceWins: r.conference_wins, conferenceLosses: r.conference_losses,
    conferenceTies: r.conference_ties,
  }));
}

async function regularResults(db: Db, saveId: string, season: number): Promise<Result[]> {
  const rows = await db<{ home_team_id: string; away_team_id: string; home_score: number; away_score: number }[]>`
    select home_team_id, away_team_id, home_score, away_score from public.game_results
     where save_id = ${saveId} and season = ${season} and competition = 'REGULAR'
     order by week, game_id`;
  return rows.map((r) => ({
    homeTeamId: r.home_team_id, awayTeamId: r.away_team_id,
    homeScore: r.home_score, awayScore: r.away_score,
  }));
}

/** The seeds as written when the regular season ended. Empty before then. */
export async function loadSeeds(db: Db, saveId: string, season: number): Promise<Seed[]> {
  const rows = await db<{ team_id: string; conference_id: string; conference_seed: number; playoff_status: string | null }[]>`
    select st.team_id, t.conference_id, st.conference_seed, st.playoff_status
      from public.standings st
      join public.teams t on t.save_id = st.save_id and t.team_id = st.team_id
     where st.save_id = ${saveId} and st.season = ${season} and st.conference_seed is not null
     order by t.conference_id, st.conference_seed`;
  return rows.map((r) => ({
    teamId: r.team_id, conferenceId: r.conference_id, seed: r.conference_seed,
    divisionWinner: r.playoff_status === 'CLINCHED_DIVISION' || r.playoff_status === 'CLINCHED_BYE',
  }));
}

/** Every playoff game played this season, with the round it was played in. */
export async function loadPlayoffResults(db: Db, saveId: string, season: number): Promise<PlayoffResult[]> {
  const rows = await db<{
    playoff_round: string; home_team_id: string; away_team_id: string;
    home_score: number; away_score: number; neutral_site: boolean;
  }[]>`
    select f.playoff_round, f.home_team_id, f.away_team_id, g.home_score, g.away_score, f.neutral_site
      from public.game_results g
      join public.season_schedule f on f.save_id = g.save_id and f.game_id = g.game_id
     where g.save_id = ${saveId} and g.season = ${season} and g.competition = 'PLAYOFF'
     order by g.week, g.game_id`;
  return rows.map((r) => {
    const round = PLAYOFF_ROUNDS.find((x) => x === r.playoff_round);
    if (round === undefined) throw new Error(`A playoff game carries an unknown round: ${r.playoff_round}`);
    return {
      round, homeTeamId: r.home_team_id, awayTeamId: r.away_team_id,
      homeScore: r.home_score, awayScore: r.away_score, neutralSite: r.neutral_site,
    };
  });
}

export async function writePlayoffFixtures(
  db: Db, saveId: string, season: number, week: number, fixtures: readonly PlayoffFixture[],
): Promise<void> {
  if (fixtures.length === 0) return;
  const ids = fixtures.map((_, i) =>
    `G${String(season)}W${String(week).padStart(2, '0')}${String(i + 1).padStart(3, '0')}`);
  await db`
    insert into public.season_schedule (
      save_id, game_id, season, week, competition, playoff_round, home_team_id, away_team_id,
      neutral_site, status, data_class)
    select ${saveId}, u.game_id, ${season}, ${week}, 'PLAYOFF', u.round, u.home, u.away,
           u.neutral, 'SCHEDULED', ${ENGINE_DATA_CLASS}
      from unnest(${ids}::text[], ${fixtures.map((f) => f.round)}::text[],
                  ${fixtures.map((f) => f.homeTeamId)}::text[],
                  ${fixtures.map((f) => f.awayTeamId)}::text[],
                  ${fixtures.map((f) => (f.neutralSite ? 'true' : 'false'))}::text[]::boolean[])
        as u(game_id, round, home, away, neutral)`;
}

/**
 * The regular season is over: seed the table and set the Opening Round.
 * Writes the seed, the status and the division finish onto every standings
 * row (NULL seed and ELIMINATED for the eighteen who missed), and the six
 * opening fixtures into the week after the last regular one.
 */
export async function seedPostseason(
  db: Db, saveId: string, season: number, openingWeek: number, rng: Rng,
): Promise<Seed[]> {
  const clubs = await clubRecords(db, saveId, season);
  const results = await regularResults(db, saveId, season);
  const seeds = seedLeague(clubs, results, rng);
  const seedOf = new Map(seeds.map((s) => [s.teamId, s]));

  const divisionFinish = new Map<string, number>();
  const divisions = new Set(clubs.map((c) => c.divisionId));
  for (const division of divisions) {
    rankClubs(clubs.filter((c) => c.divisionId === division), results, rng)
      .forEach((c, i) => divisionFinish.set(c.teamId, i + 1));
  }

  const status = (s: Seed | undefined): string => {
    if (s === undefined) return 'ELIMINATED';
    if (s.seed === 1) return 'CLINCHED_BYE';
    return s.divisionWinner ? 'CLINCHED_DIVISION' : 'CLINCHED_PLAYOFF';
  };
  const teamIds = clubs.map((c) => c.teamId);
  await db`
    update public.standings st
       set conference_seed = u.seed, playoff_status = u.status, eliminated = u.eliminated,
           division_rank = u.finish
      from unnest(${teamIds}::text[],
                  ${teamIds.map((id) => seedOf.get(id)?.seed ?? null)}::int[],
                  ${teamIds.map((id) => status(seedOf.get(id)))}::text[],
                  ${teamIds.map((id) => (seedOf.has(id) ? 'false' : 'true'))}::text[]::boolean[],
                  ${teamIds.map((id) => divisionFinish.get(id) ?? null)}::int[])
        as u(team_id, seed, status, eliminated, finish)
     where st.save_id = ${saveId} and st.season = ${season} and st.team_id = u.team_id`;

  const opening = bracket(seeds, []);
  await writePlayoffFixtures(db, saveId, season, openingWeek, opening.fixtures);
  return seeds;
}

/**
 * After a playoff week: the next round's fixtures into the week after, or,
 * when the final has been played, the season's book -- every club's line in
 * league_history with its seed, its division finish and how far it went.
 * Returns the champion, or null while the bracket is still open.
 */
export async function advanceBracket(
  db: Db, saveId: string, season: number, week: number,
): Promise<string | null> {
  const seeds = await loadSeeds(db, saveId, season);
  if (seeds.length === 0) throw new Error(`Season ${String(season)} has no seeds to advance a bracket from`);
  const played = await loadPlayoffResults(db, saveId, season);
  const state = bracket(seeds, played);
  if (state.champion === null) {
    await writePlayoffFixtures(db, saveId, season, week + 1, state.fixtures);
    return null;
  }
  const rows = await db<{ team_id: string; conference_seed: number | null; division_rank: number | null }[]>`
    select team_id, conference_seed, division_rank from public.standings
     where save_id = ${saveId} and season = ${season} order by team_id`;
  const result = outcomes(seeds, played, rows.map((r) => r.team_id));
  await db`
    insert into public.league_history (
      save_id, season, team_id, wins, losses, ties, points_for, points_against,
      division_finish, conference_seed, playoff_result)
    select st.save_id, st.season, st.team_id, st.wins, st.losses, st.ties,
           st.points_for, st.points_against, st.division_rank, st.conference_seed, u.result
      from public.standings st
      join unnest(${rows.map((r) => r.team_id)}::text[],
                  ${rows.map((r) => result.get(r.team_id) ?? 'MISSED')}::text[]) as u(team_id, result)
        on u.team_id = st.team_id
     where st.save_id = ${saveId} and st.season = ${season}
    on conflict (save_id, season, team_id) do update
      set division_finish = excluded.division_finish, conference_seed = excluded.conference_seed,
          playoff_result = excluded.playoff_result`;
  return state.champion;
}
