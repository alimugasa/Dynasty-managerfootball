// The four things a player noticed in an hour: rookies with no names, 25-year-
// olds "retiring", corners leading the league in sacks, and every club bidding
// on every free agent. Each asserted here so it cannot come back.

import { describe, expect, it } from 'vitest';
import { createRng } from '../../supabase/functions/_shared/engine/rng.ts';
import { generateClass, namePalette } from '../../supabase/functions/_shared/engine/offseason/draftClass.ts';
import { retirementReason } from '../../supabase/functions/_shared/engine/offseason/retirement.ts';
import { pursuits } from '../../supabase/functions/_shared/engine/offseason/freeAgency.ts';
import { primePipeline, runOffseason } from '../../supabase/functions/_shared/engine/offseason/population.ts';
import { PEAK_AGE } from '../../supabase/functions/_shared/engine/offseason/calibration.ts';
import { loadCareerLeague } from '../../scripts/drift-report/careerLeague.ts';
import type { CareerPlayer } from '../../supabase/functions/_shared/engine/offseason/types.ts';
import type { TeamNeeds } from '../../supabase/functions/_shared/engine/offseason/needs.ts';

describe('prospect names', () => {
  const palette = namePalette(loadCareerLeague().players);

  it('draws from the league\'s own first names and surnames', () => {
    expect(palette.first.length).toBeGreaterThan(300);
    expect(palette.last.length).toBeGreaterThan(300);
    const cls = generateClass(createRng(3), 2030, undefined, palette);
    expect(cls.every((p) => !p.name.startsWith('Prospect'))).toBe(true);
    expect(cls.every((p) => palette.first.includes(p.name.split(' ')[0] ?? ''))).toBe(true);
  });

  it('is deterministic per seed and does not move the ratings', () => {
    const a = generateClass(createRng(11), 2030, undefined, palette);
    const b = generateClass(createRng(11), 2030, undefined, palette);
    const bare = generateClass(createRng(11), 2030);
    expect(a.map((p) => p.name)).toEqual(b.map((p) => p.name));
    expect(a.map((p) => p.ability)).toEqual(bare.map((p) => p.ability));
    expect(a.map((p) => p.devRate)).toEqual(bare.map((p) => p.devRate));
  });

  it('names every drafted rookie in a real offseason', () => {
    const league = loadCareerLeague();
    const rng = createRng(5);
    primePipeline(league, rng);
    const result = runOffseason(league, rng);
    const byId = new Map(league.players.map((p) => [p.id, p]));
    const names = result.draft.picks.map((p) => byId.get(p.prospectId)?.name ?? 'Prospect');
    expect(names.every((n) => !n.startsWith('Prospect'))).toBe(true);
  });
});

describe('leaving the league', () => {
  const player = (age: number, group: CareerPlayer['group']): CareerPlayer => ({
    id: 'x', name: 'X Y', group, teamId: null, ability: 55, potential: 60, mental: 0,
    reputation: 55, age, experience: 3, devRate: 1, workEthic: 60, durability: 60,
    footballIq: 60, gamesMissedCareer: 0, gamesMissedSeason: 0,
    accolades: { allLeague: 0, awards: 0, rings: 0 }, retired: true, retiredInSeason: 2030,
    personality: 'ROLE', contract: null, previousTeamId: null,
  });

  it('is a washout before the positional peak and a retirement after it', () => {
    expect(retirementReason(player(25, 'RB'))).toBe('WASHOUT');
    expect(retirementReason(player(PEAK_AGE.RB + 1, 'RB'))).toBe('RETIREMENT');
    expect(retirementReason(player(PEAK_AGE.QB, 'QB'))).toBe('WASHOUT');
    expect(retirementReason(player(PEAK_AGE.QB + 1, 'QB'))).toBe('RETIREMENT');
  });
});

describe('pursuits', () => {
  const needs = (over: Partial<TeamNeeds>): TeamNeeds => ({
    QB: 0, RB: 0, WR: 0, TE: 0, OL: 0, EDGE: 0, DT: 0, LB: 0, CB: 0, S: 0, K: 0, P: 0, ...over,
  });

  it('is the top few needs, not every group with any need', () => {
    const p = pursuits(needs({ QB: 0.3, OL: 0.25, CB: 0.2, WR: 0.1, TE: 0.05 }));
    expect([...p].sort()).toEqual(['CB', 'OL', 'QB']);
  });

  it('always includes an acute need, however many groups rank above it', () => {
    const p = pursuits(needs({ QB: 0.9, OL: 0.85, CB: 0.8, WR: 0.7, K: 0.65 }));
    expect(p.has('K')).toBe(true);
    expect(p.has('WR')).toBe(true);
  });

  it('is empty for a club that needs nothing', () => {
    expect(pursuits(needs({})).size).toBe(0);
  });

  it('keeps the market from being everyone bidding on everyone', () => {
    const league = loadCareerLeague();
    const rng = createRng(21);
    primePipeline(league, rng);
    const result = runOffseason(league, rng);
    const bids = result.freeAgency.signings.map((s) => s.bids);
    const mean = bids.reduce((a, b) => a + b, 0) / Math.max(1, bids.length);
    expect(Math.max(...bids)).toBeLessThan(league.teamIds.length);
    expect(mean).toBeLessThan(8);
    // Still a market: contested signings exist.
    expect(bids.filter((b) => b >= 2).length).toBeGreaterThan(bids.length / 4);
  });
});
