// The draft. What matters is not that clubs pick well, but that they pick
// differently and are sometimes wrong.

import { describe, expect, it } from 'vitest';
import { createRng } from '../../supabase/functions/_shared/engine/rng.ts';
import {
  addressedTopNeed, buildBoard, capRules, generateClass, primePipeline, rankOfNeed,
  runOffseason, strengthOrder, teamNeeds, ROSTER_QUOTA,
  type DraftPick, type TeamFront,
} from '../../supabase/functions/_shared/engine/offseason/index.ts';
import { buildIndex, roster } from '../../supabase/functions/_shared/engine/offseason/rosterIndex.ts';
import { POSITION_GROUPS, type PositionGroup } from '../../supabase/functions/_shared/engine/types.ts';
import { loadCareerLeague } from '../../scripts/drift-report/careerLeague.ts';

/** Picks from a few seasons of a real league. */
function draftedOver(seasons: number, seed: number): DraftPick[] {
  const league = loadCareerLeague();
  const rng = createRng(seed);
  primePipeline(league, rng);
  const picks: DraftPick[] = [];
  for (let i = 0; i < seasons; i += 1) picks.push(...runOffseason(league, rng).draft.picks);
  return picks;
}

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('boards', () => {
  it('differ between clubs looking at the same class', () => {
    const rng = createRng(3);
    const prospects = generateClass(rng, 2027);
    const needs = Object.fromEntries(POSITION_GROUPS.map((g) => [g, 0.3])) as
      Record<PositionGroup, number>;
    const club = (id: string, scouting: number): TeamFront => ({
      id, scouting, spending: 60, winNow: 0.5, prestige: 55,
      recentWinRate: 0.5, scoutingSpend: 1,
    });

    const first = buildBoard(prospects, club('A', 70), needs, rng).slice(0, 20)
      .map((e) => e.prospect.id);
    const second = buildBoard(prospects, club('B', 70), needs, rng).slice(0, 20)
      .map((e) => e.prospect.id);

    expect(first).not.toEqual(second);
    // But not unrecognisably: two competent clubs should still broadly agree.
    const overlap = first.filter((id) => second.includes(id)).length;
    expect(overlap).toBeGreaterThan(3);
    expect(overlap).toBeLessThan(20);
  });

  it('is ordered by the club\'s own score', () => {
    const rng = createRng(4);
    const prospects = generateClass(rng, 2027);
    const needs = Object.fromEntries(POSITION_GROUPS.map((g) => [g, 0.2])) as
      Record<PositionGroup, number>;
    const board = buildBoard(prospects, {
      id: 'A', scouting: 70, spending: 60, winNow: 0.5, prestige: 55,
      recentWinRate: 0.5, scoutingSpend: 1,
    }, needs, rng);
    for (let i = 1; i < board.length; i += 1) {
      expect((board[i - 1]?.score ?? 0)).toBeGreaterThanOrEqual(board[i]?.score ?? 0);
    }
  });

  it('lifts a position the club needs', () => {
    const rng = createRng(5);
    const prospects = generateClass(rng, 2027);
    const base = Object.fromEntries(POSITION_GROUPS.map((g) => [g, 0])) as
      Record<PositionGroup, number>;
    const club: TeamFront = {
      id: 'A', scouting: 70, spending: 60, winNow: 1, prestige: 55,
      recentWinRate: 0.5, scoutingSpend: 1,
    };
    const without = buildBoard(prospects, club, base, createRng(9)).slice(0, 30)
      .filter((e) => e.prospect.group === 'TE').length;
    const withNeed = buildBoard(
      prospects, club, { ...base, TE: 1 }, createRng(9),
    ).slice(0, 30).filter((e) => e.prospect.group === 'TE').length;
    expect(withNeed).toBeGreaterThan(without);
  });
});

