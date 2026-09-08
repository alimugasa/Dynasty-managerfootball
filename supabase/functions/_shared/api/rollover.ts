// The offseason, on the server.
//
// The season just played is closed out -- its table into league_history, the
// engine's grades into player_season_grades, the summaries refreshed -- then
// the engine runs its offseason (development, retirement, the draft, the
// market, compliance) and the new world is projected: every roster, contract
// and cap sheet rewritten, a schedule for the new year, an opening table, the
// managed club's depth chart rebuilt from the roster it now has. One
// transaction.
//
// The transaction log is a diff of the league before and after, joined to
// what the engine reports (picks, signings, retirements). It names what the
// engine did; it does not guess a kind for a move the engine did not report
// (an expired contract is not a release, and is not logged as one).

import type { Db } from './db.ts';
import { badRequest } from './context.ts';
import { offseasonStream, rngSeed32, scheduleStream, seasonWeeks, touchSave, type SaveRow } from './save.ts';
import { loadEngineState, PostgresSaveStore, writeLedger } from './saveStore.ts';
import {
  defaultDepthChart, positionsFor, projectWorld, seedStandings, writeDepthChart,
} from './project/index.ts';
import {
  draftedMap, logTransactions, recordDraft, snapshotPlayers, type TransactionCounts,
} from './project/transactions.ts';
import { createRng } from '../engine/rng.ts';
import { permuteSchedule } from '../engine/season.ts';
import { runOffseason } from '../engine/offseason/population.ts';
import { createLedger } from '../engine/news/index.ts';
import { serialize } from '../save/index.ts';
import { ENGINE_VERSION } from './createSave.ts';
import { ENGINE_DATA_CLASS } from './project/players.ts';

/** Seasons of per-game lines kept beside the current one. See 0017. */
export const GAME_LINE_RETENTION = 3;

export interface SeasonOutcome {
  readonly season: number;
  readonly week: number;
  readonly phase: string;
  readonly retired: number;
  readonly drafted: number;
  readonly signed: number;
  /** Rows written to transactions, by kind. */
  readonly transactions: TransactionCounts;
}

async function closeSeason(db: Db, saveId: string, season: number, meanOverall: Map<string, number>): Promise<void> {
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
async function writeSchedule(
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

export async function advanceSeason(db: Db, save: SaveRow): Promise<SeasonOutcome> {
  const { id: saveId, season } = save;
  if (save.phase !== 'OFFSEASON') {
    throw badRequest(`The ${String(season)} season is not complete (week ${String(save.week)})`);
  }
  const weeks = await seasonWeeks(db, saveId, season);
  const { league } = await loadEngineState(db, saveId);
  const seed32 = rngSeed32(save.rng_seed);

  // Games missed carry onto the player so the offseason's injury-driven
  // decline has something to read. Counted from the lines actually written.
  const played = await db<{ player_id: string; n: string }[]>`
    select player_id, count(*) as n from public.player_game_stats
     where save_id = ${saveId} and season = ${season} group by player_id`;
  const playedBy = new Map(played.map((r) => [r.player_id, Number(r.n)]));
  for (const p of league.players) {
    if (p.teamId === null || p.retired) continue;
    p.gamesMissedSeason = Math.max(0, weeks - (playedBy.get(p.id) ?? 0));
    p.gamesMissedCareer += p.gamesMissedSeason;
  }

  const meanOverall = new Map<string, number>();
  for (const teamId of league.teamIds) {
    const squad = league.players.filter((p) => p.teamId === teamId && !p.retired);
    meanOverall.set(teamId, Math.round(
      (squad.reduce((a, p) => a + p.ability, 0) / Math.max(1, squad.length)) * 100) / 100);
  }
  await closeSeason(db, saveId, season, meanOverall);

  const before = snapshotPlayers(league);
  const positions = await positionsFor(db, saveId);
  const result = runOffseason(league, createRng(offseasonStream(seed32, season)));
  if (league.season !== season + 1) {
    throw new Error(`Offseason left the league at ${String(league.season)}, expected ${String(season + 1)}`);
  }

  await db`
    insert into public.player_season_grades (
      save_id, season, competition, player_id, team_id, position, snaps, grade, grade_z)
    select ${saveId}, ${season}, 'REGULAR', u.player_id, u.team_id, u.position, null, u.grade, u.grade_z
      from unnest(${result.grades.map((g) => g.playerId)}::text[],
                  ${result.grades.map((g) => before.get(g.playerId)?.teamId ?? null)}::text[],
                  ${result.grades.map((g) => positions.get(g.playerId)?.position ?? null)}::text[],
                  ${result.grades.map((g) => Math.min(100, Math.max(0, g.grade)))}::numeric[],
                  ${result.grades.map((g) => g.gradeZ)}::numeric[])
        as u(player_id, team_id, position, grade, grade_z)
    on conflict (save_id, season, competition, player_id) do update
      set grade = excluded.grade, grade_z = excluded.grade_z, team_id = excluded.team_id`;

  // Players first, then the picks that reference them.
  await projectWorld(db, saveId, league, {
    previousIds: new Set(before.keys()), drafted: draftedMap(result.draft), retired: result.retired,
  });
  await recordDraft(db, saveId, league, result.draft);
  const transactions = await logTransactions(db, saveId, season, league, before, result);

  await writeSchedule(db, saveId, league.season, league.teamIds, seed32);
  await seedStandings(db, saveId, league.season, league.teamIds);
  await writeDepthChart(db, saveId, save.user_team_id, defaultDepthChart(league, save.user_team_id));

  await touchSave(db, saveId, { season: league.season, week: 1, phase: 'REGULAR_SEASON' });
  await db`select public.refresh_player_career_totals(${saveId}::uuid)`;
  await db`select public.prune_player_game_stats(${saveId}::uuid, ${GAME_LINE_RETENTION})`;

  const now = new Date().toISOString();
  await new PostgresSaveStore(db).write(saveId, serialize(league, {
    meta: {
      saveId, name: save.name, userTeamId: save.user_team_id,
      season: league.season, week: 1, phase: 'REGULAR_SEASON',
      seed: seed32, engineVersion: ENGINE_VERSION, createdAt: now, updatedAt: now,
    },
  }));
  await writeLedger(db, saveId, createLedger(league.season));

  return {
    season: league.season, week: 1, phase: 'REGULAR_SEASON',
    retired: result.retired.length, drafted: result.draft.picks.length,
    signed: (transactions['FREE_AGENT_SIGNING'] ?? 0) + (transactions['RE_SIGNING'] ?? 0),
    transactions,
  };
}
