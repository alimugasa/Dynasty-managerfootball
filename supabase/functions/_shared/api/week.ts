// One week of football, on the server.
//
// Load the engine's state, play the week's fixtures, and land every outcome:
// scorelines and team box scores in game_results, every stat line in
// player_game_stats, the season totals rolled up, the table recomputed, the
// injuries recorded, the week's stories written, and the save advanced. Inside
// one transaction: a week is played whole or not at all.
//
// Nothing here decides a football outcome. The engine does, from the seed's
// stream for this season and week -- the same formula the in-memory host used,
// so the move to the server changed where a week is played, not what it plays.

import type { Db } from './db.ts';
import { badRequest } from './context.ts';
import { gameStream, newsStream, rngSeed32, seasonWeeks, touchSave, type SaveRow } from './save.ts';
import { loadEngineState, writeLedger } from './saveStore.ts';
import { readDepthChart, type DepthChart } from './project/depthChart.ts';
import { recomputeStandings } from './project/standings.ts';
import {
  absentPlayers, insertGameResult, rollUpSeasonStats, upsertInjuries,
  type InjuryRow, type PlayedGame,
} from './project/stats.ts';
import { buildWeekNews, insertNews } from './news.ts';
import { createRng } from '../engine/rng.ts';
import { simulateGame } from '../engine/simulateGame.ts';
import { teamStatesFor } from '../engine/careerBridge.ts';
import { MissingUnitError, POSITION_GROUPS, type PositionGroup, type TeamState } from '../engine/types.ts';
import { cloneLedger, generateWeeklyNews } from '../engine/news/index.ts';

export interface WeekOutcome {
  readonly season: number;
  /** The week the save is now at. */
  readonly week: number;
  readonly phase: string;
  readonly played: number;
  /** Fixtures no side could be fielded for, named so the client can say so. */
  readonly abandoned: readonly string[];
}

interface FixtureRow { game_id: string; home_team_id: string; away_team_id: string }

/** The user's chosen order, applied to the club they manage. Everyone else
 *  gets the engine's own ordering. Filtered against the roster so a chart
 *  saved before a cut names nobody who has gone, and anyone in the group but
 *  missing from the chart is appended rather than left off the field. */
function withUserDepthChart(
  teams: Map<string, TeamState>, userTeamId: string, chart: DepthChart,
): Map<string, TeamState> {
  const team = teams.get(userTeamId);
  if (team === undefined) return teams;
  const onRoster = new Set(team.players.map((p) => p.id));
  const merged = {} as Record<PositionGroup, readonly string[]>;
  for (const group of POSITION_GROUPS) {
    const chosen = (chart[group] ?? []).filter((id) => onRoster.has(id));
    const rest = team.depthChart[group]?.filter((id) => !chosen.includes(id)) ?? [];
    merged[group] = [...chosen, ...rest];
  }
  teams.set(userTeamId, { ...team, depthChart: merged });
  return teams;
}

function withoutAbsent(team: TeamState, out: ReadonlySet<string>): TeamState {
  if (out.size === 0) return team;
  const depthChart = {} as Record<PositionGroup, string[]>;
  for (const group of POSITION_GROUPS) {
    depthChart[group] = [...(team.depthChart[group] ?? [])].filter((id) => !out.has(id));
  }
  return { ...team, depthChart };
}

export async function playWeek(db: Db, save: SaveRow): Promise<WeekOutcome> {
  const { id: saveId, season, week } = save;
  if (save.phase !== 'REGULAR_SEASON') {
    throw badRequest(`The ${String(season)} season is complete; run the offseason`);
  }
  const weeks = await seasonWeeks(db, saveId, season);
  if (week > weeks) throw badRequest(`Week ${String(week)} is past the end of the schedule`);

  const { league, ledger } = await loadEngineState(db, saveId);
  const seed32 = rngSeed32(save.rng_seed);
  const fixtures = await db<FixtureRow[]>`
    select game_id, home_team_id, away_team_id from public.season_schedule
     where save_id = ${saveId} and season = ${season} and week = ${week}
       and competition = 'REGULAR'
     order by game_id`;
  const chart = await readDepthChart(db, saveId, save.user_team_id);
  const out = await absentPlayers(db, saveId, season, week);

  const teams = withUserDepthChart(
    teamStatesFor(league.teamIds, league.players, { fronts: league.fronts }),
    save.user_team_id, chart);
  const rng = createRng(gameStream(seed32, season, week));

  const played: PlayedGame[] = [];
  const abandoned: string[] = [];
  const injuries: InjuryRow[] = [];
  for (const f of fixtures) {
    const home = teams.get(f.home_team_id);
    const away = teams.get(f.away_team_id);
    if (home === undefined || away === undefined) {
      throw new Error(`Fixture ${f.game_id} names a club the league does not hold`);
    }
    let result;
    try {
      result = simulateGame(withoutAbsent(home, out), withoutAbsent(away, out), rng, { allowTie: true });
    } catch (error) {
      if (error instanceof MissingUnitError) {
        abandoned.push(`${f.home_team_id} v ${f.away_team_id} (${error.group})`);
        continue;
      }
      throw error;
    }
    const game: PlayedGame = { gameId: f.game_id, season, week, result };
    played.push(game);
    await insertGameResult(db, saveId, game);
    for (const injury of result.injuries) {
      if (injury.returnsThisGame) continue;
      const seasonEnding = injury.severity === 'seasonEnding';
      injuries.push({
        playerId: injury.playerId, teamId: injury.teamId, severity: injury.severity,
        weeksOut: seasonEnding ? weeks - week + 1 : Math.max(1, injury.weeksOut),
        seasonEnding,
      });
    }
  }

  if (played.length > 0) {
    await db`
      update public.season_schedule set status = 'FINAL'
       where save_id = ${saveId} and game_id = any(${played.map((g) => g.gameId)}::text[])`;
  }
  await upsertInjuries(db, saveId, season, week, injuries);
  await rollUpSeasonStats(db, saveId, season);
  const standings = await recomputeStandings(db, saveId, season);

  const input = await buildWeekNews(db, saveId, {
    season, week, weeks, league, teams, played, injuries, standings,
  });
  const nextLedger = cloneLedger(ledger);
  const items = generateWeeklyNews(input, nextLedger, createRng(newsStream(seed32, season, week)));
  await insertNews(db, saveId, items);
  await writeLedger(db, saveId, nextLedger);

  const nextWeek = week + 1;
  const phase = nextWeek > weeks ? 'OFFSEASON' : 'REGULAR_SEASON';
  await touchSave(db, saveId, { week: Math.min(nextWeek, weeks + 1), phase });

  return { season, week: nextWeek, phase, played: played.length, abandoned };
}
