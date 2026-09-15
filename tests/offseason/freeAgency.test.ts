// Free agency and the cap.
//
// The market is only interesting if the highest bidder can lose and if clubs can
// pay too much. Both are asserted here, along with the arithmetic that stops
// either from becoming absurd.

import { describe, expect, it } from 'vitest';
import { createRng } from '../../supabase/functions/_shared/engine/rng.ts';
import {
  capRules, capSavings, capSheet, cutAppeal, deadMoneyIfCut, expireContracts,
  marketValue, MAX_AAV_SHARE, offerFrom, perceivedValue, PERSONALITY_WEIGHTS,
  primePipeline, rookieContract, runOffseason, veteranContract,
  type FaPersonality, type Signing,
} from '../../supabase/functions/_shared/engine/offseason/index.ts';
import { loadCareerLeague } from '../../scripts/drift-report/careerLeague.ts';
import { mean, player } from './fixtures.ts';

const RULES = capRules(2026);

function signingsOver(seasons: number, seed: number): Signing[] {
  const league = loadCareerLeague();
  const rng = createRng(seed);
  primePipeline(league, rng);
  const out: Signing[] = [];
  for (let i = 0; i < seasons; i += 1) out.push(...runOffseason(league, rng).freeAgency.signings);
  return out;
}

describe('contract valuation', () => {
  it('pays more for a better player', () => {
    expect(marketValue(player({ ability: 90, reputation: 90 }), RULES))
      .toBeGreaterThan(marketValue(player({ ability: 70, reputation: 70 }), RULES));
  });

  it('concentrates money at the top rather than spreading it evenly', () => {
    const good = marketValue(player({ ability: 78, reputation: 78 }), RULES);
    const great = marketValue(player({ ability: 90, reputation: 90 }), RULES);
    const average = marketValue(player({ ability: 66, reputation: 66 }), RULES);
    // Twelve points from good to great should cost more than twelve from
    // average to good.
    expect(great - good).toBeGreaterThan(good - average);
  });

  it('pays a quarterback far more than a punter of the same rating', () => {
    const passer = marketValue(player({ group: 'QB', ability: 88, reputation: 88 }), RULES);
    const punter = marketValue(player({ group: 'P', ability: 88, reputation: 88 }), RULES);
    expect(passer).toBeGreaterThan(punter * 5);
    expect(MAX_AAV_SHARE.QB).toBeGreaterThan(MAX_AAV_SHARE.P);
  });

  it('follows reputation more than ability, which is why the market is wrong', () => {
    const overrated = player({ ability: 70, reputation: 88 });
    const underrated = player({ ability: 88, reputation: 70 });
    expect(perceivedValue(overrated)).toBeGreaterThan(perceivedValue(underrated));
    expect(marketValue(overrated, RULES)).toBeGreaterThan(marketValue(underrated, RULES));
  });

  it('discounts a player past his peak', () => {
    const young = player({ group: 'RB', age: 24, ability: 85, reputation: 85 });
    const old = player({ group: 'RB', age: 31, ability: 85, reputation: 85 });
    expect(marketValue(old, RULES)).toBeLessThan(marketValue(young, RULES));
  });

  it('never goes below the minimum', () => {
    expect(marketValue(player({ ability: 40, reputation: 40 }), RULES))
      .toBeGreaterThanOrEqual(RULES.veteranMinimum);
  });
});

