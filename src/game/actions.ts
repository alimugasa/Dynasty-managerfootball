// What the buttons do.
//
// Each action takes the state and returns the next one. Nothing mutates in
// place except the league object the engine owns, which the engine mutates by
// design -- so a new state object is returned every time to make React see it.

import {
  POSITION_GROUPS, type PositionGroup,
} from '../../supabase/functions/_shared/engine/types';
import type { TeamState } from '../../supabase/functions/_shared/engine/types';
import { detectAll } from '../../supabase/functions/_shared/engine/news/detectors';
import type { WeekInput } from '../../supabase/functions/_shared/engine/news/types';
import { buildSchedule } from '../../supabase/functions/_shared/engine/season';
import {
  MissingUnitError, WEEKS, cloneLedger, createLedger, createRng, defaultDepthChart,
  generateWeeklyNews, runOffseason, simulateGame, teamStatesFor,
  type GameState, type NewsLedger, type PlayedGame, type Standing,
} from './store';

/** The user's chosen order, applied to the club they manage. Everyone else
 *  gets the engine's own ordering from teamStatesFor. */
function withUserDepthChart(
  teams: Map<string, TeamState>, state: GameState,
): Map<string, TeamState> {
  const team = teams.get(state.userTeamId);
  if (team === undefined) return teams;
  const chart = {} as Record<PositionGroup, readonly string[]>;
  const onRoster = new Set(team.players.map((p) => p.id));
  for (const group of POSITION_GROUPS) {
    // Filtered against the roster: a depth chart saved before a player was cut
    // would otherwise name someone who is not there, and the engine would field
    // a gap. Anyone in the group but missing from the saved order is appended,
    // so a newly signed player plays rather than silently sitting out.
    const chosen = (state.depthChart[group] ?? []).filter((id) => onRoster.has(id));
    const rest = team.depthChart[group]?.filter((id) => !chosen.includes(id)) ?? [];
    chart[group] = [...chosen, ...rest];
  }
  teams.set(state.userTeamId, { ...team, depthChart: chart });
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

function applyResult(
  standings: Map<string, Standing>, homeId: string, awayId: string,
  homeScore: number, awayScore: number,
): void {
  const home = standings.get(homeId);
  const away = standings.get(awayId);
  if (home === undefined || away === undefined) return;
  home.pointsFor += homeScore; home.pointsAgainst += awayScore;
  away.pointsFor += awayScore; away.pointsAgainst += homeScore;
  if (homeScore === awayScore) {
    home.ties += 1; away.ties += 1; home.streak = 0; away.streak = 0;
    return;
  }
  const homeWon = homeScore > awayScore;
  const winner = homeWon ? home : away;
  const loser = homeWon ? away : home;
  winner.wins += 1; loser.losses += 1;
  winner.streak = winner.streak > 0 ? winner.streak + 1 : 1;
  loser.streak = loser.streak < 0 ? loser.streak - 1 : -1;
}

/** Season totals so far, for the news engine's milestone and award detectors. */
function seasonTotals(results: readonly PlayedGame[]): Map<string, {
  passYards: number; rushYards: number; recYards: number; sacks: number;
}> {
  const totals = new Map<string, {
    passYards: number; rushYards: number; recYards: number; sacks: number;
  }>();
  for (const game of results) {
    for (const line of game.players) {
      const running = totals.get(line.playerId)
        ?? { passYards: 0, rushYards: 0, recYards: 0, sacks: 0 };
      running.passYards += line.passYards;
      running.rushYards += line.rushYards;
      running.recYards += line.receivingYards;
      running.sacks += line.sacks;
      totals.set(line.playerId, running);
    }
  }
  return totals;
}

export interface WeekOutcome {
  readonly state: GameState;
  /** Games that could not be played, named so the UI can say so. */
  readonly abandoned: readonly string[];
}

/**
 * Plays one week.
 *
 * The season's news ledger lives in the state and is copied before the week's
 * stories are written to it, so the previous state is left as it was and the
 * ledger persists with everything else. A ledger that reset on reload would
 * break the no-repeated-headlines guarantee the news engine exists to provide.
 */
export function simWeek(state: GameState): WeekOutcome {
  if (state.phase !== 'REGULAR_SEASON' || state.week > WEEKS) {
    return { state, abandoned: [] };
  }

  const rng = createRng(state.seed + state.season * 1000 + state.week);
  const teams = withUserDepthChart(
    teamStatesFor(state.league.teamIds, state.league.players, { fronts: state.league.fronts }),
    state,
  );

  const standings = new Map([...state.standings].map(([id, s]) => [id, { ...s }]));
  const absence = new Map(state.absence);
  const out = new Set(absence.keys());
  const results: PlayedGame[] = [...state.results];
  const abandoned: string[] = [];
  const weekGames: PlayedGame[] = [];
  const injuries: { playerId: string; severity: string; weeksOut: number }[] = [];

  for (const fixture of state.schedule.filter((f) => f.week === state.week)) {
    const home = teams.get(fixture.homeTeamId);
    const away = teams.get(fixture.awayTeamId);
    if (home === undefined || away === undefined) continue;

    let game;
    try {
      game = simulateGame(
        withoutAbsent(home, out), withoutAbsent(away, out), rng, { allowTie: true });
    } catch (error) {
      if (error instanceof MissingUnitError) {
        abandoned.push(`${fixture.homeTeamId} v ${fixture.awayTeamId} (${error.group})`);
        continue;
      }
      throw error;
    }

    const played: PlayedGame = {
      gameId: `S${String(state.season)}W${String(state.week)}_${home.id}_${away.id}`,
      week: state.week,
      homeTeamId: home.id,
      awayTeamId: away.id,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      overtime: game.overtime,
      home: game.home,
      away: game.away,
      players: game.players,
    };
    results.push(played);
    weekGames.push(played);
    applyResult(standings, home.id, away.id, game.homeScore, game.awayScore);

    for (const injury of game.injuries) {
      injuries.push(injury);
      if (injury.returnsThisGame) continue;
      const weeksOut = injury.severity === 'seasonEnding'
        ? WEEKS - state.week + 1
        : Math.max(1, injury.weeksOut);
      if (weeksOut > (absence.get(injury.playerId) ?? 0)) {
        absence.set(injury.playerId, weeksOut);
      }
    }
  }

  const ledger = cloneLedger(state.ledger);
  const news = [...state.news, ...newsFor(state, weekGames, results, standings, injuries, ledger)];

  for (const [playerId, remaining] of absence) {
    if (remaining <= 1) absence.delete(playerId);
    else absence.set(playerId, remaining - 1);
  }

  return {
    state: {
      ...state,
      week: state.week + 1,
      results,
      standings,
      absence,
      news,
      ledger,
      phase: state.week + 1 > WEEKS ? 'OFFSEASON' : 'REGULAR_SEASON',
    },
    abandoned,
  };
}

/** Builds the week's stories from what the simulation just produced. */
function newsFor(
  state: GameState,
  weekGames: readonly PlayedGame[],
  allResults: readonly PlayedGame[],
  standings: ReadonlyMap<string, Standing>,
  injuries: readonly { playerId: string; severity: string; weeksOut: number }[],
  ledger: NewsLedger,
) {
  const byId = new Map(state.league.players.map((p) => [p.id, p]));
  const totals = seasonTotals(allResults);
  const rating = (teamId: string): number => {
    const top = state.league.players
      .filter((p) => p.teamId === teamId && !p.retired)
      .map((p) => p.ability)
      .sort((a, b) => b - a)
      .slice(0, 24);
    return top.reduce((a, b) => a + b, 0) / Math.max(top.length, 1);
  };

  const weekLines = new Map<string, PlayedGame['players'][number]>();
  for (const game of weekGames) for (const line of game.players) weekLines.set(line.playerId, line);

  const input: WeekInput = {
    season: state.season,
    week: state.week,
    phase: 'REGULAR_SEASON',
    totalWeeks: WEEKS,
    games: weekGames.map((g) => ({
      gameId: g.gameId, week: g.week, homeTeamId: g.homeTeamId, awayTeamId: g.awayTeamId,
      homeScore: g.homeScore, awayScore: g.awayScore, overtime: g.overtime,
    })),
    teams: state.league.teamIds.map((id) => {
      const s = standings.get(id);
      const identity = state.identities.get(id);
      return {
        teamId: id,
        name: identity?.name ?? id,
        nickname: identity?.nickname ?? id,
        wins: s?.wins ?? 0, losses: s?.losses ?? 0, ties: s?.ties ?? 0,
        streak: s?.streak ?? 0,
        rating: rating(id),
      };
    }),
    players: [...weekLines.entries()].flatMap(([playerId, line]) => {
      const p = byId.get(playerId);
      const season = totals.get(playerId);
      if (p === undefined || season === undefined) return [];
      return [{
        playerId, name: p.name, teamId: p.teamId ?? '', position: p.group,
        gamePassYards: line.passYards, gameRushYards: line.rushYards,
        gameRecYards: line.receivingYards, gameTouchdowns: 0,
        seasonPassYards: season.passYards, seasonRushYards: season.rushYards,
        seasonRecYards: season.recYards, seasonSacks: season.sacks,
      }];
    }),
    injuries: injuries.flatMap((injury) => {
      const p = byId.get(injury.playerId);
      if (p === undefined || p.teamId === null) return [];
      return [{
        playerId: injury.playerId, name: p.name, teamId: p.teamId, position: p.group,
        severity: injury.severity as 'minor' | 'shortTerm' | 'majorTerm' | 'seasonEnding',
        weeksOut: injury.weeksOut, starter: true,
      }];
    }),
    coaches: [],
    awardRaces: [],
  };

  // Its own stream, apart from the games'. The season term matters: without it
  // week 5 of every year draws the same phrasings, which a ledger that resets
  // each season would then let through as repeats.
  return generateWeeklyNews(
    input, ledger, createRng(state.seed + state.season * 1000 + state.week * 31));
}

/** Plays every remaining week. */
export function simToEndOfSeason(state: GameState): WeekOutcome {
  let current = state;
  const abandoned: string[] = [];
  let guard = 0;
  while (current.phase === 'REGULAR_SEASON' && current.week <= WEEKS && guard < WEEKS + 2) {
    guard += 1;
    const outcome = simWeek(current);
    current = outcome.state;
    abandoned.push(...outcome.abandoned);
  }
  return { state: current, abandoned };
}

/** Rolls the season over: development, retirement, the draft and free agency. */
export function advanceToNextSeason(state: GameState): GameState {
  const season = state.season;
  const history = [
    ...state.history,
    ...[...state.standings.values()].map((s) => ({
      season, teamId: s.teamId, wins: s.wins, losses: s.losses, ties: s.ties,
    })),
  ];

  // Games missed carry onto the player so the offseason's injury-driven decline
  // has something to read.
  const played = new Map<string, number>();
  for (const game of state.results) {
    for (const line of game.players) played.set(line.playerId, (played.get(line.playerId) ?? 0) + 1);
  }
  for (const player of state.league.players) {
    if (player.teamId === null || player.retired) continue;
    player.gamesMissedSeason = Math.max(0, WEEKS - (played.get(player.id) ?? WEEKS));
    player.gamesMissedCareer += player.gamesMissedSeason;
  }

  runOffseason(state.league, createRng(state.seed + season));

  const userStillExists = state.league.teamIds.includes(state.userTeamId);
  const userTeamId = userStillExists ? state.userTeamId : (state.league.teamIds[0] ?? '');

  return {
    ...state,
    season: state.league.season,
    week: 1,
    phase: 'REGULAR_SEASON',
    schedule: buildSchedule(state.league.teamIds, WEEKS),
    results: [],
    standings: new Map(state.league.teamIds.map((id) => [id, {
      teamId: id, wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, streak: 0,
    }])),
    news: [],
    // A new year, a clean ledger: a good line coming back in 2031 is the design.
    ledger: createLedger(state.league.season),
    history,
    absence: new Map(),
    userTeamId,
    // Rebuilt from the post-offseason roster. Keeping last year's order would
    // name drafted-over, released and retired players.
    depthChart: defaultDepthChart(state.league, userTeamId),
  };
}

/** Moves a player up or down his group's order. */
export function reorderDepth(
  state: GameState, group: PositionGroup, playerId: string, direction: -1 | 1,
): GameState {
  const order = [...(state.depthChart[group] ?? [])];
  const from = order.indexOf(playerId);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= order.length) return state;
  const moved = order[from];
  const displaced = order[to];
  if (moved === undefined || displaced === undefined) return state;
  order[from] = displaced;
  order[to] = moved;
  return { ...state, depthChart: { ...state.depthChart, [group]: order } };
}

export { detectAll };
