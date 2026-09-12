// What a player will sign for, and what a club will trade for.
//
// Two decisions a manager makes directly, so both are rules rather than
// judgement calls: the price an expiring player accepts to stay, and whether
// a club says yes to a trade. Written here so the server and the play-test
// build ask the same question and get the same answer.

import { clamp } from '../calibration.ts';
import { PEAK_AGE } from './calibration.ts';
import { deadMoneyIfCut, marketValue, veteranContract } from './contracts.ts';
import type { CapRules } from './frontOffice.ts';
import { POSITION_VALUE } from './needs.ts';
import { PERSONALITY_WEIGHTS } from './freeAgency.ts';
import type { CareerPlayer, PlayerContract } from './types.ts';

/**
 * The least a player will re-sign with his own club for.
 *
 * The market value is the anchor. What moves it is who he is: the weight his
 * personality puts on money is exactly the weight it puts on being paid to
 * stay, so a loyal player takes a discount to stay where he is and a
 * money-first one wants the market to clear before he signs anything.
 */
export function reSignAsk(player: CareerPlayer, rules: CapRules): number {
  const market = marketValue(player, rules);
  const money = PERSONALITY_WEIGHTS[player.personality][0] ?? 0.4;
  // 0.72 for the most loyal, about 1.1 for the most mercenary.
  const factor = clamp(0.66 + money * 0.55, 0.7, 1.15);
  return Math.round(Math.max(market * factor, rules.veteranMinimum));
}

/** The deal a club signs when a re-signing is agreed. */
export function reSignContract(aav: number, years: number, season: number): PlayerContract {
  return veteranContract(aav, clamp(Math.round(years), 1, 5), season);
}

/**
 * What a player is worth in a trade, as an asset rather than as a salary.
 *
 * Ability first, then what is left of the career, then what the position is
 * worth, and finally the contract: a good player on a cheap deal is worth
 * more than the same player on an expensive one, which is the whole reason
 * clubs trade at all.
 */
export function tradeValue(player: CareerPlayer, rules: CapRules): number {
  const quality = Math.max(0, player.ability + player.mental - 45);
  const peak = PEAK_AGE[player.group];
  const youth = clamp((peak + 3 - player.age) / 10, -0.35, 0.45);
  const upside = Math.max(0, player.potential - player.ability) * clamp((28 - player.age) / 8, 0, 1);
  const position = 0.55 + POSITION_VALUE[player.group] * 0.9;
  const base = (Math.pow(quality, 1.6) / 10 + upside * 1.5) * position * (1 + youth);
  // The contract. A deal at or below the market is an asset; one well above it
  // is a liability the other club is being asked to take on.
  const market = marketValue(player, rules);
  const paid = player.contract?.aav ?? rules.veteranMinimum;
  const value = base * clamp(1.25 - (paid / Math.max(market, 1)) * 0.35, 0.55, 1.25);
  return Math.round(value * 10) / 10;
}

export interface TradeSide {
  readonly teamId: string;
  readonly players: readonly CareerPlayer[];
}

export type TradeVerdict =
  | { readonly accepted: true; readonly value: number; readonly asked: number }
  | { readonly accepted: false; readonly reason: string; readonly value: number; readonly asked: number };

/** How much better than even a club needs a deal to be before it says yes. */
export const TRADE_MARGIN = 1.08;

/**
 * Whether the other club accepts.
 *
 * It wants more value than it gives, by a margin -- clubs do not trade for
 * nothing -- and it will not take on a deal it cannot fit or a roster it
 * cannot carry. Every reason it says no is named, because a manager who is
 * told "no" and not why cannot make a better offer.
 */
export function evaluateTrade(
  give: TradeSide, get: TradeSide, rules: CapRules, capRoomOfOther: number,
): TradeVerdict {
  const incoming = give.players.reduce((a, p) => a + tradeValue(p, rules), 0);
  const outgoing = get.players.reduce((a, p) => a + tradeValue(p, rules), 0);
  const asked = Math.round(outgoing * TRADE_MARGIN * 10) / 10;
  const salaryIn = give.players.reduce((a, p) => a + (p.contract?.aav ?? 0), 0);
  const salaryOut = get.players.reduce((a, p) => a + (p.contract?.aav ?? 0), 0);

  if (give.players.length === 0 || get.players.length === 0) {
    return { accepted: false, reason: 'A trade needs players on both sides', value: incoming, asked };
  }
  if (salaryIn - salaryOut > capRoomOfOther) {
    return {
      accepted: false,
      reason: 'They cannot fit the contracts coming back',
      value: incoming, asked,
    };
  }
  if (incoming < asked) {
    return {
      accepted: false,
      reason: incoming < asked * 0.6 ? 'Nowhere near enough' : 'Close, but they want more',
      value: incoming, asked,
    };
  }
  return { accepted: true, value: incoming, asked };
}

/** What cutting a player costs the club that cuts him. */
export const releaseCost = deadMoneyIfCut;