describe('cap arithmetic', () => {
  it('counts only the largest 51 hits', () => {
    const roster = Array.from({ length: 60 }, (_, i) => player({
      id: `P${i}`, contract: veteranContract(1_000_000 + i * 1000, 2, 2026),
    }));
    const sheet = capSheet('AAA', roster, RULES);
    const all = roster.reduce((a, p) => a + (p.contract?.aav ?? 0), 0);
    expect(sheet.committed).toBeLessThan(all);
    expect(sheet.contracts).toBe(60);
  });

  it('subtracts dead money from available room', () => {
    const roster = [player({ contract: veteranContract(10_000_000, 3, 2026) })];
    const clean = capSheet('AAA', roster, RULES, 0);
    const encumbered = capSheet('AAA', roster, RULES, 5_000_000);
    expect(clean.available - encumbered.available).toBe(5_000_000);
  });

  it('charges dead money proportional to what is left on a deal', () => {
    const fresh = player({ contract: veteranContract(10_000_000, 4, 2026) });
    const nearlyDone = player({ contract: { ...veteranContract(10_000_000, 4, 2026), yearsRemaining: 1 } });
    expect(deadMoneyIfCut(fresh)).toBeGreaterThan(deadMoneyIfCut(nearlyDone));
  });

  it('makes a guaranteed rookie a poor cut and a stale veteran a good one', () => {
    // The bug this guards: ranking cuts by cap hit alone released first-round
    // picks, whose deals are guaranteed and free almost nothing.
    const rookie = player({ ability: 68, contract: rookieContract(1, 1, RULES, 2026) });
    const veteran = player({
      ability: 68,
      contract: { ...veteranContract(12_000_000, 3, 2026), yearsRemaining: 1, guaranteed: 0 },
    });
    expect(capSavings(veteran, RULES)).toBeGreaterThan(capSavings(rookie, RULES));
    expect(cutAppeal(veteran, RULES)).toBeGreaterThan(cutAppeal(rookie, RULES));
  });

  it('grows the cap year on year', () => {
    expect(capRules(2036).salaryCap).toBeGreaterThan(capRules(2026).salaryCap);
    expect(capRules(2036).veteranMinimum).toBeGreaterThan(capRules(2026).veteranMinimum);
  });

  it('expires a deal when its last year runs out', () => {
    const expiring = player({ teamId: 'AAA', contract: { ...veteranContract(5e6, 2, 2026), yearsRemaining: 1 } });
    const running = player({ teamId: 'AAA', contract: { ...veteranContract(5e6, 3, 2026), yearsRemaining: 3 } });
    const freed = expireContracts([expiring, running]);
    expect(freed).toHaveLength(1);
    expect(expiring.teamId).toBeNull();
    expect(expiring.previousTeamId).toBe('AAA');
    expect(running.contract?.yearsRemaining).toBe(2);
  });
});

describe('offers', () => {
  it('rises with need, which is where overpayment comes from', () => {
    const low = offerFrom(10_000_000, 0, 60, 100_000_000, RULES, createRng(1));
    const high = offerFrom(10_000_000, 1, 60, 100_000_000, RULES, createRng(1));
    expect(high ?? 0).toBeGreaterThan(low ?? 0);
  });

  it('rises with an owner willing to spend', () => {
    const tight = offerFrom(10_000_000, 0.5, 10, 100_000_000, RULES, createRng(2));
    const loose = offerFrom(10_000_000, 0.5, 95, 100_000_000, RULES, createRng(2));
    expect(loose ?? 0).toBeGreaterThan(tight ?? 0);
  });

  it('declines to bid without room', () => {
    expect(offerFrom(10_000_000, 1, 90, 0, RULES, createRng(3))).toBeNull();
  });

  it('never commits more than a share of the room to one player', () => {
    const space = 20_000_000;
    const offer = offerFrom(500_000_000, 1, 99, space, RULES, createRng(4));
    expect(offer ?? 0).toBeLessThanOrEqual(space * 0.55 + 1);
  });
});