describe('picks', () => {
  const picks = draftedOver(4, 20260907);

  it('fills every round for every club', () => {
    expect(picks).toHaveLength(4 * 7 * 32);
    expect(new Set(picks.map((p) => p.overall)).size).toBe(7 * 32);
  });

  it('gives every pick a rookie contract that shrinks down the board', () => {
    const league = loadCareerLeague();
    const rng = createRng(31);
    primePipeline(league, rng);
    const result = runOffseason(league, rng);
    const drafted = result.draft.picks;
    const byId = new Map(league.players.map((p) => [p.id, p]));

    const firstOverall = drafted.find((p) => p.overall === 1);
    const lastPick = drafted.reduce((a, b) => (b.overall > a.overall ? b : a));
    const topDeal = byId.get(firstOverall?.prospectId ?? '')?.contract;
    const lateDeal = byId.get(lastPick.prospectId)?.contract;

    expect(topDeal).toBeDefined();
    expect(lateDeal).toBeDefined();
    expect(topDeal?.aav ?? 0).toBeGreaterThan(lateDeal?.aav ?? 0);
    expect(topDeal?.years).toBe(5);
  });

  it('produces reaches and steals in both directions', () => {
    const reaches = picks.map((p) => p.reach);
    expect(reaches.filter((r) => r > 20).length).toBeGreaterThan(0);
    expect(reaches.filter((r) => r < -20).length).toBeGreaterThan(0);
  });

  it('shows the winner\'s curse: clubs draft who they overrate', () => {
    // Selection bias, not a modelling error. A club picks the prospects its own
    // noise pushed upward, so estimates on drafted players sit above the truth
    // even though the estimator itself is unbiased.
    const bias = mean(picks.map((p) => p.estimate - p.trueAbility));
    expect(bias).toBeGreaterThan(0.5);
  });

  it('is influenced by need without being determined by it', () => {
    const meanRank = mean(picks.map((p) => p.needRank));
    // 6.5 of 12 would be indifference; 1.0 would be robotic.
    expect(meanRank).toBeLessThan(5.5);
    expect(meanRank).toBeGreaterThan(2.5);
  });

  it('misses on need often enough to be worth watching', () => {
    const addressed = picks.filter((p) => addressedTopNeed(p)).length / picks.length;
    expect(addressed).toBeGreaterThan(0.3);
    expect(addressed).toBeLessThan(0.8);
  });

  it('records a band that brackets the estimate', () => {
    for (const pick of picks.slice(0, 200)) {
      expect(pick.bandLow).toBeLessThan(pick.estimate);
      expect(pick.bandHigh).toBeGreaterThan(pick.estimate);
    }
  });
});

describe('pick order', () => {
  it('puts the weakest club first', () => {
    const league = loadCareerLeague();
    const index = buildIndex(league.teamIds, league.players);
    const order = strengthOrder(league, index);
    const strength = (teamId: string): number => {
      const top = roster(index, teamId).map((p) => p.ability + p.mental)
        .sort((a, b) => b - a).slice(0, 24);
      return top.reduce((a, b) => a + b, 0) / Math.max(top.length, 1);
    };
    const first = order[0];
    const last = order[order.length - 1];
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    expect(strength(first as string)).toBeLessThan(strength(last as string));
    expect(order).toHaveLength(league.teamIds.length);
  });
});

describe('need ranking', () => {
  it('orders the biggest hole first', () => {
    const league = loadCareerLeague();
    const index = buildIndex(league.teamIds, league.players);
    const teamId = league.teamIds[0] as string;
    const needs = teamNeeds(roster(index, teamId));
    const ordered = (Object.entries(needs) as [PositionGroup, number][])
      .sort((a, b) => b[1] - a[1]);
    const biggest = ordered[0]?.[0];
    expect(biggest).toBeDefined();
    expect(rankOfNeed(needs, biggest as PositionGroup)).toBe(1);
  });

  it('covers every group exactly once', () => {
    const league = loadCareerLeague();
    const index = buildIndex(league.teamIds, league.players);
    const needs = teamNeeds(roster(index, league.teamIds[0] as string));
    const ranks = POSITION_GROUPS.map((g) => rankOfNeed(needs, g)).sort((a, b) => a - b);
    expect(ranks).toEqual(POSITION_GROUPS.map((_, i) => i + 1));
  });
});

describe('undrafted players', () => {
  it('leaves most of a class unsigned, and signs some', () => {
    const league = loadCareerLeague();
    const rng = createRng(77);
    primePipeline(league, rng);
    const result = runOffseason(league, rng);
    expect(result.draft.undrafted.length).toBeGreaterThan(0);
    expect(result.draft.signedUndrafted).toBeGreaterThan(0);
    expect(result.draft.signedUndrafted).toBeLessThan(result.draft.undrafted.length);
  });
});

describe('roster shape', () => {
  it('holds every club at quota after the offseason completes', () => {
    const league = loadCareerLeague();
    const rng = createRng(4242);
    primePipeline(league, rng);
    for (let i = 0; i < 6; i += 1) runOffseason(league, rng);
    const rules = capRules(league.season);
    for (const teamId of league.teamIds) {
      const held = league.players.filter((p) => !p.retired && p.teamId === teamId);
      expect(held.length).toBeLessThanOrEqual(rules.rosterLimit);
      for (const group of POSITION_GROUPS) {
        expect(held.filter((p) => p.group === group).length).toBe(ROSTER_QUOTA[group]);
      }
    }
  });
});
