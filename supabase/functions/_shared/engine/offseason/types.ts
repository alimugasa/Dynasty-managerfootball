// Career-level player model.
//
// The game engine's EnginePlayer is what takes a snap: ratings, durability,
// stamina. This is what has a career: it ages, develops, gets hurt, builds a
// reputation and eventually retires. They are separate types because they change
// on different clocks -- one per snap, one per year -- and because keeping the
// career fields out of the game engine is what keeps the game engine pure.
//
// Three quantities are tracked separately and must never be collapsed into one:
//
//   ability     what the player can actually do. Moves only in the offseason.
//   grade       what he did this season. A noisy realisation of ability.
//   reputation  what everyone thinks he can do. Lags ability, and is what the
//               market pays for.
//
// A game in which these are the same number has no scouting, no breakouts, no
// bad contracts and no reason to disagree with anyone.

import type { PositionGroup } from '../types.ts';

export interface CareerAccolades {
  allLeague: number;
  awards: number;
  rings: number;
}

export interface CareerPlayer {
  readonly id: string;
  readonly name: string;
  readonly group: PositionGroup;
  /** Club holding his rights, or null for a free agent. */
  teamId: string | null;

  /** True current ability, 0-99. The only thing the game engine reads. */
  ability: number;
  /** Ceiling this player could reach. Never observed directly by a club. */
  potential: number;
  /** Accrued experience, added to ability for grading and for on-field use.
   *  Keeps rising after the athletic peak, which is why a 34-year-old
   *  quarterback declines more slowly than a 30-year-old corner. */
  mental: number;
  /** Market perception. Chases ability without catching it. */
  reputation: number;

  age: number;
  experience: number;

  /** Individual growth speed. Two prospects with identical ratings develop at
   *  different rates, which is most of what makes drafting hard. */
  devRate: number;
  workEthic: number;
  durability: number;
  footballIq: number;

  gamesMissedCareer: number;
  gamesMissedSeason: number;

  accolades: CareerAccolades;
  retired: boolean;
  retiredInSeason: number | null;
}

export interface Prospect {
  readonly id: string;
  readonly name: string;
  readonly group: PositionGroup;
  readonly draftYear: number;
  ability: number;
  potential: number;
  age: number;
  devRate: number;
  workEthic: number;
  durability: number;
  footballIq: number;
}

/** What a player did in one season. Grade is deliberately not derived from the
 *  box score: a lineman has no statistics and still has a season. */
export interface SeasonGrade {
  readonly playerId: string;
  readonly season: number;
  /** Ability the player held during the season being graded. Recorded on the
   *  grade because development moves ability immediately afterwards, and a
   *  grade compared against the wrong year's rating measures nothing. */
  readonly ability: number;
  /** 0-99.9 on the published scale. */
  readonly grade: number;
  /** Standardised, for aggregation and for the correlation checks. */
  readonly gradeZ: number;
  readonly snaps: number;
}

export interface DevelopmentOutcome {
  readonly playerId: string;
  readonly before: number;
  readonly after: number;
  readonly delta: number;
  /** Growth of at least this much marks a genuine breakout year. */
  readonly breakout: boolean;
  /** A young player who went backwards, or stood still against expectation. */
  readonly bust: boolean;
}

export interface OffseasonSummary {
  readonly season: number;
  readonly retired: number;
  readonly drafted: number;
  readonly developed: number;
  readonly meanAbility: number;
  readonly meanAge: number;
  readonly breakouts: number;
  readonly busts: number;
}
