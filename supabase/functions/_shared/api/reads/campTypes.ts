// The camp read contract. Types only: safe for the client to reference.
import type { RosterStatus } from '../campBoard.ts';

export interface CampIn { readonly saveId: string }
export interface CampPlayerOut {
  readonly playerId: string;
  readonly name: string;
  readonly position: string;
  readonly group: string;
  readonly overall: number;
  readonly potential: number;
  readonly age: number;
  readonly experienceYears: number;
  readonly capHit: number | null;
  readonly deadMoney: number | null;
  readonly contractYears: number | null;
  readonly draftRound: number | null;
  readonly rookie: boolean;
  readonly depth: number;
  readonly depthOrder: number | null;
  readonly groupSize: number;
  readonly specialTeams: number;
  readonly schemeFit: number;
  readonly injured: boolean;
  readonly weeksOut: number | null;
  readonly practiceGrade: number;
  readonly practiceSource: 'RECORDED' | 'INITIAL_ESTIMATE';
  readonly preseasonGrade: number | null;
  readonly preseasonBasis: 'PRODUCTION' | 'AVAILABILITY';
  readonly preseasonGames: number;
  /** Null when required contract inputs are missing. Never an invented zero. */
  readonly probability: number | null;
  readonly status: RosterStatus | null;
  readonly statusLabel: string | null;
  readonly gradeDelta: number;
  readonly trend: 'RISER' | 'FALLER' | 'STEADY' | 'UNSEEN';
}

export interface CampBattleOut {
  readonly group: string;
  readonly forDepth: number;
  readonly starting: boolean;
  readonly closeness: number;
  readonly players: readonly CampPlayerOut[];
}

export interface CampGroupOut {
  readonly group: string;
  readonly count: number;
  readonly available: number;
  readonly startingPlaces: number;
  /** Staff's existing keep-line model, not a roster requirement. */
  readonly projectedPlaces: number;
  readonly battles: number;
}

export interface CampFixtureOut {
  readonly gameId: string;
  readonly week: number;
  readonly opponentId: string;
  readonly opponentName: string;
  readonly home: boolean;
  readonly status: string;
  readonly ourScore: number | null;
  readonly theirScore: number | null;
  readonly result: 'W' | 'L' | 'T' | null;
}

export interface CampProgress {
  readonly active: boolean;
  readonly phaseLabel: string;
  readonly nextPhaseLabel: string | null;
  readonly deadline: string | null;
  readonly advanceLabel: string | null;
  readonly advanceRoute: 'advance-camp' | 'finalize-roster' | null;
  readonly advanceFault: string | null;
  readonly finalizeFault: string | null;
}

export interface CampOut {
  readonly phase: string;
  readonly season: number;
  readonly preseasonWeek: number | null;
  readonly preseasonWeeks: number;
  readonly rosterCount: number;
  readonly rosterLimit: number;
  readonly campLimit: number;
  readonly limitEnforced: boolean;
  readonly cutsRemaining: number;
  readonly rosterFault: string | null;
  readonly capSpace: number | null;
  readonly injuredCount: number;
  readonly battleCount: number;
  readonly nextOpponentId: string | null;
  readonly nextOpponentName: string | null;
  readonly nextPreseasonWeek: number | null;
  readonly battles: readonly CampBattleOut[];
  readonly bubble: readonly CampPlayerOut[];
  readonly rookies: readonly CampPlayerOut[];
  readonly veteransAtRisk: readonly CampPlayerOut[];
  readonly injuries: readonly CampPlayerOut[];
  readonly movers: readonly CampPlayerOut[];
  readonly players: readonly CampPlayerOut[];
  readonly groups: readonly CampGroupOut[];
  readonly depthWarnings: readonly string[];
  readonly availabilityWarnings: readonly string[];
  readonly fixtures: readonly CampFixtureOut[];
  readonly preseasonRecord: { readonly wins: number; readonly losses: number; readonly ties: number };
  readonly progress: CampProgress;
}
