// What a player signs for, and what a club trades for.

import { describe, expect, it } from 'vitest';
import {
  evaluateTrade, reSignAsk, tradeValue, TRADE_MARGIN,
} from '../../supabase/functions/_shared/engine/offseason/deals.ts';
import { capRules, marketValue, veteranContract } from '../../supabase/functions/_shared/engine/offseason/index.ts';
import { player } from './fixtures.ts';

const RULES = capRules(2026);
const CAP = RULES.salaryCap;

describe('re-signing your own', () => {
  it('anchors on the market and never goes below the minimum', () => {
    const star = player({ group: 'QB', ability: 90, reputation: 90, age: 27 });
    const fringe = player({ group: 'LS', ability: 45, reputation: 45, age: 30 });
    expect(reSignAsk(star, RULES)).toBeGreaterThan(reSignAsk(fringe, RULES));
    expect(reSignAsk(fringe, RULES)).toBeGreaterThanOrEqual(RULES.veteranMinimum);
  });

  it('lets a loyal player stay for less than a mercenary would', () => {
    const base = { group: 'WR' as const, ability: 82, reputation: 82, age: 26 };
    const loyal = player({ ...base, personality: 'LOYALTY' });
    const money = player({ ...base, personality: 'MAX_MONEY' });
    expect(reSignAsk(loyal, RULES)).toBeLessThan(reSignAsk(money, RULES));
    // And the discount is a discount, not a giveaway.
    expect(reSignAsk(loyal, RULES)).toBeGreaterThan(marketValue(loyal, RULES) * 0.6);
  });
});

describe('what a player is worth in a trade', () => {
  it('pays for ability', () => {
    expect(tradeValue(player({ ability: 88, reputation: 88 }), RULES))
      .toBeGreaterThan(tradeValue(player({ ability: 70, reputation: 70 }), RULES));
  });

  it('pays for the career left, not only for today', () => {
    const young = player({ group: 'WR', ability: 80, potential: 92, age: 23 });
    const old = player({ group: 'WR', ability: 80, potential: 80, age: 33 });
    expect(tradeValue(young, RULES)).toBeGreaterThan(tradeValue(old, RULES));
  });

  it('pays more for a quarterback than for a punter', () => {
    const passer = player({ group: 'QB', ability: 84, reputation: 84 });
    const punter = player({ group: 'P', ability: 84, reputation: 84 });
    expect(tradeValue(passer, RULES)).toBeGreaterThan(tradeValue(punter, RULES));
  });

  it('discounts a player on a deal well above his market', () => {
    const fair = player({
      ability: 80, reputation: 80,
      contract: veteranContract(marketValue(player({ ability: 80, reputation: 80 }), RULES), 3, 2026),
    });
    const overpaid = player({
      ability: 80, reputation: 80,
      contract: veteranContract(marketValue(player({ ability: 80, reputation: 80 }), RULES) * 2.5, 3, 2026),
    });
    expect(tradeValue(overpaid, RULES)).toBeLessThan(tradeValue(fair, RULES));
  });
});

describe('whether they say yes', () => {
  const good = (): ReturnType<typeof player> =>
    player({ group: 'WR', ability: 84, potential: 88, age: 25, reputation: 84 });
  const fringe = (): ReturnType<typeof player> =>
    player({ group: 'LB', ability: 62, potential: 66, age: 30, reputation: 62 });

  it('refuses a deal that gives them less than they give', () => {
    const verdict = evaluateTrade(
      { teamId: 'AAA', players: [fringe()] },
      { teamId: 'BBB', players: [good()] },
      RULES, CAP);
    expect(verdict.accepted).toBe(false);
    if (!verdict.accepted) expect(verdict.reason).toContain('enough');
  });

  it('accepts a deal that clears their margin', () => {
    const verdict = evaluateTrade(
      { teamId: 'AAA', players: [good(), good()] },
      { teamId: 'BBB', players: [good()] },
      RULES, CAP);
    expect(verdict.accepted).toBe(true);
    expect(verdict.value).toBeGreaterThanOrEqual(verdict.asked);
  });

  it('asks for a margin rather than an even swap', () => {
    const one = good();
    const verdict = evaluateTrade(
      { teamId: 'AAA', players: [one] },
      { teamId: 'BBB', players: [good()] },
      RULES, CAP);
    expect(verdict.asked).toBeCloseTo(tradeValue(one, RULES) * TRADE_MARGIN, 0);
    expect(verdict.accepted).toBe(false);
  });

  it('refuses a deal it cannot fit under the cap, however good', () => {
    const expensive = player({
      group: 'QB', ability: 92, potential: 95, age: 26, reputation: 92,
      contract: veteranContract(CAP * 0.2, 4, 2026),
    });
    const verdict = evaluateTrade(
      { teamId: 'AAA', players: [expensive] },
      { teamId: 'BBB', players: [fringe()] },
      RULES, 1_000_000);
    expect(verdict.accepted).toBe(false);
    if (!verdict.accepted) expect(verdict.reason).toContain('fit');
  });

  it('refuses an empty side', () => {
    const verdict = evaluateTrade(
      { teamId: 'AAA', players: [] }, { teamId: 'BBB', players: [good()] }, RULES, CAP);
    expect(verdict.accepted).toBe(false);
  });
});
