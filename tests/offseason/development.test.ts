// Age curves, breakout and bust variance, and injury-driven decline.

import { describe, expect, it } from 'vitest';
import { createRng } from '../../supabase/functions/_shared/engine/rng.ts';
import {
  developPlayer, NEUTRAL_CONTEXT, PEAK_AGE, POSITION_CEILING,
  type CareerPlayer,
} from '../../supabase/functions/_shared/engine/offseason/index.ts';
import { player } from './fixtures.ts';
import type { PositionGroup } from '../../supabase/functions/_shared/engine/types.ts';

/** Mean ability change over many independent offseasons for one player shape. */
function meanDelta(make: () => CareerPlayer, runs = 400): number {
  let total = 0;
  for (let seed = 1; seed <= runs; seed += 1) {
    const p = make();
    total += developPlayer(p, NEUTRAL_CONTEXT, createRng(seed * 7919)).delta;
  }
  return total / runs;
}

describe('age curves', () => {
  it('grows a player below his positional peak', () => {
    expect(meanDelta(() => player({ age: 23, ability: 68, potential: 88 }))).toBeGreaterThan(1);
  });

  it('declines a player past his peak', () => {
    expect(meanDelta(() => player({ age: 33, ability: 80, potential: 88 }))).toBeLessThan(0);
  });

  it('declines faster the further past peak he is', () => {
    const early = meanDelta(() => player({ age: 29, ability: 80 }));
    const late = meanDelta(() => player({ age: 35, ability: 80 }));
    expect(late).toBeLessThan(early);
  });

  it('ages positions differently: a back falls off faster than a quarterback', () => {
    // Both five years past their own peak, so the comparison is the rate and
    // not the age.
    const back = meanDelta(() => player({
      group: 'RB', age: PEAK_AGE.RB + 5, ability: 80, potential: 88,
    }));
    const passer = meanDelta(() => player({
      group: 'QB', age: PEAK_AGE.QB + 5, ability: 80, potential: 88,
    }));
    expect(back).toBeLessThan(passer);
    expect(back).toBeLessThan(-1);
  });

  it('never exceeds the positional ceiling', () => {
    for (const group of ['QB', 'RB', 'K'] as PositionGroup[]) {
      const p = player({ group, age: 22, ability: POSITION_CEILING[group] - 0.5, potential: 99 });
      for (let i = 0; i < 5; i += 1) developPlayer(p, NEUTRAL_CONTEXT, createRng(i + 1));
      expect(p.ability).toBeLessThanOrEqual(POSITION_CEILING[group]);
    }
  });

  it('never falls below the floor, however long a career runs', () => {
    const p = player({ age: 30, ability: 45, potential: 45 });
    for (let i = 0; i < 40; i += 1) developPlayer(p, NEUTRAL_CONTEXT, createRng(i + 1));
    expect(p.ability).toBeGreaterThanOrEqual(30);
  });
});

describe('breakout and bust variance', () => {
  it('produces both outcomes from identical players', () => {
    const deltas: number[] = [];
    for (let seed = 1; seed <= 600; seed += 1) {
      const p = player({ age: 23, ability: 68, potential: 90 });
      deltas.push(developPlayer(p, NEUTRAL_CONTEXT, createRng(seed * 104_729)).delta);
    }
    // The same player, same situation: some years he barely moves, some he
    // jumps. Without this the draft is solvable.
    expect(Math.min(...deltas)).toBeLessThan(0.6);
    expect(Math.max(...deltas)).toBeGreaterThan(6);
  });

  it('flags a genuine breakout and a lost year', () => {
    let breakouts = 0;
    let busts = 0;
    for (let seed = 1; seed <= 600; seed += 1) {
      const p = player({ age: 22, ability: 66, potential: 92 });
      const outcome = developPlayer(p, NEUTRAL_CONTEXT, createRng(seed * 6151));
      if (outcome.breakout) breakouts += 1;
      if (outcome.bust) busts += 1;
    }
    expect(breakouts).toBeGreaterThan(0);
    expect(busts).toBeGreaterThan(0);
    // Neither should be the common case.
    expect(breakouts).toBeLessThan(400);
    expect(busts).toBeLessThan(400);
  });

  it('lets development rate separate two otherwise identical prospects', () => {
    const fast = meanDelta(() => player({ age: 22, ability: 66, potential: 92, devRate: 1.8 }));
    const slow = meanDelta(() => player({ age: 22, ability: 66, potential: 92, devRate: 0.4 }));
    expect(fast).toBeGreaterThan(slow * 2);
  });

  it('gives a player with no headroom nothing to gain', () => {
    expect(meanDelta(() => player({ age: 22, ability: 85, potential: 85 }))).toBeCloseTo(0, 6);
  });
});

describe('injury-driven decline', () => {
  it('accelerates decline for a player who has spent his career hurt', () => {
    const healthy = meanDelta(() => player({ age: 32, ability: 80, gamesMissedCareer: 0 }));
    const worn = meanDelta(() => player({ age: 32, ability: 80, gamesMissedCareer: 60 }));
    expect(worn).toBeLessThan(healthy);
  });

  it('rolls the season\'s missed games into the career total', () => {
    const p = player({ age: 30, gamesMissedSeason: 6, gamesMissedCareer: 10 });
    developPlayer(p, NEUTRAL_CONTEXT, createRng(1));
    expect(p.gamesMissedCareer).toBe(16);
    expect(p.gamesMissedSeason).toBe(0);
  });

  it('does not punish a young player for missed time on the growth side', () => {
    // Injury drives decline, not stunted growth. A hurt 23-year-old still
    // develops; a hurt 33-year-old falls apart faster.
    const clean = meanDelta(() => player({ age: 23, ability: 70, gamesMissedCareer: 0 }));
    const hurt = meanDelta(() => player({ age: 23, ability: 70, gamesMissedCareer: 40 }));
    expect(hurt).toBeCloseTo(clean, 1);
  });
});

describe('playing time and coaching', () => {
  it('develops a starter faster than a player who never sees the field', () => {
    const starter = meanDelta(() => player({ age: 22, ability: 66, potential: 90 }));
    let benched = 0;
    for (let seed = 1; seed <= 400; seed += 1) {
      const p = player({ age: 22, ability: 66, potential: 90 });
      benched += developPlayer(
        p, { playingTime: () => 0, coaching: () => 1 }, createRng(seed * 7919),
      ).delta;
    }
    expect(starter).toBeGreaterThan(benched / 400);
  });

  it('develops players faster under a good staff', () => {
    const run = (coaching: number): number => {
      let total = 0;
      for (let seed = 1; seed <= 400; seed += 1) {
        const p = player({ age: 22, ability: 66, potential: 90 });
        total += developPlayer(
          p, { playingTime: () => 1, coaching: () => coaching }, createRng(seed * 3301),
        ).delta;
      }
      return total / 400;
    };
    expect(run(1.3)).toBeGreaterThan(run(0.75));
  });
});
