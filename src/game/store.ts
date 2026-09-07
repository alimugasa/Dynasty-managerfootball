// The game, in the browser.
//
// The engine is pure TypeScript with no I/O, so the whole simulation runs
// client-side against it and persists through the save system to localStorage.
// There is no server call anywhere in this file, which is why the game is
// playable at all today: the Supabase write path does not exist yet.
//
// ARCHITECTURE.md rule 2 still holds. Nothing here decides a football outcome.
// It loads a league, hands it to the engine, and stores what comes back.

import { createRng } from '../../supabase/functions/_shared/engine/rng';
import {
  capRules, capSheet, runOffseason, type CapSheet,
} from '../../supabase/functions/_shared/engine/offseason/index';
import { teamStatesFor } from '../../supabase/functions/_shared/engine/careerBridge';
import { buildSchedule, type Fixture } from '../../supabase/functions/_shared/engine/season';
import { simulateGame } from '../../supabase/functions/_shared/engine/simulateGame';
import {
  MissingUnitError, POSITION_GROUPS,
  type PlayerStatLine, type PositionGroup, type TeamBoxScore,
} from '../../supabase/functions/_shared/engine/types';
import type { League } from '../../supabase/functions/_shared/engine/offseason/league';
import type { CareerPlayer } from '../../supabase/functions/_shared/engine/offseason/types';
import {
  createLedger, generateWeeklyNews, type NewsItem, type NewsLedger,
} from '../../supabase/functions/_shared/engine/news/index';
import { loadCareerWorld, FIRST_SEASON } from '../../scripts/drift-report/careerWorld';
import { readBundledSeed } from './seed';

export const WEEKS = 17;

/** A finished game, minus the play-by-play.
 *
 *  GameResult carries every PlayEvent -- roughly 150 per game, so 40,000 a
 *  season and 80,000 over the two seasons this has to survive. The box score
 *  screen shows team totals and stat lines, so the plays are dropped on the way
 *  in rather than held in memory and written to localStorage. */
export interface PlayedGame {
  readonly gameId: string;
  readonly week: number;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly homeScore: number;
  readonly awayScore: number;
  readonly overtime: boolean;
  readonly home: TeamBoxScore;
  readonly away: TeamBoxScore;
  readonly players: readonly PlayerStatLine[];
}

export interface Standing {
  teamId: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  streak: number;
}

export interface TeamIdentity {
  readonly id: string;
  readonly name: string;
  readonly nickname: string;
  readonly metro: string;
  readonly conferenceId: string;
  readonly divisionId: string;
  readonly primary: string;
  readonly secondary: string;
}

export interface SeasonHistory {
  readonly season: number;
  readonly teamId: string;
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
}

/** Everything a screen can read. Plain data, so React re-renders on replace. */
export interface GameState {
  readonly league: League;
  readonly identities: ReadonlyMap<string, TeamIdentity>;
  readonly userTeamId: string;
  readonly season: number;
  /** 1..WEEKS while playing; WEEKS + 1 once the regular season is done. */
  readonly week: number;
  readonly phase: 'REGULAR_SEASON' | 'OFFSEASON';
  readonly schedule: readonly Fixture[];
  readonly results: readonly PlayedGame[];
  readonly standings: ReadonlyMap<string, Standing>;
  readonly news: readonly NewsItem[];
  readonly history: readonly SeasonHistory[];
  /** Player ids per group for the user's club, in the order they play. */
  readonly depthChart: Readonly<Record<PositionGroup, readonly string[]>>;
  /** Weeks each player still misses. */
  readonly absence: ReadonlyMap<string, number>;
  readonly seed: number;
}

/** Club identities, parsed from teams.csv alone. Cheap, and deliberately
 *  separate from newGame: loading a save needs these but must not rebuild the
 *  2,848-player league to get them. */
