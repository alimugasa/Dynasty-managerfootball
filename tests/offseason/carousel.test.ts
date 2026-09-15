// The coaching carousel: who goes, who arrives, and on what evidence.

import { describe, expect, it } from 'vitest';
import {
  CAROUSEL, expectedWins, generateCoach, retirementChance, runCarousel, seatAfter,
  type CoachRecord,
} from '../../supabase/functions/_shared/engine/offseason/carousel.ts';
import {
  headCoachOf, coachInRole, staffOf, type CareerCoach,
} from '../../supabase/functions/_shared/engine/offseason/coaches.ts';
import { namePalette } from '../../supabase/functions/_shared/engine/offseason/draftClass.ts';
import { createRng } from '../../supabase/functions/_shared/engine/rng.ts';
import { primePipeline, runOffseason } from '../../supabase/functions/_shared/engine/offseason/population.ts';
import { loadCareerLeague } from '../../scripts/drift-report/careerLeague.ts';

const coach = (over: Partial<CareerCoach> = {}): CareerCoach => ({
  id: 'C1', name: 'A Coach', teamId: 'AAA', role: 'HEAD_COACH', tree: 'OFFENSE',
  age: 50, experience: 20, yearsWithTeam: 4, seasonsAsHeadCoach: 6,
  playCalling: 60, gameManagement: 60, clockManagement: 60, aggressiveness: 50,
  development: 60, evaluation: 60, leadership: 60, ability: 60, reputation: 60,
  careerWins: 0, careerLosses: 0, careerTies: 0, rings: 0, hotSeat: 30, retired: false,
  ...over,
});

const season = (wins: number, over: Partial<CoachRecord> = {}): CoachRecord =>
  ({ wins, losses: 17 - wins, ties: 0, expectedWins: 9, ...over });

/** Every club's season, so the carousel has evidence to act on. */
function records(teamIds: readonly string[], wins: (i: number) => number): Map<string, CoachRecord> {
  return new Map(teamIds.map((id, i) => [id, season(wins(i))]));
}

describe('the seat', () => {
  it('cools when a club beats what its roster promised', () => {
    const warm = coach({ hotSeat: 60 });
    expect(seatAfter(warm, season(13))).toBeLessThan(60);
  });

  it('heats when it falls short, and further the further short', () => {
    const c = coach({ hotSeat: 40 });
    const near = seatAfter(c, season(8));
    const far = seatAfter(c, season(3));
    expect(far).toBeGreaterThan(near);
    expect(near).toBeGreaterThan(40 * 0.5);
  });

  it('judges against the roster, not against .500', () => {
    const c = coach({ hotSeat: 50 });
    // Nine wins with a roster that should win six is a good season; nine with
    // a roster that should win thirteen is not.
    const overachieving = seatAfter(c, { wins: 9, losses: 8, ties: 0, expectedWins: 6 });
    const underachieving = seatAfter(c, { wins: 9, losses: 8, ties: 0, expectedWins: 13 });
    expect(overachieving).toBeLessThan(underachieving);
  });

  it('all but clears the seat for a champion', () => {
    expect(seatAfter(coach({ hotSeat: 80 }), season(12, { champion: true }))).toBeLessThan(30);
  });

  it('expects more of a better roster', () => {
    expect(expectedWins(80, 70, 17)).toBeGreaterThan(expectedWins(60, 70, 17));
    expect(expectedWins(70, 70, 17)).toBeCloseTo(8.5, 5);
  });
});

describe('leaving the profession', () => {
  it('nobody retires young, everybody retires eventually', () => {
    expect(retirementChance(coach({ age: 45 }))).toBe(0);
    expect(retirementChance(coach({ age: 61 }))).toBe(0);
    expect(retirementChance(coach({ age: 80 }))).toBe(1);
    expect(retirementChance(coach({ age: 70 })))
      .toBeGreaterThan(retirementChance(coach({ age: 64 })));
  });
});

