// One week of football, on the server.
//
// Load the engine's state, play the week's fixtures, and land every outcome:
// scorelines and team box scores in game_results, every stat line in
// player_game_stats, the season totals rolled up, the table recomputed, the
// injuries recorded, the week's stories written, and the save advanced. Inside
// one transaction: a week is played whole or not at all.
//
// A regular-season week and a playoff week are the same week with two
// differences: a playoff game cannot end level and does not count in the
// table, and what comes after it is the next round rather than the next
// week. When the last regular week is played the table is seeded and the
// Opening Round set (postseason.ts); when the final is played the season is
// over and the book is written.
//
// Nothing here decides a football outcome. The engine does, from the seed's
// stream for this season and week -- the same formula the in-memory host used,
// so the move to the server changed where a week is played, not what it plays.

import type { Db } from './db.ts';
import { badRequest } from './context.ts';
import {
  gameStream, newsStream, postseasonStream, rngSeed32, seasonWeeks, touchSave, type SaveRow,
} from './save.ts';
import { loadEngineState, writeLedger } from './saveStore.ts';
import { readDepthChart, type DepthChart } from './project/depthChart.ts';
import { recomputeStandings } from './project/standings.ts';
import {
  absentPlayers, insertGameResult, rollUpSeasonStats, upsertInjuries,
  type Competition, type InjuryRow, type PlayedGame,
} from './project/stats.ts';
import { advanceBracket, PLAYOFF_WEEKS, seedPostseason } from './postseason.ts';
import { buildWeekNews, insertNews } from './news.ts';
import { createRng, type Rng } from '../engine/rng.ts';
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
  /** Set by the week the final is played. */
  readonly champion: string | null;
}

interface FixtureRow {
  game_id: string; home_team_id: string; away_team_id: string; neutral_site: boolean;
}

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

interface WeekGames {
  readonly played: PlayedGame[];
  readonly abandoned: string[];
  readonly injuries: InjuryRow[];
}

/** Plays the fixtures and writes each result as it lands. A regular-season
 *  fixture nobody can field is abandoned and named; a playoff fixture cannot
 *  be, because the bracket has nowhere to go without it. */
async function playFixtures(
  db: Db, saveId: string, season: number, week: number, lastWeek: number,
  competition: Competition, fixtures: readonly FixtureRow[],
  teams: ReadonlyMap<string, TeamState>, out: ReadonlySet<string>, rng: Rng,
): Promise<WeekGames> {
  const games: WeekGames = { played: [], abandoned: [], injuries: [] };
  for (const f of fixtures) {
    const home = teams.get(f.home_team_id);
    const away = teams.get(f.away_team_id);
    if (home === undefined || away === undefined) {
      throw new Error(`Game ${f.game_id} names a team the league does not hold`);
    }
    let result;
    try {
      result = simulateGame(withoutAbsent(home, out), withoutAbsent(away, out), rng, {
        allowTie: competition === 'REGULAR', neutralSite: f.neutral_site,
      });
    } catch (error) {
      if (error instanceof MissingUnitError && competition === 'REGULAR') {
        games.abandoned.push(`${f.home_team_id} vs ${f.away_team_id} (${error.group})`);
        continue;
      }
      if (error instanceof MissingUnitError) {
        throw new Error(`Playoff game ${f.home_team_id} vs ${f.away_team_id} cannot be played: no ${error.group}`);
      }
      throw error;
    }
    const game: PlayedGame = { gameId: f.game_id, season, week, competition, result };
    games.played.push(game);
    await insertGameResult(db, saveId, game);
    for (const injury of result.injuries) {
      if (injury.returnsThisGame) continue;
      const seasonEnding = injury.severity === 'seasonEnding';
      games.injuries.push({
        playerId: injury.playerId, teamId: injury.teamId, severity: injury.severity,
        weeksOut: seasonEnding ? lastWeek - week + 1 : Math.max(1, injury.weeksOut),
        seasonEnding,
      });
    }
  }
  return games;
}

export async function playWeek(db: Db, save: SaveRow): Promise<WeekOutcome> {
  const { id: saveId, season, week } = save;
  if (save.phase !== 'REGULAR_SEASON' && save.phase !== 'PLAYOFFS') {
    throw badRequest(`The ${String(season)} season is complete; run the offseason`);
  }
  const competition: Competition = save.phase === 'PLAYOFFS' ? 'PLAYOFF' : 'REGULAR';
  const weeks = await seasonWeeks(db, saveId, season);
  const lastWeek = weeks + PLAYOFF_WEEKS;
  if (week > lastWeek) throw badRequest(`Week ${String(week)} is past the end of the schedule`);

  const { league, ledger } = await loadEngineState(db, saveId);
  const seed32 = rngSeed32(save.rng_seed);
  const fixtures = await db<FixtureRow[]>`
    select game_id, home_team_id, away_team_id, neutral_site from public.season_schedule
     where save_id = ${saveId} and season = ${season} and week = ${week}
       and competition = ${competition}
     order by game_id`;
  if (competition === 'PLAYOFF' && fixtures.length === 0) {
    throw new Error(`Week ${String(week)} of the ${String(season)} playoffs has no games written`);
  }
  const chart = await readDepthChart(db, saveId, save.user_team_id);
  const out = await absentPlayers(db, saveId, season, week);

  const teams = withUserDepthChart(
    teamStatesFor(league.teamIds, league.players,
      { fronts: league.fronts, coaches: league.coaches }),
    save.user_team_id, chart);
  const rng = createRng(gameStream(seed32, season, week));
  const games = await playFixtures(
    db, saveId, season, week, lastWeek, competition, fixtures, teams, out, rng);

  if (games.played.length > 0) {
    await db`
      update public.season_schedule set status = 'FINAL'
       where save_id = ${saveId} and game_id = any(${games.played.map((g) => g.gameId)}::text[])`;
  }
  await upsertInjuries(db, saveId, season, week, games.injuries);
  await rollUpSeasonStats(db, saveId, season);
  const standings = await recomputeStandings(db, saveId, season);

  const input = await buildWeekNews(db, saveId, {
    season, week, weeks, phase: save.phase, league, teams,
    played: games.played, injuries: games.injuries, standings,
  });
  const nextLedger = cloneLedger(ledger);
  const items = generateWeeklyNews(input, nextLedger, createRng(newsStream(seed32, season, week)));
  await insertNews(db, saveId, items);
  await writeLedger(db, saveId, nextLedger);

  // What follows this week: the next regular week, the seeded bracket, the
  // next round, or the offseason.
  const nextWeek = week + 1;
  let phase = 'REGULAR_SEASON';
  let champion: string | null = null;
  if (competition === 'REGULAR' && nextWeek > weeks) {
    await seedPostseason(db, saveId, season, nextWeek, createRng(postseasonStream(seed32, season)));
    phase = 'PLAYOFFS';
  } else if (competition === 'PLAYOFF') {
    champion = await advanceBracket(db, saveId, season, week);
    phase = champion === null ? 'PLAYOFFS' : 'OFFSEASON';
  }
  await touchSave(db, saveId, { week: nextWeek, phase });

  return { season, week: nextWeek, phase, played: games.played.length, abandoned: games.abandoned, champion };
}
