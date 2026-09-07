// Engine data types. Deliberately independent of the database schema: the engine
// takes plain values and returns plain values, so it can be driven from a
// migration-shaped row, a test fixture or a golden file without change. Mapping
// from `players` / `team_depth_charts` lives outside the engine.

/** Position groups the engine reasons about. Team strength is computed per
 *  group and combined into unit ratings; there is no single team "overall". */
export type PositionGroup =
  | 'QB' | 'RB' | 'WR' | 'TE' | 'OL'
  | 'EDGE' | 'DT' | 'LB' | 'CB' | 'S'
  | 'K' | 'P';

export const POSITION_GROUPS: readonly PositionGroup[] = [
  'QB', 'RB', 'WR', 'TE', 'OL', 'EDGE', 'DT', 'LB', 'CB', 'S', 'K', 'P',
] as const;

/** How many of each group are on the field for a base snap. */
export const STARTERS: Readonly<Record<PositionGroup, number>> = {
  QB: 1, RB: 1, WR: 3, TE: 1, OL: 5,
  EDGE: 2, DT: 2, LB: 3, CB: 3, S: 2,
  K: 1, P: 1,
};

/** `overall` is required. Every other rating is an optional refinement: when a
 *  detailed rating is absent the engine uses `overall` for that skill. That is a
 *  documented substitution, not an invented value, and it is the only place the
 *  engine tolerates a missing input. A missing *player* is never substituted --
 *  see MissingUnitError. */
export interface PlayerRatings {
  readonly overall: number;
  readonly passBlock?: number;
  readonly runBlock?: number;
  readonly passRush?: number;
  readonly runStop?: number;
  readonly coverage?: number;
  readonly tackling?: number;
  readonly catching?: number;
  readonly routeRunning?: number;
  readonly elusiveness?: number;
  readonly breakTackle?: number;
  readonly accuracy?: number;
  readonly decisionMaking?: number;
  readonly pocketPresence?: number;
  readonly kickAccuracy?: number;
  readonly kickPower?: number;
  readonly puntPower?: number;
}

export type SkillKey = Exclude<keyof PlayerRatings, 'overall'>;

export interface EnginePlayer {
  readonly id: string;
  readonly name: string;
  readonly group: PositionGroup;
  readonly ratings: PlayerRatings;
  /** 0-99. Lowers injury probability per snap. */
  readonly durability: number;
  /** 0-99. Raises the snap count a player absorbs before fatigue bites. */
  readonly stamina: number;
}

export interface SchemeState {
  /** 0-1. Share of neutral-situation snaps called as runs before adjustment. */
  readonly runPassBalance: number;
  /** 0-1. Raises pass rush and the variance of the result. */
  readonly blitzRate: number;
  /** 0-99. Willingness to go for it on fourth down. */
  readonly fourthDownAggression: number;
  /** 0-99. Higher tempo means less clock burned between snaps. */
  readonly tempo: number;
}

export interface CoachingState {
  readonly playCalling: number;
  readonly gameManagement: number;
  readonly clockManagement: number;
  readonly aggressiveness: number;
}

export interface TeamState {
  readonly id: string;
  readonly abbreviation: string;
  readonly players: readonly EnginePlayer[];
  /** Ordered player ids per group, starters first. */
  readonly depthChart: Readonly<Record<PositionGroup, readonly string[]>>;
  readonly scheme: SchemeState;
  readonly coaching: CoachingState;
}

export interface Weather {
  /** Miles per hour. Suppresses deep passing and kicking. */
  readonly wind: number;
  /** 0-1 severity. */
  readonly cold: number;
  /** 0-1 severity. */
  readonly precipitation: number;
}

export const CLEAR_WEATHER: Weather = { wind: 0, cold: 0, precipitation: 0 };

export interface GameOptions {
  /** Neutral sites remove home-field advantage entirely. */
  readonly neutralSite?: boolean;
  /** Playoff games may not end level; regular-season games may. */
  readonly allowTie?: boolean;
  readonly weather?: Weather;
}

export type Side = 'home' | 'away';

export type PlayType =
  | 'run' | 'pass' | 'punt' | 'fieldGoal' | 'extraPoint'
  | 'kickoff' | 'kneel' | 'spike' | 'penalty';

