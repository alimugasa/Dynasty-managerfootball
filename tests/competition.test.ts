import { describe, expect, it } from 'vitest';
import { aggregate, type Competition, type CompetitionSplit } from '../src/domain/competition';

interface Row { competition: Competition; yards: number }

const rows: Row[] = [
  { competition: 'REGULAR_SEASON', yards: 1544 },
  { competition: 'PLAYOFFS', yards: 256 },
];

describe('regular-season / playoff separation', () => {
  it('aggregates each competition independently', () => {
    const reg = aggregate(rows, 'REGULAR_SEASON', (r) => r.competition, (a, r) => a + r.yards, 0);
    const post = aggregate(rows, 'PLAYOFFS', (r) => r.competition, (a, r) => a + r.yards, 0);
    expect(reg).toBe(1544);
    expect(post).toBe(256);
  });

  it('CompetitionSplit has no combined field', () => {
    const split: CompetitionSplit<number> = { REGULAR_SEASON: 1544, PLAYOFFS: 256 };
    expect(Object.keys(split).sort()).toEqual(['PLAYOFFS', 'REGULAR_SEASON']);
    // @ts-expect-error there is deliberately no combined/total field
    expect(split.TOTAL).toBeUndefined();
  });
});
