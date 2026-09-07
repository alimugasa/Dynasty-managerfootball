// Unit ratings from position groups.
//
// There is no single team "overall" anywhere in this engine. A team's ability to
// throw the ball is built from its quarterback, its pass protection and its
// receivers, weighted separately; its ability to stop the run is built from
// interior linemen, linebackers and edge setters. That is what makes a club with
// a great quarterback behind a poor line play differently from a balanced club
// with the same average rating, and it is what makes an injury to one starter
// move the right number rather than a generic one.
//
// Within a group, depth matters on a declining curve: a team's third receiver
// contributes, its fifth does not play. Weights per group are listed below and
// each set sums to 1.

import {
  effectiveSkill,
  fieldableIn,
  type TeamRuntime,
} from './roster.ts';
import { MissingUnitError, type PositionGroup, type SkillKey } from './types.ts';

/** Contribution of each depth slot within a group. */
const DEPTH_WEIGHTS: Readonly<Record<PositionGroup, readonly number[]>> = {
  QB: [1],
  RB: [0.72, 0.28],
  WR: [0.42, 0.33, 0.25],
  TE: [0.75, 0.25],
  OL: [0.21, 0.2, 0.19, 0.2, 0.2],
  EDGE: [0.58, 0.42],
  DT: [0.55, 0.45],
  LB: [0.42, 0.33, 0.25],
  CB: [0.42, 0.33, 0.25],
  S: [0.55, 0.45],
  K: [1],
  P: [1],
};

/**
 * Weighted rating for one group in one skill, after fatigue and injury.
 *
 * If a group is thinner than its weight list, the remaining weight falls on the
 * last available player -- a team that loses its second corner plays its third
 * more, it does not play with fewer. An empty group throws: a missing unit is a
 * data defect, not a zero.
 */
export function groupRating(
  runtime: TeamRuntime,
  group: PositionGroup,
  skill: SkillKey,
): number {
  const available = fieldableIn(runtime, group);
  if (available.length === 0) throw new MissingUnitError(runtime.team.id, group);

  const weights = DEPTH_WEIGHTS[group];
  let total = 0;
  for (let i = 0; i < weights.length; i += 1) {
    const weight = weights[i] ?? 0;
    const player = available[i] ?? available[available.length - 1];
    if (player === undefined) continue;
    total += weight * effectiveSkill(runtime, player, skill);
  }
  return total;
}

export interface UnitRatings {
  readonly passOffense: number;
  readonly runOffense: number;
  readonly passDefense: number;
  readonly runDefense: number;
  /** Exposed separately because the sack rate keys off pressure, not overall
   *  pass defence, and because the pass-block matchup is what an injury to a
   *  tackle should move. */
  readonly passProtection: number;
  readonly passRush: number;
}

/**
 * Offensive passing. The quarterback dominates, which matches the reference
 * engine's positional impact table (QB 0.260, the next-highest position 0.075).
 */
function passOffense(runtime: TeamRuntime): number {
  return (
    0.46 * groupRating(runtime, 'QB', 'accuracy') * 0.5 +
    0.46 * groupRating(runtime, 'QB', 'decisionMaking') * 0.5 +
    0.22 * groupRating(runtime, 'OL', 'passBlock') +
    0.24 * groupRating(runtime, 'WR', 'routeRunning') +
    0.08 * groupRating(runtime, 'TE', 'catching')
  );
}

function runOffense(runtime: TeamRuntime): number {
  return (
    0.52 * groupRating(runtime, 'OL', 'runBlock') +
    0.33 * groupRating(runtime, 'RB', 'breakTackle') +
    0.15 * groupRating(runtime, 'TE', 'runBlock')
  );
}

function passDefense(runtime: TeamRuntime): number {
  return (
    0.34 * groupRating(runtime, 'EDGE', 'passRush') +
    0.12 * groupRating(runtime, 'DT', 'passRush') +
    0.34 * groupRating(runtime, 'CB', 'coverage') +
    0.13 * groupRating(runtime, 'S', 'coverage') +
    0.07 * groupRating(runtime, 'LB', 'coverage')
  );
}

function runDefense(runtime: TeamRuntime): number {
  return (
    0.34 * groupRating(runtime, 'DT', 'runStop') +
    0.28 * groupRating(runtime, 'LB', 'runStop') +
    0.22 * groupRating(runtime, 'EDGE', 'runStop') +
    0.16 * groupRating(runtime, 'S', 'tackling')
  );
}

function passProtection(runtime: TeamRuntime): number {
  return (
    0.74 * groupRating(runtime, 'OL', 'passBlock') +
    0.14 * groupRating(runtime, 'RB', 'passBlock') +
    0.12 * groupRating(runtime, 'QB', 'pocketPresence')
  );
}

function passRush(runtime: TeamRuntime): number {
  return (
    0.62 * groupRating(runtime, 'EDGE', 'passRush') +
    0.28 * groupRating(runtime, 'DT', 'passRush') +
    0.1 * groupRating(runtime, 'LB', 'passRush')
  );
}

/** Recomputed on every snap: fatigue and injuries move these during a game. */
export function unitRatings(runtime: TeamRuntime): UnitRatings {
  return {
    passOffense: passOffense(runtime),
    runOffense: runOffense(runtime),
    passDefense: passDefense(runtime),
    runDefense: runDefense(runtime),
    passProtection: passProtection(runtime),
    passRush: passRush(runtime),
  };
}
