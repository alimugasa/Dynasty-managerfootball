// What an asset is worth.
//
// These are the cases two front offices would argue over, because those are
// the ones a valuation can get wrong without anybody noticing: the good player
// on a bad contract, the 23-year-old against the 30-year-old, the future first
// against this year's second, and the package of five nobodies that must not
// add up to a star.

import { describe, expect, it } from 'vitest';
import {
  FACTOR_CEILING, FACTOR_FLOOR, NO_FACTORS, factorMultiplier, packageValue,
  pickTradeValue, playerTradeValue, positionScarcity, schemeFitFor,
  type PackageAsset, type TradeFactors,
} from '../../supabase/functions/_shared/api/tradeValue';
import { capRules } from '../../supabase/functions/_shared/engine/offseason/frontOffice';
import type { CareerPlayer } from '../../supabase/functions/_shared/engine/offseason/types';

const RULES = capRules(2026);

const player = (over: Partial<CareerPlayer> = {}): CareerPlayer => ({
  id: 'p1', name: 'A Player', group: 'WR', teamId: 'AAA',
  age: 26, experience: 4, ability: 78, potential: 80,
  mental: 0.5, devRate: 1, workEthic: 70, durability: 70, footballIq: 70,
  reputation: 70, rings: 0, awards: 0, allLeague: 0, retired: false,
  retiredInSeason: null, gamesMissedCareer: 0, gamesMissedSeason: 0,
  personality: 'MAX_MONEY', previousTeamId: null,
  contract: { aav: 8_000_000, years: 3, yearsRemaining: 2, guaranteed: 10_000_000, signedSeason: 2025 },
  ...over,
} as CareerPlayer);

const factors = (over: Partial<TradeFactors> = {}): TradeFactors => ({ ...NO_FACTORS, ...over });

describe('what a player is worth', () => {
  it('prices a better player higher than a worse one at the same position', () => {
    const good = playerTradeValue(player({ ability: 88 }), RULES, NO_FACTORS);
    const ordinary = playerTradeValue(player({ ability: 70 }), RULES, NO_FACTORS);
    expect(good).toBeGreaterThan(ordinary);
  });

  it('prefers the younger of two equal players', () => {
    const young = playerTradeValue(player({ age: 23, experience: 1 }), RULES, NO_FACTORS);
    const old = playerTradeValue(player({ age: 31, experience: 9 }), RULES, NO_FACTORS);
    expect(young).toBeGreaterThan(old);
  });

  it('prices a quarterback above a punter of the same rating', () => {
    const qb = playerTradeValue(player({ group: 'QB' }), RULES, NO_FACTORS);
    const punter = playerTradeValue(player({ group: 'P' }), RULES, NO_FACTORS);
    expect(qb).toBeGreaterThan(punter * 3);
  });

  it('discounts a player on a contract well over his market', () => {
    const cheap = player({ contract: { aav: 2_000_000, years: 3, yearsRemaining: 2, guaranteed: 1, signedSeason: 2025 } });
    const dear = player({ contract: { aav: 26_000_000, years: 3, yearsRemaining: 2, guaranteed: 1, signedSeason: 2025 } });
    expect(playerTradeValue(cheap, RULES, NO_FACTORS))
      .toBeGreaterThan(playerTradeValue(dear, RULES, NO_FACTORS));
  });

  it('leaves the valuation alone when nothing beyond the player is known', () => {
    // Every factor null must be exactly the engine's own number. This is the
    // rule that keeps "we do not know" from quietly meaning "average".
    expect(factorMultiplier(player(), NO_FACTORS)).toBe(1);
  });
});

describe('the factors a trade weighs', () => {
  it('discounts a player who is always hurt, and stops discounting eventually', () => {
    const some = factorMultiplier(player(), factors({ gamesMissedCareer: 12 }));
    const many = factorMultiplier(player(), factors({ gamesMissedCareer: 40 }));
    const absurd = factorMultiplier(player(), factors({ gamesMissedCareer: 400 }));
    expect(some).toBeLessThan(1);
    expect(many).toBeLessThan(some);
    // Past a point a club is not buying the player at all and further absence
    // changes nothing.
    // Past a point a club is not buying the player at all, and further
    // absence changes nothing.
    expect(absurd).toBe(0.78);
  });

  it('pays more for a player who is producing', () => {
    expect(factorMultiplier(player(), factors({ production: 90 })))
      .toBeGreaterThan(factorMultiplier(player(), factors({ production: 20 })));
  });

  it('pays more for a position the league is short of', () => {
    expect(factorMultiplier(player(), factors({ scarcity: 0.8 })))
      .toBeGreaterThan(factorMultiplier(player(), factors({ scarcity: 0.1 })));
  });

  it('pays more for a player who fits the scheme he is going to', () => {
    expect(factorMultiplier(player(), factors({ schemeFit: 90 })))
      .toBeGreaterThan(factorMultiplier(player(), factors({ schemeFit: 20 })));
  });

  it('discounts an unhappy player', () => {
    expect(factorMultiplier(player(), factors({ morale: 20 })))
      .toBeLessThan(factorMultiplier(player(), factors({ morale: 90 })));
  });

  it('counts draft pedigree for a young player and not for a veteran', () => {
    const rookieFirst = factorMultiplier(
      player({ age: 22, experience: 1 }), factors({ draftRound: 1 }));
    const rookieSeventh = factorMultiplier(
      player({ age: 22, experience: 1 }), factors({ draftRound: 7 }));
    expect(rookieFirst).toBeGreaterThan(rookieSeventh);

    // A first-round pick in his eighth season is an eighth-season player.
    const veteranFirst = factorMultiplier(
      player({ age: 30, experience: 8 }), factors({ draftRound: 1 }));
    expect(veteranFirst).toBe(1);
  });

  it('pays for years of control', () => {
    const controlled = factorMultiplier(player(), factors({ yearsRemaining: 4 }));
    const expiring = factorMultiplier(player(), factors({ yearsRemaining: 0 }));
    expect(controlled).toBeGreaterThan(expiring);
    // A rental is worth meaningfully less than a player you keep.
    expect(expiring).toBeLessThan(0.9);
  });

  it('keeps every factor stacked inside the band it promises', () => {
    // Written to catch exactly what it caught. Each of the seven bounds is
    // defensible on its own and their product was not: everything at its best
    // compounded to 1.65x, which is the factors deciding the trade and the
    // player coming along for it. The product is bounded now, and this is
    // where that promise is kept.
    const best = factorMultiplier(player({ age: 22, experience: 1 }), {
      gamesMissedCareer: 0, gamesMissedSeason: 0, production: 100, scarcity: 1,
      schemeFit: 100, morale: 100, draftRound: 1, yearsRemaining: 5,
    });
    const worst = factorMultiplier(player({ age: 22, experience: 1 }), {
      gamesMissedCareer: 300, gamesMissedSeason: 12, production: 0, scarcity: 0,
      schemeFit: 0, morale: 0, draftRound: 0, yearsRemaining: 0,
    });
    expect(best).toBe(FACTOR_CEILING);
    expect(worst).toBe(FACTOR_FLOOR);
  });
});

