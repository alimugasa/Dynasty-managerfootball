// Retirement is a hazard, not an age. These pin the shape of the curve.

import { describe, expect, it } from 'vitest';
import { createRng } from '../../supabase/functions/_shared/engine/rng.ts';
import {
  developPlayer, NEUTRAL_CONTEXT, retireAll, retirementHazard, PEAK_AGE,
  type CareerPlayer,
} from '../../supabase/functions/_shared/engine/offseason/index.ts';
import { mean, player } from './fixtures.ts';

describe('retirement hazard', () => {
  it('is zero before the minimum age, whatever else is true', () => {
    expect(retirementHazard(player({ age: 24, ability: 40, teamId: null }))).toBe(0);
  });

  it('rises with years past peak', () => {
    const at30 = retirementHazard(player({ group: 'WR', age: 30, ability: 75 }));
    const at35 = retirementHazard(player({ group: 'WR', age: 35, ability: 75 }));
    expect(at35).toBeGreaterThan(at30);
  });

  it('is dominated by ability at the fringe, which is why the mode is young', () => {
    const fringe = retirementHazard(player({ age: 26, ability: 52 }));
    const solid = retirementHazard(player({ age: 26, ability: 78 }));
    expect(fringe).toBeGreaterThan(solid);
    expect(fringe).toBeGreaterThan(0.2);
  });

  it('damps hard for stars, who keep playing', () => {
    const star = retirementHazard(player({ group: 'RB', age: 33, ability: 90 }));
    const ordinary = retirementHazard(player({ group: 'RB', age: 33, ability: 78 }));
    expect(star).toBeLessThan(ordinary);
  });

  it('rises for a player nobody has signed', () => {
    expect(retirementHazard(player({ age: 29, ability: 70, teamId: null })))
      .toBeGreaterThan(retirementHazard(player({ age: 29, ability: 70, teamId: 'AAA' })));
  });

  it('rises with a career of missed games', () => {
    expect(retirementHazard(player({ age: 30, ability: 75, gamesMissedCareer: 70 })))
      .toBeGreaterThan(retirementHazard(player({ age: 30, ability: 75, gamesMissedCareer: 0 })));
  });

  it('terminates the tail: everyone is likely to go by 40', () => {
    expect(retirementHazard(player({ age: 41, ability: 95 }))).toBeGreaterThanOrEqual(0.55);
  });

  it('never exceeds certainty', () => {
    const hazard = retirementHazard(player({
      age: 44, ability: 31, teamId: null, gamesMissedCareer: 200,
      accolades: { allLeague: 0, awards: 0, rings: 3 },
    }));
    expect(hazard).toBeLessThanOrEqual(0.96);
    expect(hazard).toBeGreaterThan(0);
  });
});

describe('retirement over a simulated career', () => {
  /** Age at which a cohort of identical players actually stops. */
  function retirementAges(make: () => CareerPlayer, runs = 300): number[] {
    const ages: number[] = [];
    for (let seed = 1; seed <= runs; seed += 1) {
      const rng = createRng(seed * 7919);
      const p = make();
      for (let year = 0; year < 30; year += 1) {
        developPlayer(p, NEUTRAL_CONTEXT, rng);
        const [gone] = retireAll([p], rng, 2026 + year);
        if (gone !== undefined) { ages.push(p.age); break; }
      }
    }
    return ages;
  }

  it('spreads across a range of ages rather than firing at one', () => {
    const ages = retirementAges(() => player({ age: 24, ability: 74, potential: 84 }));
    expect(ages.length).toBeGreaterThan(250);
    expect(new Set(ages).size).toBeGreaterThan(8);
    expect(Math.min(...ages)).toBeGreaterThanOrEqual(25);
    expect(Math.max(...ages)).toBeLessThanOrEqual(42);
  });

  it('keeps a good player around longer than a fringe one', () => {
    const good = mean(retirementAges(() => player({ age: 24, ability: 84, potential: 92 })));
    const fringe = mean(retirementAges(() => player({ age: 24, ability: 60, potential: 64 })));
    expect(good).toBeGreaterThan(fringe);
  });

  it('marks the player retired and unsigns him', () => {
    const p = player({ age: 41, ability: 60 });
    const rng = createRng(5);
    const gone = retireAll([p], rng, 2030);
    if (gone.length > 0) {
      expect(p.retired).toBe(true);
      expect(p.teamId).toBeNull();
      expect(p.retiredInSeason).toBe(2030);
    }
  });

  it('never retires an already retired player twice', () => {
    const p = player({ age: 41, retired: true });
    expect(retireAll([p], createRng(1), 2030)).toHaveLength(0);
  });

  it('retires backs earlier than quarterbacks', () => {
    const backs = mean(retirementAges(() => player({
      group: 'RB', age: 24, ability: 78, potential: 86,
    })));
    const passers = mean(retirementAges(() => player({
      group: 'QB', age: 24, ability: 78, potential: 86,
    })));
    expect(backs).toBeLessThan(passers);
    // And the difference should be material, not a rounding artifact.
    expect(passers - backs).toBeGreaterThan(1);
  });
});

describe('positional peaks', () => {
  it('peaks backs earliest and kickers latest', () => {
    expect(PEAK_AGE.RB).toBeLessThan(PEAK_AGE.QB);
    expect(PEAK_AGE.K).toBeGreaterThan(PEAK_AGE.QB);
  });
});
