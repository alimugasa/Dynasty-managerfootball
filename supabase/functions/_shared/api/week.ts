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
  gameStream, newsStream, postseasonStream, rngSeed32, seasonWeeks, touchSave,
  tradeStream, type SaveRow,
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
import { resolveWaivers, waiverStories } from './waiverResolution.ts';
import { refreshWaiverPriority } from './waivers.ts';
import { cpuMarketRound, logCpuMoves } from './cpuMarket.ts';
import { cpuTradeRound } from './cpuTrades.ts';
import { deadlineRecap, rumourStories } from './tradeNews.ts';
import { resultStory } from './franchiseNews.ts';
import { resultFacts } from './franchiseNewsFacts.ts';
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

export interface WeekGames {
  readonly played: PlayedGame[];
  readonly abandoned: string[];
  readonly injuries: InjuryRow[];
}

/** Plays the fixtures and writes each result as it lands. A regular-season or
 *  preseason fixture nobody can field is abandoned and named; a playoff fixture
 *  cannot be, because the bracket has nowhere to go without it.
 *
 *  Exported for the preseason runner, which plays games the same way and books
 *  them completely differently. */
export async function playFixtures(
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
        // Only a bracket game must have a winner; August may end level.
        allowTie: competition !== 'PLAYOFF', neutralSite: f.neutral_site,
      });
    } catch (error) {
      if (error instanceof MissingUnitError && competition !== 'PLAYOFF') {
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
  // Before a ball is kicked: settle every claim window whose deadline has
  // passed. A player claimed this morning plays for his new club this
  // afternoon, which is the only ordering that makes a waiver claim worth
  // making -- resolving after the games would hand a manager a player for a
  // week that had already been played.
  const awards = await resolveWaivers(db, save, week);
  await insertNews(db, saveId, await waiverStories(db, save, awards));

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
  // The engine writes about whatever was remarkable in the league. This adds
  // the one story that is always about the club being managed, so the feed has
  // a spine running down it rather than only the weeks something happened to
  // somebody else. Null on a bye, or on a round this club is not in.
  const mine = await resultFacts(
    db, saveId, season, week, save.phase, save.user_team_id,
    games.played.map((g) => ({
      gameId: g.gameId,
      homeTeamId: g.result.homeTeamId, awayTeamId: g.result.awayTeamId,
      homeScore: g.result.homeScore, awayScore: g.result.awayScore,
      overtime: g.result.overtime,
    })),
    standings.get(save.user_team_id));
  await insertNews(db, saveId, mine === null ? items : [...items, resultStory(mine)]);
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

  // The other thirty-one clubs work the market, now the week's injuries are on
  // record: a club that lost a starter this afternoon is short at that
  // position from this moment, and looks for a replacement from it.
  //
  // After the save has been moved on, not before, and that ordering is the
  // whole point. A club that releases a player here posts him to the wire in
  // the week the manager is about to play -- so the manager opens the Waiver
  // Wire screen and can actually claim him. Running this before the save
  // advanced posted every computer-run club's cuts under the week that had
  // just finished, which meant their windows were already shut by the time
  // anybody could see them: the wire filled up and emptied between screens,
  // and no claim was ever possible on any of it.
  if (competition === 'REGULAR') {
    const next: SaveRow = { ...save, week: nextWeek, phase };
    await logCpuMoves(db, next, await cpuMarketRound(db, next, nextWeek, weeks));
    // The league's own trading, and the noise around it. Same ordering as the
    // market round and for the same reason: an offer made to the manager has
    // to arrive in a week they can still answer it in.
    await cpuTradeRound(db, next, createRng(tradeStream(seed32, season, nextWeek)));
    await insertNews(db, saveId, await rumourStories(db, next));
    await insertNews(db, saveId, await deadlineRecap(db, next));
    // The queue follows the table. Recomputed after the round rather than
    // before it, so a club awarded a player this week keeps the place at the
    // back that the award gave it until the table itself moves it.
    await refreshWaiverPriority(db, saveId, season);
  }

  return { season, week: nextWeek, phase, played: games.played.length, abandoned: games.abandoned, champion };
}