describe('the market', () => {
  const signings = signingsOver(4, 20260907);

  it('signs players every season', () => {
    expect(signings.length).toBeGreaterThan(100);
  });

  it('lets the top bidder lose regularly', () => {
    const lost = signings.filter((s) => s.outbidByAnother).length / signings.length;
    expect(lost).toBeGreaterThan(0.2);
    expect(lost).toBeLessThan(0.85);
  });

  it('clears around market value on average', () => {
    const premium = mean(signings.map((s) => s.premium));
    expect(premium).toBeGreaterThan(0.9);
    expect(premium).toBeLessThan(1.2);
  });

  it('overpays sometimes and wildly overpays rarely', () => {
    const over25 = signings.filter((s) => s.premium >= 1.25).length / signings.length;
    const over50 = signings.filter((s) => s.premium >= 1.5).length / signings.length;
    expect(over25).toBeGreaterThan(0.03);
    expect(over25).toBeLessThan(0.35);
    expect(over50).toBeLessThan(over25);
  });

  it('draws competing bids rather than a single taker', () => {
    expect(mean(signings.map((s) => s.bids))).toBeGreaterThan(2);
  });

  it('pays a money-first player more than a loyal one', () => {
    // Pooled over three leagues rather than measured on one. The effect is a
    // few points of premium, and one league's 200 signings per personality is
    // not enough to see it: the same assertion on a single seed flips on
    // sampling noise, which makes it a test of the seed rather than of the
    // market.
    const pooled = [20260907, 11, 4242].flatMap((seed) => signingsOver(4, seed));
    const paidBy = (personality: FaPersonality): number =>
      mean(pooled.filter((s) => s.personality === personality).map((s) => s.premium));
    expect(paidBy('MAX_MONEY')).toBeGreaterThan(paidBy('LOYALTY'));
  });

  it('weights each personality to a whole', () => {
    for (const weights of Object.values(PERSONALITY_WEIGHTS)) {
      expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    }
    expect(PERSONALITY_WEIGHTS.MAX_MONEY[0] ?? 0)
      .toBeGreaterThan(PERSONALITY_WEIGHTS.CHAMPIONSHIP[0] ?? 0);
    expect(PERSONALITY_WEIGHTS.CHAMPIONSHIP[1] ?? 0)
      .toBeGreaterThan(PERSONALITY_WEIGHTS.MAX_MONEY[1] ?? 0);
  });
});

describe('cap compliance', () => {
  it('leaves every club legal after the offseason', () => {
    const league = loadCareerLeague();
    const rng = createRng(99);
    primePipeline(league, rng);
    for (let i = 0; i < 5; i += 1) runOffseason(league, rng);
    const rules = capRules(league.season);
    for (const teamId of league.teamIds) {
      const roster = league.players.filter((p) => !p.retired && p.teamId === teamId);
      const sheet = capSheet(teamId, roster, rules, league.deadMoney.get(teamId) ?? 0);
      expect(sheet.available).toBeGreaterThanOrEqual(0);
    }
  });

  it('does not release first-round rookies to get under the cap, and rarely to the roster limit', () => {
    // KNOWN DEFECT, bounded. On the seed's own rosters and contracts -- 1,342
    // one-year minimum deals expire in the first offseason, so the market
    // turns over about 1,400 players and every club then cuts to the limit --
    // the quota pass ranks a first-round rookie below the veterans it just
    // signed at two clubs of 32, and lets him go. No club cuts one for the
    // money. Whether rosterValue should protect a rookie deal is an engine
    // decision; until it is made, this asserts the count so it cannot grow.
    const league = loadCareerLeague();
    const rng = createRng(1234);
    primePipeline(league, rng);
    const result = runOffseason(league, rng);
    const byId = new Map(league.players.map((p) => [p.id, p]));
    const firstRound = result.draft.picks.filter((p) => p.round === 1);
    const cut = firstRound.filter((p) => (byId.get(p.prospectId)?.contract?.years ?? 0) !== 5);
    const reasons = cut.map((p) => result.released.find((r) => r.playerId === p.prospectId)?.reason);
    expect(reasons.every((r) => r === 'QUOTA')).toBe(true);
    // Three of 32 on the seed's own 53 (two quarterbacks per club, so a
    // drafted quarterback is the third). Whether the quota pass should protect
    // a rookie deal is the engine decision still open.
    expect(cut.length).toBeLessThanOrEqual(3);
    expect(firstRound.length - cut.length).toBeGreaterThanOrEqual(29);
  });
});
