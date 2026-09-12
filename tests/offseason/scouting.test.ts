// The fog must be honest. A band that does not contain the truth at its stated
// rate is decoration: it looks like information and misleads every decision made
// on it.

import { describe, expect, it } from 'vitest';
import { createRng } from '../../supabase/functions/_shared/engine/rng.ts';
import {
  allocateScouting, generateClass, SCOUTING, scoutClass, scoutProspect, scoutingSigma,
  type TeamFront,
} from '../../supabase/functions/_shared/engine/offseason/index.ts';
import { POSITION_GROUPS, type PositionGroup } from '../../supabase/functions/_shared/engine/types.ts';

function front(overrides: Partial<TeamFront> = {}): TeamFront {
  return {
    id: 'AAA', scouting: 60, spending: 60, winNow: 0.5,
    prestige: 55, recentWinRate: 0.5, scoutingSpend: 1, ...overrides,
  };
}

const flatNeeds = Object.fromEntries(POSITION_GROUPS.map((g) => [g, 0.5])) as
  Record<PositionGroup, number>;

describe('scouting sigma', () => {
  it('narrows with a better department', () => {
    expect(scoutingSigma(front({ scouting: 95 }), 1))
      .toBeLessThan(scoutingSigma(front({ scouting: 20 }), 1));
  });

  it('narrows with spend, holding the department fixed', () => {
    const club = front({ scouting: 60 });
    expect(scoutingSigma(club, 2.5)).toBeLessThan(scoutingSigma(club, 0));
  });

  it('never collapses to certainty, however good and however rich', () => {
    expect(scoutingSigma(front({ scouting: 99 }), 10))
      .toBeGreaterThanOrEqual(SCOUTING.floorSigma);
  });

  it('leaves the department the stronger lever', () => {
    // Money buys coverage, not a better eye. A rich club with poor scouts
    // should still read a class worse than a poor club with good ones.
    const richButPoor = scoutingSigma(front({ scouting: 20 }), 2.5);
    const poorButGood = scoutingSigma(front({ scouting: 95 }), 0);
    expect(poorButGood).toBeLessThan(richButPoor);
  });
});

describe('band calibration', () => {
  /** Share of a class whose true rating falls inside the reported band. */
  function coverage(club: TeamFront, seed: number): number {
    const rng = createRng(seed);
    const prospects = generateClass(rng, 2027);
    const reports = scoutClass(prospects, club, flatNeeds, rng);
    let inside = 0;
    for (const prospect of prospects) {
      const report = reports.get(prospect.id);
      if (report === undefined) continue;
      if (prospect.ability >= report.low && prospect.ability <= report.high) inside += 1;
    }
    return inside / prospects.length;
  }

  it('contains the truth about 80% of the time, for a weak club', () => {
    const rate = coverage(front({ scouting: 25, scoutingSpend: 0.6 }), 11);
    expect(rate).toBeGreaterThan(0.73);
    expect(rate).toBeLessThan(0.87);
  });

  it('contains the truth about 80% of the time, for an elite club', () => {
    // The band narrows; it does not become more or less honest.
    const rate = coverage(front({ scouting: 95, scoutingSpend: 1.4 }), 12);
    expect(rate).toBeGreaterThan(0.73);
    expect(rate).toBeLessThan(0.87);
  });

  it('gives an elite club a much narrower band than a weak one', () => {
    const rng = createRng(3);
    const prospects = generateClass(rng, 2027);
    const width = (club: TeamFront): number => {
      const reports = scoutClass(prospects, club, flatNeeds, createRng(9));
      const widths = [...reports.values()].map((r) => r.high - r.low);
      return widths.reduce((a, b) => a + b, 0) / widths.length;
    };
    const elite = width(front({ scouting: 95, scoutingSpend: 1.4 }));
    const weak = width(front({ scouting: 25, scoutingSpend: 0.6 }));
    expect(elite).toBeLessThan(weak * 0.6);
  });

  it('makes a better club wrong by less', () => {
    const rng = createRng(4);
    const prospects = generateClass(rng, 2027);
    const error = (club: TeamFront): number => {
      const reports = scoutClass(prospects, club, flatNeeds, createRng(21));
      let total = 0;
      for (const prospect of prospects) {
        const report = reports.get(prospect.id);
        if (report !== undefined) total += Math.abs(report.estimate - prospect.ability);
      }
      return total / prospects.length;
    };
    expect(error(front({ scouting: 95, scoutingSpend: 1.4 })))
      .toBeLessThan(error(front({ scouting: 25, scoutingSpend: 0.6 })));
  });

  it('reads potential less reliably than current ability', () => {
    const rng = createRng(5);
    const prospects = generateClass(rng, 2027);
    let abilityError = 0;
    let potentialError = 0;
    const club = front();
    for (const prospect of prospects) {
      const report = scoutProspect(prospect, club, 1, rng);
      abilityError += Math.abs(report.estimate - prospect.ability);
      potentialError += Math.abs(report.potentialEstimate - prospect.potential);
    }
    expect(potentialError).toBeGreaterThan(abilityError);
  });
});

describe('budget allocation', () => {
  it('concentrates on positions the club needs', () => {
    const rng = createRng(7);
    const prospects = generateClass(rng, 2027);
    const needs = { ...flatNeeds, QB: 1, K: 0 } as Record<PositionGroup, number>;
    const allocation = allocateScouting(prospects, front(), needs);

    const meanFor = (group: PositionGroup): number => {
      const values = prospects.filter((p) => p.group === group)
        .map((p) => allocation.get(p.id) ?? 0);
      return values.reduce((a, b) => a + b, 0) / Math.max(values.length, 1);
    };
    expect(meanFor('QB')).toBeGreaterThan(meanFor('K'));
  });

  it('gives a bigger budget more to spend everywhere', () => {
    const rng = createRng(8);
    const prospects = generateClass(rng, 2027);
    const total = (spend: number): number => {
      const allocation = allocateScouting(prospects, front({ scoutingSpend: spend }), flatNeeds);
      return [...allocation.values()].reduce((a, b) => a + b, 0);
    };
    expect(total(1.4)).toBeGreaterThan(total(0.6));
  });

  it('is deterministic for the same inputs', () => {
    const prospects = generateClass(createRng(9), 2027);
    const a = allocateScouting(prospects, front(), flatNeeds);
    const b = allocateScouting(prospects, front(), flatNeeds);
    expect([...a.entries()]).toEqual([...b.entries()]);
  });
});
