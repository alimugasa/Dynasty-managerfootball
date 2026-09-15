// What a club is trying to do, and what it says about your offer.
//
// The request makes several claims in words -- contenders value immediate
// talent, rebuilders value picks and youth, a CPU club will not hand over an
// elite young player for a low-value veteran package, a counter should be
// reasonable and based on the actual gap. Each of those is a test here,
// because each is invisible if it is wrong: a system that always says "not
// enough value" looks exactly like a system that is thinking.

import { describe, expect, it } from 'vitest';
import {
  STRATEGIES, STRATEGY_LABEL, appetiteValue, strategyFor,
  type ClubShape, type Strategy, type ValuedAsset,
} from '../../supabase/functions/_shared/api/tradeStrategy';
import {
  INTEREST_BANDS, bandFor, counterFor, evaluateTrade, interestFill,
  type TradeContext,
} from '../../supabase/functions/_shared/api/tradeInterest';

const shape = (over: Partial<ClubShape> = {}): ClubShape => ({
  wins: 4, losses: 4, ties: 0, ratingEdge: 0, averageAge: 26,
  week: 9, seasonWeeks: 18, ...over,
});

const ctx = (over: Partial<TradeContext> = {}): TradeContext => ({
  strategy: 'COMPETITIVE', needs: {}, capSpace: 40_000_000,
  rosterCount: 50, rosterLimit: 53, untouchable: new Set(),
  difficulty: 'NORMAL', ...over,
});

const man = (over: Partial<ValuedAsset> = {}): ValuedAsset => ({
  kind: 'PLAYER', id: 'p1', label: 'A Player', value: 30,
  age: 27, overall: 78, group: 'WR', groupLabel: 'receiver',
  salary: 6_000_000, ...over,
});

const pick = (over: Partial<ValuedAsset> = {}): ValuedAsset => ({
  kind: 'PICK', id: 'k1', label: '2027 2nd', value: 20,
  age: null, overall: null, group: null, groupLabel: null, salary: 0, ...over,
});

describe('where a club thinks it is', () => {
  it('calls a good club a contender and a bad one a rebuild', () => {
    expect(strategyFor(shape({ wins: 8, losses: 1, ratingEdge: 4 }))).toBe('CONTENDER');
    expect(strategyFor(shape({ wins: 1, losses: 8, ratingEdge: -4, week: 14 })))
      .toBe('FULL_REBUILD');
  });

  it('does not let a club give up in September', () => {
    // Four games is not a verdict, and a league where clubs sold in week 3
    // would have nothing to play for by November.
    const early = strategyFor(shape({ wins: 0, losses: 3, ratingEdge: -3, week: 4 }));
    expect(early).not.toBe('FULL_REBUILD');
    expect(early).not.toBe('REBUILD');
  });

  it('treats an unlucky good roster as better than its record', () => {
    // Same record, opposite rosters. The club whose players are much better
    // than its results is unlucky rather than finished.
    const unlucky = strategyFor(shape({ wins: 3, losses: 6, ratingEdge: 5, week: 9 }));
    const genuine = strategyFor(shape({ wins: 3, losses: 6, ratingEdge: -5, week: 9 }));
    expect(STRATEGIES.indexOf(unlucky)).toBeLessThan(STRATEGIES.indexOf(genuine));
  });

  it('sells harder with an old roster than a young one', () => {
    const old = strategyFor(shape({ wins: 3, losses: 6, averageAge: 29, week: 12 }));
    const young = strategyFor(shape({ wins: 3, losses: 6, averageAge: 24, week: 12 }));
    expect(STRATEGIES.indexOf(old)).toBeGreaterThanOrEqual(STRATEGIES.indexOf(young));
  });

  it('gives every strategy a name a person would say', () => {
    for (const s of STRATEGIES) {
      expect(STRATEGY_LABEL[s]).toBeTruthy();
      expect(STRATEGY_LABEL[s]).not.toBe(s);
    }
  });
});

describe('what each kind of club is shopping for', () => {
  it('has a contender pay up for a player who helps now', () => {
    const veteran = [man({ age: 29, value: 30 })];
    const contender = appetiteValue(veteran, 'CONTENDER')[0]?.value ?? 0;
    const rebuild = appetiteValue(veteran, 'FULL_REBUILD')[0]?.value ?? 0;
    expect(contender).toBeGreaterThan(rebuild);
  });

  it('has a rebuilding club pay up for picks and youth', () => {
    const futures = [pick({ value: 20 }), man({ age: 23, value: 20 })];
    const rebuild = appetiteValue(futures, 'FULL_REBUILD');
    const contender = appetiteValue(futures, 'CONTENDER');
    for (const [i, asset] of rebuild.entries()) {
      expect(asset.value).toBeGreaterThan(contender[i]?.value ?? 0);
    }
  });
});