export function loadIdentities(): Map<string, TeamIdentity> {
  const out = new Map<string, TeamIdentity>();
  for (const row of readBundledSeed('teams')) {
    const id = row['team_id'] ?? '';
    if (id === '') continue;
    const metro = row['metro_area'] ?? '';
    const nickname = row['nickname'] ?? '';
    out.set(id, {
      id,
      metro,
      nickname,
      name: `${metro} ${nickname}`.trim(),
      conferenceId: row['conference_id'] ?? '',
      divisionId: row['division_id'] ?? '',
      primary: row['primary_color'] ?? '#28353F',
      secondary: row['secondary_color'] ?? '#8698A8',
    });
  }
  return out;
}

const emptyStanding = (teamId: string): Standing =>
  ({ teamId, wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, streak: 0 });

function freshStandings(teamIds: readonly string[]): Map<string, Standing> {
  return new Map(teamIds.map((id) => [id, emptyStanding(id)]));
}

/** The user's club, ordered as the engine would order it. */
export function defaultDepthChart(
  league: League, teamId: string,
): Record<PositionGroup, string[]> {
  const chart = {} as Record<PositionGroup, string[]>;
  const squad = league.players
    .filter((p) => p.teamId === teamId && !p.retired)
    .sort((a, b) => (b.ability + b.mental * 0.35) - (a.ability + a.mental * 0.35));
  for (const group of POSITION_GROUPS) {
    chart[group] = squad.filter((p) => p.group === group).map((p) => p.id);
  }
  return chart;
}

export interface NewGameOptions {
  readonly userTeamId?: string;
  readonly seed?: number;
}

export function newGame(options: NewGameOptions = {}): GameState {
  const league = loadCareerWorld(readBundledSeed);
  league.season = FIRST_SEASON;
  const identities = loadIdentities();
  const userTeamId = options.userTeamId ?? league.teamIds[0] ?? '';
  const seed = options.seed ?? 20260907;

  return {
    league,
    identities,
    userTeamId,
    season: league.season,
    week: 1,
    phase: 'REGULAR_SEASON',
    schedule: buildSchedule(league.teamIds, WEEKS),
    results: [],
    standings: freshStandings(league.teamIds),
    news: [],
    history: [],
    depthChart: defaultDepthChart(league, userTeamId),
    absence: new Map(),
    seed,
  };
}

/** A club's squad, in depth-chart order for the user's club. */
export function squadOf(state: GameState, teamId: string): CareerPlayer[] {
  const squad = state.league.players.filter((p) => p.teamId === teamId && !p.retired);
  if (teamId !== state.userTeamId) {
    return squad.sort((a, b) => (b.ability + b.mental * 0.35) - (a.ability + a.mental * 0.35));
  }
  const order = new Map<string, number>();
  let i = 0;
  for (const group of POSITION_GROUPS) {
    for (const id of state.depthChart[group] ?? []) { order.set(id, i); i += 1; }
  }
  return squad.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
}

export function playerById(state: GameState, id: string): CareerPlayer | undefined {
  return state.league.players.find((p) => p.id === id);
}

export function recordOf(standing: Standing | undefined): string {
  if (standing === undefined) return '0-0';
  const base = `${String(standing.wins)}-${String(standing.losses)}`;
  return standing.ties > 0 ? `${base}-${String(standing.ties)}` : base;
}

/** Cap position for a club, re-exported so screens never import the engine. */
export function capFor(state: GameState, teamId: string): CapSheet {
  const squad = state.league.players.filter((p) => p.teamId === teamId && !p.retired);
  return capSheet(teamId, squad, capRules(state.season),
    state.league.deadMoney.get(teamId) ?? 0);
}

export function capLimit(season: number): number {
  return capRules(season).salaryCap;
}

export { MissingUnitError, createRng, runOffseason, simulateGame, teamStatesFor };
export { createLedger, generateWeeklyNews };
export type { CareerPlayer, Fixture, League, NewsItem, NewsLedger, PositionGroup };
