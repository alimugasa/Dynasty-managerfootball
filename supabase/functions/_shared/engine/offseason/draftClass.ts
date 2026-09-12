// Draft intake: where new talent comes from.
//
// This is the subsystem that decides whether a league holds its level over
// decades. legacy/ENGINE.md records a 30-season run losing 0.29 rating points a
// season and traces it here: not to instability -- every setting converged --
// but to a mismatch between the level the seed database sits at and the level
// the intake implied. A player would have experienced that as twelve straight
// years of the league quietly getting worse.
//
// The fix was to calibrate intake to the database rather than the reverse. The
// starting distribution is anchored to real football, so it is the thing worth
// preserving; the class parameters are chosen to converge on it.
//
// Prospects are created several years before they are drafted and develop inside
// the pipeline, so a class has already partly formed by the time anyone scouts
// it, and two prospects with the same rating today will not be the same player
// in three years.

import { OFFSEASON } from './calibration.ts';
import { POSITION_CEILING } from './calibration.ts';
import { clamp } from '../calibration.ts';
import type { Rng } from '../rng.ts';
import type { PositionGroup } from '../types.ts';
import { FA_PERSONALITIES, type Prospect } from './types.ts';

/**
 * Gamma deviate, Marsaglia-Tsang. Used for the headroom a prospect has above his
 * current ability: most have a little, a few have a great deal. A normal draw
 * would make the exceptional prospect as common as the disappointing one, and
 * the whole point of a draft is that he is not.
 */