describe('what they make of the offer', () => {
  it('accepts a deal that clears what it asks for', () => {
    const e = evaluateTrade({ incoming: [man({ value: 60 })], outgoing: [man({ value: 30 })] }, ctx());
    expect(e.interest).toBe('LIKELY_ACCEPT');
    expect(e.accepted).toBe(true);
  });

  it('refuses a derisory one and says it is not close', () => {
    const e = evaluateTrade({ incoming: [man({ value: 3 })], outgoing: [man({ value: 60 })] }, ctx());
    expect(e.interest).toBe('NO_INTEREST');
    expect(e.reasons.join(' ')).toContain('Nowhere near');
  });

  it('will not trade a player it has ruled out, at any price', () => {
    // The request's own case. A manager who spends twenty minutes adding picks
    // to a deal that was never possible has been misled by the interface, so
    // this is a different kind of answer from "not enough".
    const e = evaluateTrade({
      incoming: [man({ value: 500 })],
      outgoing: [man({ id: 'qb1', label: 'Their Quarterback', value: 60 })],
    }, ctx({ untouchable: new Set(['qb1']) }));
    expect(e.interest).toBe('NO_INTEREST');
    expect(e.accepted).toBe(false);
    expect(e.blocked).toBe('They will not trade Their Quarterback');
  });

  it('will not take on money it does not have', () => {
    const e = evaluateTrade({
      incoming: [man({ value: 90, salary: 30_000_000 })],
      outgoing: [man({ value: 20, salary: 1_000_000 })],
    }, ctx({ capSpace: 2_000_000 }));
    expect(e.blocked).toContain('cannot fit the contracts');
  });

  it('will not take more players than it has places for', () => {
    const e = evaluateTrade({
      incoming: [man({ id: 'a' }), man({ id: 'b' }), man({ id: 'c' })],
      outgoing: [man({ id: 'd', value: 5 })],
    }, ctx({ rosterCount: 53 }));
    expect(e.blocked).toContain('no roster room');
  });

  it('says which position a deal would help them at', () => {
    const e = evaluateTrade({
      incoming: [man({ group: 'CB', groupLabel: 'cornerback', value: 40 })],
      outgoing: [man({ value: 30 })],
    }, ctx({ needs: { CB: 0.8 } }));
    expect(e.reasons.join(' ')).toContain('cornerback');
  });

  it('tells a rebuilding club a young player fits its timeline', () => {
    const e = evaluateTrade({
      incoming: [man({ age: 23, value: 40 })],
      outgoing: [man({ age: 30, value: 30 })],
    }, ctx({ strategy: 'FULL_REBUILD' }));
    expect(e.reasons.join(' ')).toContain('rebuilding timeline');
  });

  it('tells a contender it is not collecting picks', () => {
    const e = evaluateTrade({
      incoming: [pick({ value: 40 })],
      outgoing: [man({ value: 30 })],
    }, ctx({ strategy: 'CONTENDER' }));
    expect(e.reasons.join(' ')).toContain('chasing this season');
  });

  it('says when the pick value is simply too low', () => {
    const e = evaluateTrade({
      incoming: [pick({ value: 4 })],
      outgoing: [man({ value: 50 })],
    }, ctx());
    expect(e.reasons.join(' ')).toContain('pick value is too low');
  });

  it('will not hand an elite young player to a package of old ones', () => {
    // The request's clearest AI requirement, and the one a naive valuation
    // fails: three 29-year-olds worth 22 each look like 66 if you add them up.
    const elite = man({ id: 'star', label: 'Their Star', age: 23, overall: 91, value: 70 });
    const veterans = [
      man({ id: 'v1', age: 30, overall: 76, value: 22 }),
      man({ id: 'v2', age: 31, overall: 75, value: 22 }),
      man({ id: 'v3', age: 30, overall: 74, value: 22 }),
    ];
    const rebuild = evaluateTrade({ incoming: veterans, outgoing: [elite] },
      ctx({ strategy: 'FULL_REBUILD' }));
    expect(rebuild.accepted).toBe(false);
    // And a contender, who actually wants those veterans, still says no.
    const contender = evaluateTrade({ incoming: veterans, outgoing: [elite] },
      ctx({ strategy: 'CONTENDER' }));
    expect(contender.accepted).toBe(false);
  });

  it('asks for more on a harder difficulty than an easier one', () => {
    const deal = { incoming: [man({ value: 34 })], outgoing: [man({ value: 30 })] };
    const easy = evaluateTrade(deal, ctx({ difficulty: 'EASY' }));
    const hard = evaluateTrade(deal, ctx({ difficulty: 'HARD' }));
    expect(hard.valueAsked).toBeGreaterThan(easy.valueAsked);
  });

  it('never repeats itself', () => {
    const e = evaluateTrade({
      incoming: [man({ group: 'CB', groupLabel: 'cornerback', value: 20 }),
        man({ id: 'b', group: 'CB', groupLabel: 'cornerback', value: 18 })],
      outgoing: [man({ value: 40 })],
    }, ctx({ needs: { CB: 0.9 } }));
    expect(new Set(e.reasons).size).toBe(e.reasons.length);
  });

  it('lands in one of the five bands the screen knows how to draw', () => {
    for (const ratio of [0, 0.3, 0.5, 0.8, 0.95, 1, 3]) {
      expect(INTEREST_BANDS).toContain(bandFor(ratio));
    }
    expect(bandFor(1)).toBe('LIKELY_ACCEPT');
    expect(bandFor(0)).toBe('NO_INTEREST');
  });

  it('fills the meter in step with the band', () => {
    const close = evaluateTrade({ incoming: [man({ value: 32 })], outgoing: [man({ value: 30 })] }, ctx());
    const far = evaluateTrade({ incoming: [man({ value: 5 })], outgoing: [man({ value: 30 })] }, ctx());
    expect(interestFill(close)).toBeGreaterThan(interestFill(far));
    expect(interestFill(close)).toBeLessThanOrEqual(1);
    expect(interestFill(far)).toBeGreaterThanOrEqual(0);
  });
});