describe('what a pick is worth', () => {
  const pick = (round: number, slot: number | null, yearsAway = 0) =>
    pickTradeValue({ round, slot, picksPerRound: 32, yearsAway });

  it('makes an early pick worth far more than a late one', () => {
    expect(pick(1, 1)).toBeGreaterThan(pick(1, 32) * 2);
    expect(pick(1, 16)).toBeGreaterThan(pick(3, 16) * 3);
  });

  it('makes a bad club\'s second worth more than a good club\'s', () => {
    expect(pick(2, 2)).toBeGreaterThan(pick(2, 30));
  });

  it('discounts a pick for every year it is away', () => {
    const now = pick(1, 16, 0);
    const next = pick(1, 16, 1);
    const later = pick(1, 16, 2);
    expect(next).toBeLessThan(now);
    expect(later).toBeLessThan(next);
    // Still a real asset rather than a rounding error.
    expect(later).toBeGreaterThan(now * 0.5);
  });

  it('uses the middle of the round when the order is not settled', () => {
    const unknown = pick(2, null);
    expect(unknown).toBeGreaterThan(pick(2, 32));
    expect(unknown).toBeLessThan(pick(2, 1));
  });

  it('makes a seventh-rounder nearly worthless, which is why they get thrown in', () => {
    expect(pick(7, 20)).toBeLessThan(pick(1, 1) * 0.05);
  });
});

describe('what a package is worth', () => {
  const asset = (value: number, i: number): PackageAsset =>
    ({ kind: 'PLAYER', id: `p${String(i)}`, label: `Player ${String(i)}`, value });

  it('is worth less than the sum of its parts', () => {
    const three = [asset(20, 1), asset(20, 2), asset(20, 3)];
    expect(packageValue(three)).toBeLessThan(60);
    expect(packageValue(three)).toBeGreaterThan(20);
  });

  it('stops five fringe players from buying a star', () => {
    // The obvious exploit, and the reason packageValue is not a sum. A club
    // receiving five of these has 53 roster places and one position to play
    // them at.
    const fringe = [10, 10, 10, 10, 10].map((v, i) => asset(v, i));
    const star = [asset(48, 9)];
    expect(packageValue(fringe)).toBeLessThan(packageValue(star));
  });

  it('is led by its best piece', () => {
    const headline = [asset(50, 1), asset(4, 2)];
    const spread = [asset(27, 1), asset(27, 2)];
    expect(packageValue(headline)).toBeGreaterThan(packageValue(spread));
  });

  it('counts a single asset at exactly its value', () => {
    expect(packageValue([asset(33.3, 1)])).toBe(33.3);
  });

  it('is nothing when there is nothing in it', () => {
    expect(packageValue([])).toBe(0);
  });
});

describe('the league around the player', () => {
  it('counts scarcity rather than assuming it', () => {
    expect(positionScarcity([80, 82, 79, 85])).toBe(0);
    expect(positionScarcity([60, 62, 59, 65])).toBe(1);
    expect(positionScarcity([60, 80, 62, 85])).toBe(0.5);
  });

  it('reports an unknown scarcity rather than guessing at one', () => {
    expect(positionScarcity([])).toBeNull();
  });

  it('reads scheme fit off what the club actually does', () => {
    const runHeavy = { runPassBalance: 0.72, blitzRate: 0.3 };
    const passHeavy = { runPassBalance: 0.3, blitzRate: 0.3 };
    expect(schemeFitFor('RB', runHeavy)).toBeGreaterThan(schemeFitFor('RB', passHeavy) ?? 0);
    expect(schemeFitFor('WR', passHeavy)).toBeGreaterThan(schemeFitFor('WR', runHeavy) ?? 0);
  });

  it('says nothing about fit for a club with no scheme on record', () => {
    expect(schemeFitFor('RB', null)).toBeNull();
  });
});
