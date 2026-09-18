// Play selection. Situational rather than a fixed run/pass ratio: down and
// distance, field position, score and clock all move the call, which is what
// produces realistic attempt counts without hardcoding them.

import { CALIBRATION, clamp } from './calibration.ts';
import type { Rng } from './rng.ts';
import type { CoachingState, SchemeState } from './types.ts';

export interface Situation {
  readonly down: number;
  readonly distance: number;
  /** Yards from the offense's own goal line. */
  readonly yardLine: number;
  /** Offence score minus defence score. */
  readonly scoreDiff: number;
  readonly quarter: number;
  /** Seconds left in the current quarter. */
  readonly clock: number;
  /** Seconds left in the current half. */
  readonly halfRemaining: number;
}

export type FourthDownChoice = 'punt' | 'fieldGoal' | 'go';

export function fieldGoalDistance(yardLine: number): number {
  // Goal line to the spot, plus ten yards of end zone and a seven-yard snap.
  return 100 - yardLine + 17;
}

/**
 * Fourth down. Aggression shifts the thresholds rather than randomising the
 * decision, so an aggressive coach is consistently aggressive.
 */
export function chooseFourthDown(
  situation: Situation,
  scheme: SchemeState,
  coaching: CoachingState,
): FourthDownChoice {
  const { drive, kicking } = CALIBRATION;
  const distance = fieldGoalDistance(situation.yardLine);
  const inRange = distance <= kicking.fieldGoalAttemptDistance;

  const aggression = (scheme.fourthDownAggression + coaching.aggressiveness) / 2;
  const trailing = situation.scoreDiff < 0;
  const desperate =
    situation.halfRemaining < 300 && situation.quarter >= 4 && trailing;

  // Down two scores late, a field goal does not change the arithmetic.
  if (desperate && situation.scoreDiff < -8 && situation.yardLine >= 55) return 'go';
  const inDesperationRange = distance <= kicking.fieldGoalMaxDistance;
  if (desperate && situation.halfRemaining < 90 && inDesperationRange && situation.scoreDiff >= -3) {
    return 'fieldGoal';
  }

  const goForItDistance =
    drive.goForItMaxDistance + (aggression - 50) / 22 + (trailing ? 0.7 : 0);
  const pastMidfield = situation.yardLine >= drive.goForItYardLineFloor;

  if (pastMidfield && situation.distance <= goForItDistance && !inRange) return 'go';
  if (inRange) {
    // Inside the ten on fourth and short, an aggressive club takes the points
    // only when the aggression is low.
    if (situation.yardLine >= 90 && situation.distance <= 1 && aggression > 62) return 'go';
    return 'fieldGoal';
  }
  if (situation.distance <= 1 && situation.yardLine >= 50 && aggression > 55) return 'go';
  return 'punt';
}

/** Probability that a given snap is a run. */
export function runShare(situation: Situation, scheme: SchemeState): number {
  const { playcall } = CALIBRATION;
  let share = scheme.runPassBalance > 0 ? scheme.runPassBalance : playcall.neutralRunShare;

  // Down and distance.
  if (situation.down === 3 || situation.down === 4) {
    if (situation.distance >= 7) share -= playcall.thirdAndLongPassBias;
    else if (situation.distance <= 2) share += playcall.shortYardageRunBias;
  }
  if (situation.distance <= 2 && situation.down <= 2) share += 0.1;
  if (situation.distance >= 12) share -= 0.14;

  // Goal-line snaps skew run.
  if (situation.yardLine >= 97) share += 0.16;

  // Score and clock. A lead late means running the ball; a deficit late means
  // throwing it, and both push the play count in the right direction.
  const late = situation.quarter >= 4 || (situation.quarter === 3 && situation.clock < 300);
  if (late) share += clamp(situation.scoreDiff * playcall.leadRunBias, -0.3, 0.3);

  if (situation.halfRemaining < CALIBRATION.clock.hurryUpThreshold && situation.scoreDiff <= 0) {
    share = Math.min(share, 1 - playcall.twoMinutePassShare);
  }

  return clamp(share, 0.05, 0.92);
}

/** A team with a lead and the ball inside two minutes kneels it out. */
export function shouldKneel(situation: Situation): boolean {
  return (
    situation.quarter >= 4 &&
    situation.scoreDiff > 0 &&
    situation.halfRemaining <= 82 &&
    situation.down <= 3
  );
}

export function callPlay(
  situation: Situation,
  scheme: SchemeState,
  coaching: CoachingState,
  rng: Rng,
): 'run' | 'pass' | 'punt' | 'fieldGoal' | 'kneel' {
  if (shouldKneel(situation)) return 'kneel';
  if (situation.down === 4) {
    const choice = chooseFourthDown(situation, scheme, coaching);
    if (choice === 'punt') return 'punt';
    if (choice === 'fieldGoal') return 'fieldGoal';
  }
  return rng.chance(runShare(situation, scheme)) ? 'run' : 'pass';
}