describe('a winter of moves', () => {
  const league = loadCareerLeague();
  const rng = createRng(4242);
  // Half the league misses badly, so there is something to act on.
  const table = records(league.teamIds, (i) => (i % 2 === 0 ? 2 : 14));
  // Two seasons of it: nobody is fired on one year, so the first winter sets
  // the seats and the second acts on them.
  runCarousel(league, table, rng);
  const result = runCarousel(league, table, rng);

  it('fires the clubs that fell furthest short, and bounds the turnover', () => {
    const fired = result.moves.filter((m) => m.kind === 'FIRED');
    expect(fired.length).toBeGreaterThan(0);
    expect(fired.length).toBeLessThanOrEqual(league.teamIds.length * CAROUSEL.maxFiringsShare);
    // Everyone fired coached one of the clubs that lost.
    for (const move of fired) {
      const record = table.get(move.fromTeamId ?? '');
      expect(record?.wins).toBe(2);
      expect(move.record).toBe('2-15');
    }
  });

  it('leaves every club with a head coach and both coordinators', () => {
    for (const teamId of league.teamIds) {
      expect(headCoachOf(league.coaches, teamId), `${teamId} has nobody in charge`).toBeDefined();
      expect(coachInRole(league.coaches, teamId, 'OFFENSIVE_COORDINATOR')).toBeDefined();
      expect(coachInRole(league.coaches, teamId, 'DEFENSIVE_COORDINATOR')).toBeDefined();
    }
  });

  it('gives nobody two jobs', () => {
    const employed = league.coaches.filter((c) => !c.retired && c.teamId !== null);
    expect(new Set(employed.map((c) => c.id)).size).toBe(employed.length);
    for (const teamId of league.teamIds) {
      const staff = staffOf(league.coaches, teamId);
      expect(staff.filter((c) => c.role === 'HEAD_COACH').length).toBe(1);
    }
  });

  it('credits the season to the coaches who worked it', () => {
    const worked = league.coaches.filter((c) => c.careerWins + c.careerLosses > 0);
    expect(worked.length).toBeGreaterThan(100);
    for (const c of worked) expect(c.careerWins + c.careerLosses + c.careerTies).toBeGreaterThan(0);
  });

  it('hands the champion\'s staff a ring', () => {
    const league2 = loadCareerLeague();
    const champion = league2.teamIds[0] ?? '';
    const table2 = new Map(league2.teamIds.map((id) =>
      [id, season(12, { champion: id === champion, madePlayoffs: id === champion })]));
    runCarousel(league2, table2, createRng(7));
    for (const c of staffOf(league2.coaches, champion)) {
      // Everyone who was there when it was won, which excludes a coach hired
      // in the same winter.
      if (c.yearsWithTeam > 0) expect(c.rings).toBe(1);
    }
  });
});

describe('the pool', () => {
  it('names new coaches from the league\'s own names, and never repeats an id', () => {
    const league = loadCareerLeague();
    const palette = namePalette(league.players);
    const rng = createRng(11);
    const made = Array.from({ length: 40 }, (_, i) => generateCoach(rng, palette, 2030, i));
    expect(new Set(made.map((c) => c.id)).size).toBe(40);
    for (const c of made) {
      expect(c.name.split(' ').length).toBeGreaterThanOrEqual(2);
      expect(c.teamId).toBeNull();
      expect(c.careerWins).toBe(0);
    }
  });

  it('keeps candidates available over twenty seasons of turnover', () => {
    const league = loadCareerLeague();
    const rng = createRng(2026);
    primePipeline(league, rng);
    for (let year = 0; year < 20; year += 1) {
      const table = records(league.teamIds, (i) => (i % 3 === 0 ? 4 : 11));
      runOffseason(league, rng, { records: table });
      for (const teamId of league.teamIds) {
        expect(headCoachOf(league.coaches, teamId), `${teamId} in year ${String(year)}`).toBeDefined();
      }
      expect(league.coaches.filter((c) => c.teamId === null).length).toBeGreaterThan(0);
    }
    // Twenty years on, the room is not the seed's room any more.
    const fresh = league.coaches.filter((c) => c.id.startsWith('CCH20'));
    expect(fresh.length).toBeGreaterThan(0);
  }, 120_000);
});
