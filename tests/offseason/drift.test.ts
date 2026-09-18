// Talent drift is the failure mode that only shows up after someone has played
// forty seasons, by which point it is unfixable without invalidating their save.
// legacy/ENGINE.md records the original: a league losing 0.29 rating points a
// season, which a player would have experienced as twelve straight years of the
// sport quietly getting worse.
//
// These tests exist so that regression cannot come back silently. They are slow
// by the standards of the rest of the suite and worth every millisecond.

import { describe, expect, it } from 'vitest';
import { createRng } from '../../supabase/functions/_shared/engine/rng.ts';
import {
  meanRosteredAbility, NEUTRAL_CONTEXT, OFFSEASON, primePipeline, runOffseason, ROSTER_SIZE,
  type IntakeConfig,
} from '../../supabase/functions/_shared/engine/offseason/index.ts';
import { loadCareerLeague } from '../../scripts/drift-report/careerLeague.ts';
import { slopePerStep } from '../../scripts/drift-report/chart.ts';

function run(seasons: number, seed: number, intake?: IntakeConfig): number[] {
  const league = loadCareerLeague();
  const rng = createRng(seed);
  const config = intake ?? OFFSEASON.intake;
  primePipeline(league, rng, config);
  const series = [meanRosteredAbility(league)];
  for (let i = 0; i < seasons; i += 1) {
    runOffseason(league, rng, NEUTRAL_CONTEXT, config);
    series.push(meanRosteredAbility(league));
  }
  return series;
}

describe('league-average ability over 40 seasons', () => {
  const seeds = [20260907, 11, 4242];

  it.each(seeds)('stays flat from seed %i', (seed) => {
    const series = run(40, seed);
    const start = series[0] as number;
    const end = series[series.length - 1] as number;
    // The whole run must not go anywhere.
    expect(Math.abs(end - start)).toBeLessThan(1.0);

    // Wandering is measured after the settling transient, not across it. The
    // seed database is not at the age and contract structure its own intake and
    // market imply, so the league rises about two points over the first eight
    // seasons and returns. Including that in a range check measures the
    // starting conditions rather than drift, and tightening the engine to pass
    // it would mean distorting the intake to hide a one-off adjustment.
    const settled = series.slice(13);
    expect(Math.max(...settled) - Math.min(...settled)).toBeLessThan(2.0);
    // The transient itself is bounded, so it stays an adjustment rather than a
    // regime change.
    expect(Math.max(...series) - Math.min(...series)).toBeLessThan(4.0);
  });

  it('has no residual slope once settled, averaged over leagues', () => {
    // A slope fitted through one 40-season run has a wide sampling
    // distribution, because league mean ability wanders and that wandering is
    // autocorrelated. Runs ending within half a point of where they started
    // still produce slopes of -0.04. Averaging over independent leagues is what
    // separates a trend from a walk, so the assertion is made on the average.
    //
    // The burn-in is 13 rather than 10: the settling transient peaks around
    // season 8 and is still returning through the mid-teens, and a shorter
    // window reports the tail of that descent as drift.
    const slopes = [20260907, 11, 4242, 777, 31].map(
      (seed) => slopePerStep(run(40, seed).slice(13)),
    );
    const mean = slopes.reduce((a, b) => a + b, 0) / slopes.length;
    expect(Math.abs(mean)).toBeLessThan(0.02);
  });

  it('holds the league at the level the seed database sits at', () => {
    const series = run(40, 777);
    const start = series[0] as number;
    const settled = series.slice(15);
    const equilibrium = settled.reduce((a, b) => a + b, 0) / settled.length;
    expect(Math.abs(equilibrium - start)).toBeLessThan(1.0);
  });

  it('keeps every roster full for the whole run', () => {
    const league = loadCareerLeague();
    const rng = createRng(31);
    primePipeline(league, rng);
    for (let i = 0; i < 40; i += 1) {
      runOffseason(league, rng);
      const rostered = league.players.filter((p) => !p.retired && p.teamId !== null).length;
      expect(rostered).toBe(league.teamIds.length * ROSTER_SIZE);
    }
  });

  it('keeps the age structure stable rather than ageing or rejuvenating', () => {
    const league = loadCareerLeague();
    const rng = createRng(88);
    primePipeline(league, rng);
    const ages: number[] = [];
    for (let i = 0; i < 40; i += 1) {
      runOffseason(league, rng);
      const active = league.players.filter((p) => !p.retired && p.teamId !== null);
      ages.push(active.reduce((a, p) => a + p.age, 0) / active.length);
    }
    const settled = ages.slice(10);
    expect(Math.min(...settled)).toBeGreaterThan(24.5);
    expect(Math.max(...settled)).toBeLessThan(28.5);
  });
});

describe('drift detection actually works', () => {
  it('a miscalibrated intake visibly sinks the league', () => {
    // Guards the guard: if the flatness tests above could pass with any intake,
    // they would be measuring nothing. The reference engine's own class mean
    // settles this league several points low, because the roster accounting
    // differs.
    const series = run(40, 20260907, { ...OFFSEASON.intake, classAbilityMean: 52 });
    const start = series[0] as number;
    const end = series[series.length - 1] as number;
    const settled = series.slice(20);
    const equilibrium = settled.reduce((a, b) => a + b, 0) / settled.length;
    expect(end).toBeLessThan(start - 2);
    expect(equilibrium).toBeLessThan(start - 1.5);
  });

  it('an over-generous intake visibly inflates it', () => {
    const series = run(40, 20260907, { ...OFFSEASON.intake, classAbilityMean: 70 });
    const end = series[series.length - 1] as number;
    expect(end).toBeGreaterThan((series[0] as number) + 2);
  });
});

describe('offseason determinism', () => {
  it('replays identically from the same seed', () => {
    expect(run(12, 5150)).toEqual(run(12, 5150));
  });

  it('differs across seeds', () => {
    expect(run(12, 5150)).not.toEqual(run(12, 5151));
  });
});
