// Determinism is the property the whole engine rests on. A save stores a seed,
// not a result; a golden file compares a seed to an expected outcome; a bug
// report is only reproducible if the same seed replays the same game. Every
// other guarantee in the simulation is downstream of this one.

import { describe, expect, it } from 'vitest';
import { createRng } from '../../supabase/functions/_shared/engine/rng.ts';
import { simulateGame } from '../../supabase/functions/_shared/engine/simulateGame.ts';
import type { GameResult } from '../../supabase/functions/_shared/engine/types.ts';
import { averageMatchup, buildTeam } from './fixtures.ts';

function play(seed: number): GameResult {
  const { home, away } = averageMatchup();
  return simulateGame(home, away, createRng(seed));
}

/** Recursively freeze, so any write by the engine throws in module strict mode. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

describe('rng determinism', () => {
  it('replays an identical stream for the same seed', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const drawsA = Array.from({ length: 500 }, () => a.uint32());
    const drawsB = Array.from({ length: 500 }, () => b.uint32());
    expect(drawsA).toEqual(drawsB);
  });

  it('produces different streams for different seeds', () => {
    const a = Array.from({ length: 50 }, (_, i) => createRng(i).uint32());
    expect(new Set(a).size).toBeGreaterThan(45);
  });

  it('stays inside the unit interval', () => {
    const rng = createRng(99);
    for (let i = 0; i < 10_000; i += 1) {
      const value = rng.float();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('has an approximately uniform float distribution', () => {
    const rng = createRng(2026);
    const buckets = new Array<number>(10).fill(0);
    const draws = 100_000;
    for (let i = 0; i < draws; i += 1) {
      const bucket = Math.floor(rng.float() * 10);
      buckets[bucket] = (buckets[bucket] ?? 0) + 1;
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan(draws / 10 - 900);
      expect(count).toBeLessThan(draws / 10 + 900);
    }
  });

  it('produces normal deviates with the requested mean and spread', () => {
    const rng = createRng(4242);
    const draws = 50_000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < draws; i += 1) {
      const value = rng.normal(10, 3);
      sum += value;
      sumSq += value * value;
    }
    const mean = sum / draws;
    const sd = Math.sqrt(sumSq / draws - mean * mean);
    expect(mean).toBeGreaterThan(9.9);
    expect(mean).toBeLessThan(10.1);
    expect(sd).toBeGreaterThan(2.9);
    expect(sd).toBeLessThan(3.1);
  });
});

describe('game determinism', () => {
  it('returns an identical result for the same seed', () => {
    expect(play(2026)).toEqual(play(2026));
  });

  it('replays the entire play-by-play, not just the score', () => {
    const first = play(881);
    const second = play(881);
    expect(second.plays.length).toBe(first.plays.length);
    expect(second.plays).toEqual(first.plays);
    expect(second.players).toEqual(first.players);
    expect(second.injuries).toEqual(first.injuries);
  });

  it('holds across many seeds', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const a = play(seed);
      const b = play(seed);
      expect(`${a.homeScore}-${a.awayScore}@${a.plays.length}`)
        .toBe(`${b.homeScore}-${b.awayScore}@${b.plays.length}`);
    }
  });

  it('produces genuinely different games for different seeds', () => {
    const signatures = new Set<string>();
    for (let seed = 1; seed <= 40; seed += 1) {
      const result = play(seed);
      signatures.add(`${result.homeScore}-${result.awayScore}-${result.plays.length}`);
    }
    // Distinct scorelines across 40 seeds: a constant engine would collapse here.
    expect(signatures.size).toBeGreaterThan(30);
  });

  it('does not depend on Math.random', () => {
    const original = Math.random;
    Math.random = () => {
      throw new Error('the engine must not call Math.random');
    };
    try {
      expect(() => play(555)).not.toThrow();
    } finally {
      Math.random = original;
    }
  });

  it('does not mutate the team states it is given', () => {
    const home = deepFreeze(buildTeam({ id: 'FRZ', abbreviation: 'FRZ', seed: 3 }));
    const away = deepFreeze(buildTeam({ id: 'ICE', abbreviation: 'ICE', seed: 4 }));
    expect(() => simulateGame(home, away, createRng(17))).not.toThrow();
  });

  it('can be replayed from the same team objects twice', () => {
    const { home, away } = averageMatchup();
    const first = simulateGame(home, away, createRng(64));
    const second = simulateGame(home, away, createRng(64));
    expect(second).toEqual(first);
  });

  it('advances the generator, so consecutive games differ', () => {
    const { home, away } = averageMatchup();
    const rng = createRng(1234);
    const first = simulateGame(home, away, rng);
    const second = simulateGame(home, away, rng);
    expect(second.plays.length !== first.plays.length ||
      second.homeScore !== first.homeScore ||
      second.awayScore !== first.awayScore).toBe(true);
  });
});
