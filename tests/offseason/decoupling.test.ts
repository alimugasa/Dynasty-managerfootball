// Ability, production and reputation must be three different numbers.
//
// This is the constraint that makes the game a game. If a season grade were a
// readout of ability, scouting would be trivial, every draft pick would be
// obvious, no player would ever break out, and no contract would ever be a
// mistake. The target is a correlation around 0.55: ability clearly dominant in
// aggregate, and routinely wrong about any individual season.

import { describe, expect, it } from 'vitest';
import { createRng } from '../../supabase/functions/_shared/engine/rng.ts';
import {
  correlation, developPlayer, gradeFromZ, gradeSeason, gradingPopulation,
  NEUTRAL_CONTEXT, OFFSEASON, seasonForm,
} from '../../supabase/functions/_shared/engine/offseason/index.ts';
import { player } from './fixtures.ts';

/** A league-shaped spread of abilities to grade. */
function population(n = 1500): ReturnType<typeof player>[] {
  const rng = createRng(4242);
  return Array.from({ length: n }, (_, i) =>
    player({ id: `P${i}`, ability: Math.max(40, Math.min(99, rng.normal(74, 9))) }));
}

describe('ability to season grade', () => {
  it('correlates around 0.55, not 1.0', () => {
    const players = population();
    const grades = gradeSeason(players, createRng(11), 2026);
    const r = correlation(grades.map((g) => g.ability), grades.map((g) => g.grade));
    expect(r).toBeGreaterThan(0.48);
    expect(r).toBeLessThan(0.62);
  });

  it('holds that correlation across independent seasons', () => {
    const players = population();
    const rng = createRng(99);
    const abilities: number[] = [];
    const grades: number[] = [];
    for (let season = 0; season < 12; season += 1) {
      for (const g of gradeSeason(players, rng, 2026 + season)) {
        abilities.push(g.ability);
        grades.push(g.grade);
      }
    }
    const r = correlation(abilities, grades);
    expect(r).toBeGreaterThan(0.5);
    expect(r).toBeLessThan(0.6);
  });

  it('lets a lesser player out-grade a better one, often', () => {
    const rng = createRng(7);
    const strong = player({ id: 'A', ability: 90 });
    const weak = player({ id: 'B', ability: 76 });
    const pool = [...population(400), strong, weak];
    let upsets = 0;
    for (let season = 0; season < 200; season += 1) {
      const grades = gradeSeason(pool, rng, 2026 + season);
      const a = grades.find((g) => g.playerId === 'A');
      const b = grades.find((g) => g.playerId === 'B');
      if (a !== undefined && b !== undefined && b.grade > a.grade) upsets += 1;
    }
    // A fourteen-point ability gap should still lose sometimes, but not usually.
    expect(upsets).toBeGreaterThan(20);
    expect(upsets).toBeLessThan(100);
  });

  it('still ranks the league correctly on average', () => {
    const rng = createRng(31);
    const elite = player({ id: 'E', ability: 95 });
    const poor = player({ id: 'W', ability: 58 });
    const pool = [...population(400), elite, poor];
    let eliteTotal = 0;
    let poorTotal = 0;
    for (let season = 0; season < 100; season += 1) {
      const grades = gradeSeason(pool, rng, 2026 + season);
      eliteTotal += grades.find((g) => g.playerId === 'E')?.grade ?? 0;
      poorTotal += grades.find((g) => g.playerId === 'W')?.grade ?? 0;
    }
    expect(eliteTotal / 100).toBeGreaterThan(poorTotal / 100 + 10);
  });

  it('grades a player who missed most of the season more noisily', () => {
    const spread = (missed: number): number => {
      const rng = createRng(77);
      const subject = player({ id: 'S', ability: 75, gamesMissedSeason: missed });
      const pool = [...population(300), subject];
      const values: number[] = [];
      for (let s = 0; s < 400; s += 1) {
        const found = gradeSeason(pool, rng, 2026 + s).find((g) => g.playerId === 'S');
        if (found !== undefined) values.push(found.gradeZ);
      }
      const m = values.reduce((a, b) => a + b, 0) / values.length;
      return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length);
    };
    expect(spread(15)).toBeGreaterThan(spread(0));
  });
});

