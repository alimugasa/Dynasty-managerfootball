// Next year's calendar keeps this year's shape.

import { describe, expect, it } from 'vitest';
import { createRng } from '../../supabase/functions/_shared/engine/rng.ts';
import { buildSchedule, permuteSchedule, type Fixture } from '../../supabase/functions/_shared/engine/season.ts';

const teams = Array.from({ length: 32 }, (_, i) => `T${String(i + 1).padStart(2, '0')}`);

/** 17 games over 18 weeks with byes in weeks 5-14, the seed's shape. */
function seventeenWithByes(): Fixture[] {
  const full = buildSchedule(teams, 18);
  const dropped = new Set<string>();
  const out: Fixture[] = [];
  // One game removed from each of 16 middle weeks: the two clubs in it take
  // their bye there. The pairs are a perfect matching (week 18's), so every
  // club rests exactly once.
  const matching = full.filter((f) => f.week === 18);
  for (const f of full) {
    if (f.week === 18) continue;
    const pair = matching[f.week - 3];
    if (f.week >= 3 && f.week <= 18 && pair !== undefined
        && !dropped.has(pair.homeTeamId)
        && (f.homeTeamId === pair.homeTeamId || f.awayTeamId === pair.homeTeamId
            || f.homeTeamId === pair.awayTeamId || f.awayTeamId === pair.awayTeamId)) {
      continue;
    }
    out.push(f);
  }
  return out;
}

const games = (fixtures: readonly Fixture[]): Map<string, number> => {
  const n = new Map<string, number>();
  for (const f of fixtures) {
    n.set(f.homeTeamId, (n.get(f.homeTeamId) ?? 0) + 1);
    n.set(f.awayTeamId, (n.get(f.awayTeamId) ?? 0) + 1);
  }
  return n;
};

describe('permuteSchedule', () => {
  const shape = buildSchedule(teams, 18);

  it('keeps every club\'s game count, every week\'s size, and the home/away split', () => {
    const next = permuteSchedule(shape, teams, createRng(7));
    expect(next.length).toBe(shape.length);
    expect([...games(next).values()]).toEqual([...games(shape).values()]);
    for (let w = 1; w <= 18; w += 1) {
      expect(next.filter((f) => f.week === w).length).toBe(shape.filter((f) => f.week === w).length);
    }
    const homes = (fx: readonly Fixture[]): number[] =>
      [...games(fx.map((f) => ({ ...f, awayTeamId: '__none__' }))).values()].sort();
    expect(homes(next)).toEqual(homes(shape));
  });

  it('changes who plays whom, the same way for the same seed', () => {
    const a = permuteSchedule(shape, teams, createRng(7));
    const b = permuteSchedule(shape, teams, createRng(7));
    const c = permuteSchedule(shape, teams, createRng(8));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    const key = (f: Fixture): string => `${String(f.week)}:${f.homeTeamId}-${f.awayTeamId}`;
    const same = a.filter((f, i) => key(f) === key(shape[i] as Fixture)).length;
    expect(same).toBeLessThan(shape.length / 4);
  });

  it('refuses a shape for a different number of clubs', () => {
    expect(() => permuteSchedule(shape, teams.slice(0, 30), createRng(1))).toThrow(/30/);
  });

  it('keeps a bye where the shape had one', () => {
    const withByes = seventeenWithByes();
    const next = permuteSchedule(withByes, teams, createRng(3));
    expect(new Set(games(next).values())).toEqual(new Set(games(withByes).values()));
  });
});
