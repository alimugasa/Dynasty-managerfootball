// Scouting fog.
//
// No club ever reads a prospect's true rating. It sees an estimate and a range
// around it, and the range is the point: a club that has spent on scouting sees
// a tight band and can act on it, one that has not sees a wide band and is
// guessing. Thirty-two clubs therefore build thirty-two different boards from
// the same class, which is where reaches and steals come from. A draft in which
// everyone sees the truth is a sorting exercise, not a decision.
//
// The band is honest. It is a real confidence interval on the club's own
// estimate, so the true rating falls inside an 80% band about 80% of the time --
// asserted by test, because a range that does not contain the truth at its
// stated rate is decoration rather than information.

import { clamp } from '../calibration.ts';
import type { Rng } from '../rng.ts';
import type { PositionGroup } from '../types.ts';
import type { TeamFront } from './frontOffice.ts';
import type { Prospect } from './types.ts';

export const SCOUTING = {
  /** Error width for a club with no scouting department and no spend. */
  baseSigma: 11.5,
  /** How much a top department narrows it. */
  departmentEffect: 6,
  /**
   * How much money narrows it, on top of the department. Deliberately smaller
   * than the department term: spending buys better coverage of a class, not a
   * better eye, and a club cannot buy its way to certainty.
   */
  spendEffect: 2.5,
  /** However good the club, a prospect is a nineteen-year-old. */
  floorSigma: 3,
  /** Potential is harder to read than current ability, always. */
  potentialSigmaMultiplier: 1.35,
  /** z for the reported band. 1.2816 is an 80% interval. */
  bandZ: 1.2816,
  /** A club can concentrate its budget rather than spreading it evenly. */
  maxFocusMultiplier: 2.5,
} as const;

export interface ScoutingReport {
  readonly prospectId: string;
  readonly teamId: string;
  /** What this club believes the player is now. */
  readonly estimate: number;
  /** What this club believes he becomes. */
  readonly potentialEstimate: number;
  /** Reported band on `estimate`. Narrows with department quality and spend. */
  readonly low: number;
  readonly high: number;
  /** The sigma behind the band, exposed so the AI can weight its own certainty. */
  readonly sigma: number;
  /** 0-1, a readable inverse of sigma for display. */
  readonly confidence: number;
  /** How much of the club's budget went on this player. */
  readonly spend: number;
}

/**
 * Error width for one club looking at one prospect.
 *
 * Both terms are needed. Department quality is what the club is; spend is what
 * it chose to do this year. A strong department that ignores a prospect still
 * misses him.
 */
export function scoutingSigma(front: TeamFront, spend: number): number {
  const effective = clamp(spend, 0, SCOUTING.maxFocusMultiplier);
  const sigma = SCOUTING.baseSigma
    - (front.scouting / 100) * SCOUTING.departmentEffect
    - Math.sqrt(effective) * SCOUTING.spendEffect;
  return Math.max(SCOUTING.floorSigma, sigma);
}

export function scoutProspect(
  prospect: Prospect, front: TeamFront, spend: number, rng: Rng,
): ScoutingReport {
  const sigma = scoutingSigma(front, spend);
  const estimate = prospect.ability + rng.normal(0, sigma);
  const potentialEstimate =
    prospect.potential + rng.normal(0, sigma * SCOUTING.potentialSigmaMultiplier);
  const half = SCOUTING.bandZ * sigma;
  return {
    prospectId: prospect.id,
    teamId: front.id,
    estimate,
    potentialEstimate,
    low: estimate - half,
    high: estimate + half,
    sigma,
    confidence: clamp(1 - (sigma - SCOUTING.floorSigma) / SCOUTING.baseSigma, 0, 1),
    spend,
  };
}

/**
 * How a club spreads a finite scouting budget across a class.
 *
 * Not evenly. A club looks hardest at the positions it needs and at prospects
 * whose public grade puts them near where it picks; everyone else gets a
 * cursory look. That is what makes a club's fog uneven rather than uniformly
 * thick, and it is why a club can be sharply right about the position it
 * targeted and badly wrong about the one it did not.
 */
export function allocateScouting(
  prospects: readonly Prospect[],
  front: TeamFront,
  needs: Readonly<Record<PositionGroup, number>>,
): Map<string, number> {
  const weights = new Map<string, number>();
  let total = 0;
  for (const prospect of prospects) {
    // Public consensus stands in for "is this player on our radar at all".
    const prominence = clamp((prospect.ability - 45) / 35, 0.05, 1);
    const weight = prominence * (0.45 + 1.1 * (needs[prospect.group] ?? 0));
    weights.set(prospect.id, weight);
    total += weight;
  }
  if (total <= 0) return weights;

  // Budget is expressed relative to the class: a club spending at the league
  // average has a mean focus of 1.0 across the prospects it cares about.
  const budget = front.scoutingSpend * prospects.length;
  const allocation = new Map<string, number>();
  for (const [id, weight] of weights) {
    allocation.set(id, Math.min(SCOUTING.maxFocusMultiplier, (weight / total) * budget));
  }
  return allocation;
}

/** Every report one club holds on a class. */
export function scoutClass(
  prospects: readonly Prospect[],
  front: TeamFront,
  needs: Readonly<Record<PositionGroup, number>>,
  rng: Rng,
): Map<string, ScoutingReport> {
  const allocation = allocateScouting(prospects, front, needs);
  const reports = new Map<string, ScoutingReport>();
  for (const prospect of prospects) {
    reports.set(
      prospect.id,
      scoutProspect(prospect, front, allocation.get(prospect.id) ?? 0, rng),
    );
  }
  return reports;
}