describe('grade scale', () => {
  it('is monotonic and bounded', () => {
    expect(gradeFromZ(-4)).toBeGreaterThanOrEqual(OFFSEASON.grading.gradeMin);
    expect(gradeFromZ(6)).toBeLessThanOrEqual(OFFSEASON.grading.gradeMax);
    expect(gradeFromZ(1)).toBeGreaterThan(gradeFromZ(0));
    expect(gradeFromZ(3)).toBeGreaterThan(gradeFromZ(2));
  });

  it('compresses the top so a historic season stays distinguishable', () => {
    // Without the knee both land on the ceiling and become the same season.
    const gap = gradeFromZ(3) - gradeFromZ(2);
    const midGap = gradeFromZ(1) - gradeFromZ(0);
    expect(gap).toBeLessThan(midGap);
    expect(gradeFromZ(4)).toBeGreaterThan(gradeFromZ(3));
  });
});

describe('form', () => {
  it('is standardised, so the weight is the correlation', () => {
    const players = population(4000);
    const pop = gradingPopulation(players);
    const rng = createRng(5);
    const forms = players.map((p) => seasonForm(p, pop, rng));
    const m = forms.reduce((a, b) => a + b, 0) / forms.length;
    const sd = Math.sqrt(forms.reduce((a, b) => a + (b - m) ** 2, 0) / forms.length);
    expect(Math.abs(m)).toBeLessThan(0.08);
    expect(sd).toBeGreaterThan(0.92);
    expect(sd).toBeLessThan(1.08);
  });

  it('does not shift when the league\'s absolute level moves', () => {
    // Grades are relative to peers, so an inflated league grades the same.
    const base = population(2000);
    const inflated = base.map((p) => player({ ...p, ability: p.ability + 8 }));
    const gradeMean = (pool: ReturnType<typeof player>[]): number => {
      const grades = gradeSeason(pool, createRng(3), 2026);
      return grades.reduce((a, g) => a + g.grade, 0) / grades.length;
    };
    expect(Math.abs(gradeMean(base) - gradeMean(inflated))).toBeLessThan(1.5);
  });
});

describe('reputation', () => {
  it('lags ability rather than tracking it', () => {
    const p = player({ age: 31, ability: 88, potential: 88, reputation: 88 });
    const rng = createRng(21);
    for (let i = 0; i < 4; i += 1) developPlayer(p, NEUTRAL_CONTEXT, rng);
    // He has declined; the market has not fully noticed. This is the mechanism
    // that makes veterans get overpaid.
    expect(p.ability).toBeLessThan(88);
    expect(p.reputation).toBeGreaterThan(p.ability);
  });

  it('trails a riser, which is how young players stay cheap', () => {
    const p = player({ age: 22, ability: 66, potential: 95, reputation: 66 });
    const rng = createRng(22);
    for (let i = 0; i < 3; i += 1) developPlayer(p, NEUTRAL_CONTEXT, rng);
    expect(p.ability).toBeGreaterThan(66);
    expect(p.reputation).toBeLessThan(p.ability);
  });

  it('is inflated by accolades that outlive the ability', () => {
    const plain = player({ age: 33, ability: 78, reputation: 78 });
    const decorated = player({
      age: 33, ability: 78, reputation: 78,
      accolades: { allLeague: 4, awards: 1, rings: 0 },
    });
    developPlayer(plain, NEUTRAL_CONTEXT, createRng(9));
    developPlayer(decorated, NEUTRAL_CONTEXT, createRng(9));
    expect(decorated.reputation).toBeGreaterThan(plain.reputation);
  });
});
