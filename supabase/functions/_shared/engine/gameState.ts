// The game's mutable state and the small queries over it. Split from the play
// loop so that loop reads as a sequence of football decisions rather than as
// bookkeeping.

import { CALIBRATION } from './calibration.ts';
import type { Situation } from './playcall.ts';
import type { PlayResolution } from './plays.ts';
import type { Side } from './types.ts';

export interface GameState {
  quarter: number;
  clock: number;
  possession: Side;
  /** Yards from the possessing team's own goal line. */
  yardLine: number;
  down: number;
  distance: number;
  homeScore: number;
  awayScore: number;
  overtime: boolean;
  /** Side that receives to start the second half. */
  secondHalfReceiver: Side;
  driveCount: { home: number; away: number };
  possessionSeconds: { home: number; away: number };
}

export const other = (side: Side): Side => (side === 'home' ? 'away' : 'home');

export function createGameState(opening: Side): GameState {
  return {
    quarter: 1,
    clock: CALIBRATION.clock.quarterSeconds,
    possession: opening,
    yardLine: CALIBRATION.drive.touchbackYardLine,
    down: 1,
    distance: 10,
    homeScore: 0,
    awayScore: 0,
    overtime: false,
    secondHalfReceiver: other(opening),
    driveCount: { home: 0, away: 0 },
    possessionSeconds: { home: 0, away: 0 },
  };
}

export const scoreOf = (state: GameState, side: Side): number =>
  side === 'home' ? state.homeScore : state.awayScore;

export function addScore(state: GameState, side: Side, points: number): void {
  if (side === 'home') state.homeScore += points;
  else state.awayScore += points;
}

/** Seconds left in the current half, which is what clock decisions key off. */
export function halfRemaining(state: GameState): number {
  const anotherQuarterInHalf = state.quarter === 1 || state.quarter === 3 ? 1 : 0;
  return state.clock + anotherQuarterInHalf * CALIBRATION.clock.quarterSeconds;
}

export function situationOf(state: GameState): Situation {
  return {
    down: state.down,
    distance: state.distance,
    yardLine: state.yardLine,
    scoreDiff: scoreOf(state, state.possession) - scoreOf(state, other(state.possession)),
    quarter: state.quarter,
    clock: state.clock,
    halfRemaining: halfRemaining(state),
  };
}

/**
 * Seconds burned by a snap. A play that stops the clock costs only its own
 * duration; one that does not also costs the huddle before the next snap, which
 * is where most of a game's sixty minutes actually go.
 */
export function clockCost(
  resolution: PlayResolution,
  hurrying: boolean,
  tempo: number,
): number {
  const { clock } = CALIBRATION;
  if (resolution.clockStops) return clock.stoppedClockSeconds;
  if (hurrying) return clock.hurryUpSeconds;
  const swing = ((tempo - 50) / 50) * clock.runningClockTempoSwing;
  return Math.round(clock.runningClockSeconds - swing);
}
