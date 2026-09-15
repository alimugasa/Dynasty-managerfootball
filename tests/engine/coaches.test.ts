// The staffs: who a club employs, what they decide, and what they are worth.

import { describe, expect, it } from 'vitest';
import {
  coachingStateFor, coachInRole, developmentContext, developmentRating,
  DEVELOPMENT_SPREAD, employed, evaluationRating, headCoachOf, LEAGUE_AVERAGE_RATING,
  playingTimeFrom, staffOf, staffRating, unemployed, type CareerCoach,
} from '../../supabase/functions/_shared/engine/offseason/coaches.ts';
import { developPlayer } from '../../supabase/functions/_shared/engine/offseason/development.ts';
import { teamStateFor } from '../../supabase/functions/_shared/engine/careerBridge.ts';
import { createRng } from '../../supabase/functions/_shared/engine/rng.ts';
import { STARTERS } from '../../supabase/functions/_shared/engine/types.ts';
import { loadCareerLeague } from '../../scripts/drift-report/careerLeague.ts';
import { player } from '../offseason/fixtures.ts';

const coach = (over: Partial<CareerCoach> = {}): CareerCoach => ({
  id: 'C1', name: 'A Coach', teamId: 'AAA', role: 'HEAD_COACH', tree: 'OFFENSE',
  age: 50, experience: 20, yearsWithTeam: 3, seasonsAsHeadCoach: 5,
  playCalling: 60, gameManagement: 60, clockManagement: 60, aggressiveness: 50,
  development: 60, evaluation: 60, leadership: 60,
  ability: 60, reputation: 60,
  careerWins: 0, careerLosses: 0, careerTies: 0, rings: 0, hotSeat: 30, retired: false,
  ...over,
});

describe('a staff, as the seed ships it', () => {
  const league = loadCareerLeague();

  it('gives every club a head coach and both coordinators', () => {
    expect(league.coaches.length).toBeGreaterThan(400);
    for (const teamId of league.teamIds) {
      expect(headCoachOf(league.coaches, teamId), `${teamId} has no head coach`).toBeDefined();
      expect(coachInRole(league.coaches, teamId, 'OFFENSIVE_COORDINATOR')).toBeDefined();
      expect(coachInRole(league.coaches, teamId, 'DEFENSIVE_COORDINATOR')).toBeDefined();
      expect(staffOf(league.coaches, teamId).length).toBeGreaterThan(5);
    }
    expect(employed(league.coaches).length).toBe(league.coaches.length - unemployed(league.coaches).length);
  });

  it('carries no coaching record, because the seed has none to carry', () => {
    for (const c of league.coaches) {
      expect(c.careerWins + c.careerLosses + c.careerTies).toBe(0);
      expect(c.rings).toBe(0);
    }
  });

  it('reads a club with no staff as league average rather than as an error', () => {
    expect(staffRating([], 'AAA')).toBe(LEAGUE_AVERAGE_RATING);
    expect(developmentRating([], 'AAA')).toBe(LEAGUE_AVERAGE_RATING);
    expect(evaluationRating([], 'AAA')).toBe(LEAGUE_AVERAGE_RATING);
    expect(coachingStateFor([], 'AAA').playCalling).toBe(LEAGUE_AVERAGE_RATING);
  });
});

describe('what a staff decides on a Sunday', () => {
  it('lets the coordinator call the plays and the head coach manage the game', () => {
    const staff = [
      coach({ id: 'HC', role: 'HEAD_COACH', playCalling: 20, gameManagement: 80, clockManagement: 75, aggressiveness: 70 }),
      coach({ id: 'OC', role: 'OFFENSIVE_COORDINATOR', playCalling: 90 }),
    ];
    const state = coachingStateFor(staff, 'AAA');
    expect(state.playCalling).toBe(90);
    expect(state.gameManagement).toBe(80);
    expect(state.clockManagement).toBe(75);
    expect(state.aggressiveness).toBe(70);
  });

  it('falls back to the head coach when a club has no offensive coordinator', () => {
    const staff = [coach({ id: 'HC', role: 'HEAD_COACH', playCalling: 44 })];
    expect(coachingStateFor(staff, 'AAA').playCalling).toBe(44);
  });

  it('reaches the club a game is played with', () => {
    const squad = [player({ id: 'p1', teamId: 'AAA', group: 'QB' })];
    const staff = [
      coach({ id: 'HC', role: 'HEAD_COACH', gameManagement: 81 }),
      coach({ id: 'OC', role: 'OFFENSIVE_COORDINATOR', playCalling: 88 }),
    ];
    const state = teamStateFor('AAA', squad, { coaches: staff });
    expect(state.coaching.playCalling).toBe(88);
    expect(state.coaching.gameManagement).toBe(81);
  });
});

describe('development, redistributed rather than created', () => {
  const league = loadCareerLeague();

  it('centres the league on one, so staffs move growth between clubs and not into it', () => {
    const context = developmentContext(league.coaches, league.teamIds);
    const values = league.teamIds.map((id) => context.coaching(id));
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean).toBeGreaterThan(0.99);
    expect(mean).toBeLessThan(1.01);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(1 - DEVELOPMENT_SPREAD);
    expect(Math.max(...values)).toBeLessThanOrEqual(1 + DEVELOPMENT_SPREAD);
    // The clubs are not all the same: a staff that develops is worth something.
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.1);
  });

  it('grows a prospect faster on the best staff than on the worst', () => {
    const context = developmentContext(league.coaches, league.teamIds);
    const ranked = [...league.teamIds].sort(
      (a, b) => context.coaching(b) - context.coaching(a));
    const best = ranked[0] ?? '';
    const worst = ranked[ranked.length - 1] ?? '';
    const grow = (teamId: string): number => {
      let total = 0;
      for (let seed = 1; seed <= 40; seed += 1) {
        const p = player({ id: 'x', teamId, group: 'WR', age: 23, ability: 62, potential: 88 });
        developPlayer(p, context, createRng(seed));
        total += p.ability - 62;
      }
      return total / 40;
    };
    expect(grow(best)).toBeGreaterThan(grow(worst));
  });

  it('develops a free agent at the league rate, not at nobody\'s rate', () => {
    const context = developmentContext(league.coaches, league.teamIds);
    expect(context.coaching(null)).toBe(1);
  });

  it('gives a starter more of the offseason than a fourth-stringer', () => {
    const squad = [
      player({ id: 'a', teamId: 'AAA', group: 'WR', ability: 88 }),
      player({ id: 'b', teamId: 'AAA', group: 'WR', ability: 80 }),
      player({ id: 'c', teamId: 'AAA', group: 'WR', ability: 70 }),
      player({ id: 'd', teamId: 'AAA', group: 'WR', ability: 55 }),
      player({ id: 'e', teamId: 'AAA', group: 'WR', ability: 50 }),
      player({ id: 'f', teamId: 'AAA', group: 'WR', ability: 45 }),
      player({ id: 'g', teamId: 'AAA', group: 'WR', ability: 40 }),
    ];
    const time = playingTimeFrom(squad, STARTERS);
    expect(time(squad[0] as never)).toBe(1);
    expect(time(squad[6] as never)).toBeLessThan(1);
    expect(time(squad[0] as never)).toBeGreaterThan(time(squad[6] as never));
  });
});