export type PlayOutcome =
  | 'gain' | 'incomplete' | 'sack' | 'scramble' | 'interception' | 'fumble'
  | 'touchdown' | 'fieldGoalGood' | 'fieldGoalMissed' | 'extraPointGood'
  | 'extraPointMissed' | 'punt' | 'touchback' | 'turnoverOnDowns'
  | 'safety' | 'kneel' | 'spike' | 'endOfPeriod' | 'falseStart';

export type InjurySeverity = 'minor' | 'shortTerm' | 'majorTerm' | 'seasonEnding';

export interface InjuryEvent {
  readonly playerId: string;
  readonly teamId: string;
  readonly severity: InjurySeverity;
  /** 0 for an injury the player returns from inside the same game. */
  readonly weeksOut: number;
  readonly returnsThisGame: boolean;
}

/** One snap. The full ordered list is the game's narrative and is what the
 *  box score is derived from -- the box score is never accumulated separately,
 *  so the two cannot disagree. */
export interface PlayEvent {
  readonly index: number;
  readonly quarter: number;
  /** Seconds remaining in the quarter when the ball was snapped. */
  readonly clock: number;
  readonly offense: string;
  readonly defense: string;
  readonly down: number;
  readonly distance: number;
  /** Yards from the offense's own goal line. 75 means 25 yards to go. */
  readonly yardLine: number;
  readonly playType: PlayType;
  readonly outcome: PlayOutcome;
  readonly yards: number;
  readonly firstDown: boolean;
  readonly points: number;
  readonly clockConsumed: number;
  /** True when the dropback ended in a sack. Recorded explicitly because a sack
   *  taken in the end zone is reported with outcome 'safety', and classifying on
   *  outcome alone would file it as a completed pass. */
  readonly sack?: true;
  readonly passer?: string;
  readonly rusher?: string;
  readonly receiver?: string;
  readonly defender?: string;
  readonly kicker?: string;
  readonly injury?: InjuryEvent;
  readonly homeScore: number;
  readonly awayScore: number;
}

export interface PlayerStatLine {
  readonly playerId: string;
  readonly teamId: string;
  snaps: number;
  passAttempts: number;
  completions: number;
  passYards: number;
  passTouchdowns: number;
  interceptionsThrown: number;
  sacksTaken: number;
  rushes: number;
  rushYards: number;
  rushTouchdowns: number;
  targets: number;
  receptions: number;
  receivingYards: number;
  receivingTouchdowns: number;
  tackles: number;
  sacks: number;
  interceptions: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  extraPointsMade: number;
  extraPointsAttempted: number;
  punts: number;
  puntYards: number;
}

export interface TeamBoxScore {
  readonly teamId: string;
  score: number;
  plays: number;
  passAttempts: number;
  completions: number;
  passYards: number;
  passTouchdowns: number;
  interceptionsThrown: number;
  sacksAllowed: number;
  rushes: number;
  rushYards: number;
  rushTouchdowns: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  turnovers: number;
  firstDowns: number;
  thirdDownAttempts: number;
  thirdDownConversions: number;
  possessionSeconds: number;
  drives: number;
}

export interface GameResult {
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly homeScore: number;
  readonly awayScore: number;
  readonly overtime: boolean;
  readonly tied: boolean;
  readonly weather: Weather;
  readonly plays: readonly PlayEvent[];
  readonly home: TeamBoxScore;
  readonly away: TeamBoxScore;
  readonly players: readonly PlayerStatLine[];
  readonly injuries: readonly InjuryEvent[];
}

/** Thrown when a team cannot field a unit. The engine never substitutes a
 *  replacement-level phantom player: an empty depth chart is a data problem and
 *  is reported as one. ARCHITECTURE.md rule 3. */
export class MissingUnitError extends Error {
  // Declared as fields rather than constructor parameter properties: parameter
  // properties emit code, so they cannot be erased by a type-stripping runtime.
  // Written this way the engine runs unbundled under plain Node and under Deno,
  // which is what lets the reporting harness fan it out across worker threads.
  readonly teamId: string;
  readonly group: PositionGroup;

  constructor(teamId: string, group: PositionGroup) {
    super(`Team ${teamId} has no available ${group}`);
    this.name = 'MissingUnitError';
    this.teamId = teamId;
    this.group = group;
  }
}
