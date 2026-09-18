// The whole report rests on these being right: a percentile that is quietly
// wrong would make every target comparison wrong in the same direction, and it
// would look entirely plausible.

import { describe, expect, it } from 'vitest';
import { histogram, shareWhere, summarize } from '../../scripts/sim-report/stats.ts';

describe('summarize', () => {
  it('reports exact order statistics for a known sample', () => {
    const s = summarize([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(s.n).toBe(10);
    expect(s.mean).toBeCloseTo(5.5, 10);
    expect(s.min).toBe(1);
    expect(s.max).toBe(10);
    // Sample standard deviation of 1..10 is sqrt(55/6).
    expect(s.sd).toBeCloseTo(Math.sqrt(55 / 6), 10);
  });

  it('returns actual observations for percentiles, never interpolations', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    const s = summarize(values);
    for (const p of [s.p05, s.p25, s.median, s.p75, s.p95, s.p99]) {
      expect(Number.isInteger(p)).toBe(true);
      expect(values).toContain(p);
    }
    expect(s.median).toBe(50);
    expect(s.p95).toBe(95);
  });

  it('sorts numerically rather than lexicographically', () => {
    // Array.prototype.sort on a plain array would order these 1, 10, 2, 9.
    const s = summarize([9, 10, 1, 2]);
    expect(s.min).toBe(1);
    expect(s.max).toBe(10);
  });

  it('does not mutate the caller-supplied sample', () => {
    const values = [5, 3, 1, 4];
    summarize(values);
    expect(values).toEqual([5, 3, 1, 4]);
  });

  it('handles a single observation and an empty sample', () => {
    expect(summarize([7]).sd).toBe(0);
    expect(summarize([7]).median).toBe(7);
    expect(summarize([]).n).toBe(0);
    expect(Number.isNaN(summarize([]).mean)).toBe(true);
  });

  it('works on the typed arrays the harness actually passes', () => {
    const s = summarize(Int16Array.from([4, 1, 3, 2]));
    expect(s.min).toBe(1);
    expect(s.max).toBe(4);
    expect(s.mean).toBeCloseTo(2.5, 10);
  });
});

describe('shareWhere', () => {
  it('counts the matching fraction', () => {
    expect(shareWhere([0, 0, 1, 1], (v) => v === 0)).toBe(0.5);
    expect(shareWhere([1, 2, 3], (v) => v > 5)).toBe(0);
  });
});

describe('histogram', () => {
  it('bins every observation exactly once', () => {
    const values = Array.from({ length: 500 }, (_, i) => i % 50);
    const bins = histogram(values, 0, 50, 10);
    expect(bins.reduce((a, b) => a + b.count, 0)).toBe(values.length);
    expect(bins).toHaveLength(5);
  });

  it('clamps outliers into the end bins rather than dropping them', () => {
    const bins = histogram([-100, 5, 900], 0, 10, 5);
    expect(bins.reduce((a, b) => a + b.count, 0)).toBe(3);
    expect(bins[0]?.count).toBe(1);
    expect(bins[bins.length - 1]?.count).toBe(2);
  });
});
