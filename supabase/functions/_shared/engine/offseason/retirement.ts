// Retirement.
//
// A hazard rate per player per offseason, not a fixed age. Several independent
// pressures add: years past the positional peak, being no good, being unwanted,
// a body full of missed games, and having already won. Stars are damped hard
// because they keep playing long after others stop, and there is a floor at 40
// so the tail terminates.
//
// The distribution that falls out has its mode at the young end -- fringe
// players washing out after a couple of years -- with a long thin tail into the
// late thirties. That is the real shape, and it is not what a fixed retirement
// age produces.

import { OFFSEASON, PEAK_AGE } from './calibration.ts';
import type { Rng } from '../rng.ts';
import type { CareerPlayer } from './types.ts';

/** Probability this player retires this offseason. Exposed separately from the
 *  draw so the curve can be tested without sampling it. */
export function retirementHazard(player: CareerPlayer): number {
  const r = OFFSEASON.retirement;
  if (player.age < r.minimumAge) return 0;

  const yearsPast = player.age - PEAK_AGE[player.group];
  let hazard = 0;

  // Superlinear in years past peak: gradual through the early thirties, then
  // sharply steeper, rather than a cliff at one age.
  if (yearsPast > 0) hazard += r.agePerYearPastPeak * Math.pow(yearsPast, r.ageExponent);

  // Not good enough. This term, not age, is what produces the mode at 25.
  if (player.ability < r.fringeAbility) {
    hazard += r.fringeBase + (r.fringeAbility - player.ability) * r.fringePerPoint;
  }

  if (player.teamId === null) hazard += r.unsignedPenalty;

  hazard += Math.max(0, player.gamesMissedCareer - r.injuryThreshold) * r.injuryPerGame;

  if (player.accolades.rings > 0 && player.age > PEAK_AGE[player.group] + 3) {
    hazard += r.ringLateCareerBonus;
  }

  // Stars keep playing. Applied last, as a multiplier, so it damps every other
  // pressure rather than offsetting one of them.
  if (player.ability > r.starAbility) hazard *= r.starMultiplier;

  if (player.age >= r.hardAge) hazard = Math.max(hazard, r.hardAgeHazard);

  return Math.min(hazard, r.maximumHazard);
}

export function retireAll(
  players: readonly CareerPlayer[],
  rng: Rng,
  season: number,
): CareerPlayer[] {
  const retiring: CareerPlayer[] = [];
  for (const player of players) {
    if (player.retired) continue;
    if (rng.float() < retirementHazard(player)) {
      player.retired = true;
      player.retiredInSeason = season;
      player.teamId = null;
      retiring.push(player);
    }
  }
  return retiring;
}
