// The save document.
//
// A save is a plain data document, not a serialised object graph: no class
// instances, no Maps, no undefined, nothing whose meaning depends on the code
// that wrote it. That is what lets a document written by build 41 be read by
// build 88 after passing through the migration chain -- a migration step can
// only rewrite data it can see.
//
// Maps become records and arrays here for the same reason. League holds
// `fronts: Map<string, TeamFront>` because that is the right runtime shape; the
// document holds an object because JSON has no Map and a hand-written migration
// should not have to know how one was encoded.

import type {
  CareerPlayer, FaPersonality, PlayerContract, Prospect,
} from '../engine/offseason/types.ts';
import type { CareerCoach, CoachRole, CoachTree } from '../engine/offseason/coaches.ts';
import type { TeamFront } from '../engine/offseason/frontOffice.ts';
import type { PositionGroup } from '../engine/types.ts';

/** Everything about a save that is not the league itself. */
export interface SaveMeta {
  readonly saveId: string;
  readonly name: string;
  /** The club the player manages. */
  readonly userTeamId: string;
  readonly season: number;
  readonly week: number;
  readonly phase: string;
  /** The RNG seed the save was created with. Kept so a save reloaded mid-season
   *  continues the same sequence rather than starting a new one. */
  readonly seed: number;
  readonly engineVersion: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SavedContract {
  readonly aav: number;
  readonly yearsRemaining: number;
  readonly years: number;
  readonly guaranteed: number;
  readonly signedSeason: number;
}

export interface SavedPlayer {
  readonly id: string;
  readonly name: string;
  readonly group: PositionGroup;
  readonly teamId: string | null;
  readonly ability: number;
  readonly potential: number;
  readonly mental: number;
  readonly reputation: number;
  readonly age: number;
  readonly experience: number;
  readonly devRate: number;
  readonly workEthic: number;
  readonly durability: number;
  readonly footballIq: number;
  readonly gamesMissedCareer: number;
  readonly gamesMissedSeason: number;
  readonly allLeague: number;
  readonly awards: number;
  readonly rings: number;
  readonly retired: boolean;
  readonly retiredInSeason: number | null;
  readonly personality: FaPersonality;
  readonly contract: SavedContract | null;
  readonly previousTeamId: string | null;
}

export interface SavedProspect {
  readonly id: string;
  readonly name: string;
  readonly group: PositionGroup;
  readonly draftYear: number;
  readonly personality: FaPersonality;
  readonly ability: number;
  readonly potential: number;
  readonly age: number;
  readonly devRate: number;
  readonly workEthic: number;
  readonly durability: number;
  readonly footballIq: number;
}

export interface SavedCoach {
  readonly id: string;
  readonly name: string;
  readonly teamId: string | null;
  readonly role: CoachRole | null;
  readonly tree: CoachTree;
  readonly age: number;
  readonly experience: number;
  readonly yearsWithTeam: number;
  readonly seasonsAsHeadCoach: number;
  readonly playCalling: number;
  readonly gameManagement: number;
  readonly clockManagement: number;
  readonly aggressiveness: number;
  readonly development: number;
  readonly evaluation: number;
  readonly leadership: number;
  readonly ability: number;
  readonly reputation: number;
  readonly careerWins: number;
  readonly careerLosses: number;
  readonly careerTies: number;
  readonly rings: number;
  readonly hotSeat: number;
  readonly retired: boolean;
}

/** Money owed to released players, by the season the charge was incurred.
 *  A single number could not survive a save reloaded mid-offseason: the engine
 *  writes a charge off at the end of the season it belongs to, and a reload
 *  that forgot the year either wrote it off early or carried it for ever. */
export type SavedDeadMoney = Readonly<Record<string, Readonly<Record<string, number>>>>;

export interface SaveDocument {
  /** Format version. Read before anything else in the document. */
  readonly version: number;
  readonly meta: SaveMeta;
  readonly teamIds: readonly string[];
  readonly fronts: Readonly<Record<string, TeamFront>>;
  readonly players: readonly SavedPlayer[];
  /** Every coach in the game, employed or not. Empty in a save written before
   *  format 4, which the server rehydrates from the save's own coach rows. */
  readonly coaches: readonly SavedCoach[];
  /** Draft classes not yet drafted, keyed by draft year. */
  readonly pipeline: Readonly<Record<string, readonly SavedProspect[]>>;
  readonly deadMoney: SavedDeadMoney;
}

/** A document at some earlier version, before migration. Deliberately loose:
 *  a migration step is handed data it must inspect, not a type it can trust. */
export type UnknownDocument = Record<string, unknown> & { version?: unknown };

/** Runtime types the document maps onto, re-exported so a caller does not have
 *  to reach into the engine to name what load() returns. */
export type { CareerCoach, CareerPlayer, PlayerContract, Prospect, TeamFront };