describe('what they would say instead of no', () => {
  const near = (strategy: Strategy) => {
    const e = evaluateTrade(
      { incoming: [man({ value: 27 })], outgoing: [man({ value: 30 })] }, ctx({ strategy }));
    return { e, counter: counterFor(e, ctx({ strategy })) };
  };

  it('asks a rebuilding club\'s question: another pick', () => {
    const { counter } = near('FULL_REBUILD');
    expect(counter?.wants).toBe('PICK');
    expect(counter?.ask).toContain('pick');
  });

  it('asks a retooling club\'s question: somebody younger', () => {
    const { counter } = near('RETOOLING');
    expect(counter?.wants).toBe('YOUNG_PLAYER');
  });

  it('asks a contender\'s question: another player', () => {
    const { counter } = near('CONTENDER');
    expect(counter?.wants).toBe('PLAYER');
  });

  it('names the gap it is actually short by', () => {
    const { e, counter } = near('COMPETITIVE');
    expect(counter?.gap).toBeCloseTo(e.valueAsked - e.valueOffered, 1);
    expect(counter?.gap).toBeGreaterThan(0);
  });

  it('does not counter a deal that is nowhere near', () => {
    // A counter on an offer worth a third of the ask is a negotiation the
    // manager cannot win, dressed up as one they can.
    const e = evaluateTrade({ incoming: [man({ value: 4 })], outgoing: [man({ value: 60 })] }, ctx());
    expect(counterFor(e, ctx())).toBeNull();
  });

  it('does not counter a deal it has already accepted', () => {
    const e = evaluateTrade({ incoming: [man({ value: 80 })], outgoing: [man({ value: 30 })] }, ctx());
    expect(counterFor(e, ctx())).toBeNull();
  });

  it('does not counter something it refused outright', () => {
    const e = evaluateTrade({
      incoming: [man({ value: 500 })], outgoing: [man({ id: 'qb1', value: 60 })],
    }, ctx({ untouchable: new Set(['qb1']) }));
    expect(counterFor(e, ctx({ untouchable: new Set(['qb1']) }))).toBeNull();
  });

  it('asks for less money when money is the problem', () => {
    const c = ctx({ capSpace: 10_000_000 });
    const e = evaluateTrade({
      incoming: [man({ value: 28, salary: 9_000_000 })],
      outgoing: [man({ value: 30, salary: 1_000_000 })],
    }, c);
    expect(counterFor(e, c)?.wants).toBe('LESS_SALARY');
  });
});