export function gammaDeviate(rng: Rng, shape: number, scale: number): number {
  if (shape < 1) {
    // Boost a sub-unit shape into the valid range, then correct.
    const u = Math.max(rng.float(), 1e-12);
    return gammaDeviate(rng, shape + 1, scale) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  // Rejection sampling. Bounded in practice: acceptance is above 95% for
  // shape >= 1, so this terminates promptly for every seed.
  for (;;) {
    const x = rng.normal(0, 1);
    const v = Math.pow(1 + c * x, 3);
    if (v <= 0) continue;
    const u = Math.max(rng.float(), 1e-12);
    if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v * scale;
  }
}

/**
 * Group composition of a class.
 *
 * Weighted by demand, not by roster shape. A club carries six corners and three
 * quarterbacks, but corners peak at 26 and decline more than twice as fast, so
 * the six turn over far more often than the three. Weighting purely by roster
 * quota starves the fast-ageing positions: a 40-season run left clubs unable to
 * field a full secondary in six separate years.
 *
 * Each weight is roughly the roster quota multiplied by how quickly that group
 * turns over.
 */
export const CLASS_COMPOSITION: Readonly<Record<PositionGroup, number>> = {
  // Sized to ROSTER_QUOTA: a class that supplies four edge rushers' worth
  // of demand into a league that carries five leaves a club a body short
  // once the pool runs dry, which it did in year sixteen of a forty-year run.
  QB: 3, RB: 7, WR: 7, TE: 4, OL: 11,
  EDGE: 6, DT: 6, LB: 6, CB: 9, S: 5, K: 2, P: 2, LS: 2,
};

/**
 * Exact per-group counts for a class, rather than an independent draw per
 * prospect.
 *
 * Sampling each prospect's position independently makes the number of kickers in
 * a class a random variable: the expectation was five, but classes with two
 * turned up often enough that clubs could not fill 32 kicking jobs. A real draft
 * class is not a multinomial sample either -- positions are represented roughly
 * in proportion every year.
 */
export function classAllocation(size: number): Map<PositionGroup, number> {
  const entries = Object.entries(CLASS_COMPOSITION) as [PositionGroup, number][];
  const totalWeight = entries.reduce((a, [, w]) => a + w, 0);
  const counts = new Map<PositionGroup, number>();
  let assigned = 0;
  for (const [group, weight] of entries) {
    const n = Math.floor((size * weight) / totalWeight);
    counts.set(group, n);
    assigned += n;
  }
  // Hand the rounding remainder to the largest groups first.
  const byWeight = [...entries].sort((a, b) => b[1] - a[1]);
  let i = 0;
  while (assigned < size && byWeight.length > 0) {
    const entry = byWeight[i % byWeight.length];
    if (entry !== undefined) {
      counts.set(entry[0], (counts.get(entry[0]) ?? 0) + 1);
      assigned += 1;
    }
    i += 1;
  }
  return counts;
}

/**
 * The intake parameters, injectable so a calibration sweep can vary them without
 * mutating shared configuration.
 *
 * Declared as an interface of plain numbers rather than `typeof OFFSEASON.intake`:
 * the constants are `as const`, so that type would make each field the literal
 * value it currently holds and reject every override a sweep exists to try.
 */
export interface IntakeConfig {
  readonly pipelineYears: number;
  readonly classSize: number;
  readonly classAbilityMean: number;
  readonly classAbilitySd: number;
  readonly classAbilityMin: number;
  readonly classAbilityMax: number;
  readonly potentialShape: number;
  readonly potentialScale: number;
  readonly prospectGrowthGapShare: number;
  readonly prospectGrowthVarianceSd: number;
  readonly prospectGrowthVarianceMax: number;
  readonly devRateMean: number;
  readonly devRateSd: number;
  readonly devRateMin: number;
  readonly devRateMax: number;
  readonly workEthicMean: number;
  readonly workEthicSd: number;
  readonly durabilityMean: number;
  readonly durabilitySd: number;
  readonly footballIqMean: number;
  readonly footballIqSd: number;
}

/** Where a prospect's name comes from: the league's own first names and
 *  surnames. The seed carries about 500 of each; a class is named from them
 *  rather than from a list nobody in the world was ever called. */
export interface NamePalette {
  readonly first: readonly string[];
  readonly last: readonly string[];
}

/** The palette a league's players make. Sorted, so the same players give the
 *  same palette and the same seed the same names. */
export function namePalette(players: readonly { readonly name: string }[]): NamePalette {
  const first = new Set<string>();
  const last = new Set<string>();
  for (const p of players) {
    const parts = p.name.trim().split(/\s+/);
    if (parts.length < 2 || parts[0] === 'Prospect') continue;
    first.add(parts[0] ?? '');
    last.add(parts[parts.length - 1] ?? '');
  }
  return { first: [...first].sort(), last: [...last].sort() };
}

export function generateClass(
  rng: Rng, draftYear: number, config: IntakeConfig = OFFSEASON.intake,
  names?: NamePalette,
): Prospect[] {
  const c = config;
  const out: Prospect[] = [];
  const allocation = classAllocation(c.classSize);
  const groups: PositionGroup[] = [];
  for (const [group, count] of allocation) {
    for (let n = 0; n < count; n += 1) groups.push(group);
  }
  for (let i = 0; i < groups.length; i += 1) {
    const group = groups[i] as PositionGroup;
    const ability = clamp(
      rng.normal(c.classAbilityMean, c.classAbilitySd), c.classAbilityMin, c.classAbilityMax,
    );
    const potential = clamp(
      ability + gammaDeviate(rng, c.potentialShape, c.potentialScale),
      ability,
      POSITION_CEILING[group],
    );
    const personality = rng.pick(FA_PERSONALITIES);
    const devRate = clamp(rng.normal(c.devRateMean, c.devRateSd), c.devRateMin, c.devRateMax);
    const workEthic = Math.round(clamp(rng.normal(c.workEthicMean, c.workEthicSd), 25, 99));
    const durability = Math.round(clamp(rng.normal(c.durabilityMean, c.durabilitySd), 25, 99));
    const footballIq = Math.round(clamp(rng.normal(c.footballIqMean, c.footballIqSd), 25, 99));
    out.push({
      // Draft year plus index is already unique, so no module-level counter is
      // needed. A mutable module global would make two simulations sharing a
      // process produce different ids than either would alone.
      id: `P${draftYear}_${i + 1}`,
      name: `Prospect ${draftYear}-${i + 1}`,
      group,
      draftYear,
      personality,
      ability,
      potential,
      age: 20,
      devRate,
      workEthic,
      durability,
      footballIq,
    });
  }
  // Named after every rating is drawn, so a caller without a palette gets the
  // same class, ratings and all, as one with. A synthetic league with no names
  // to draw from keeps the placeholder; a real one never does.
  if (names !== undefined && names.first.length > 0 && names.last.length > 0) {
    return out.map((p) => ({ ...p, name: `${rng.pick(names.first)} ${rng.pick(names.last)}` }));
  }
  return out;
}

/** A year of growth inside the pipeline, before anyone drafts them. */
export function developProspects(
  prospects: readonly Prospect[], rng: Rng, config: IntakeConfig = OFFSEASON.intake,
): void {
  const c = config;
  for (const prospect of prospects) {
    const gap = Math.max(0, prospect.potential - prospect.ability);
    const variance = clamp(
      rng.normal(1, c.prospectGrowthVarianceSd), 0, c.prospectGrowthVarianceMax,
    );
    prospect.ability += gap * c.prospectGrowthGapShare * prospect.devRate * variance;
    prospect.age += 1;
  }
}
