// Contract valuation and cap arithmetic.
//
// The market pays for reputation more than for ability. That is not a
// simplification, it is the mechanism: reputation lags what a player can
// currently do, so a declining veteran is overpaid and a young riser is
// underpaid, and both are consequences of the same lag rather than of a rule
// written to produce them.

import { clamp } from '../calibration.ts';
import { PEAK_AGE } from './calibration.ts';
import type { PositionGroup } from '../types.ts';
import type { CapRules } from './frontOffice.ts';
import type { CareerPlayer, PlayerContract } from './types.ts';

/** Ceiling on what a group commands, as a share of the cap. A quarterback is
 *  worth an order of magnitude more than a punter, and the market says so. */
export const MAX_AAV_SHARE: Readonly<Record<PositionGroup, number>> = {
  QB: 0.205, EDGE: 0.136, WR: 0.119, OL: 0.086, DT: 0.096,
  CB: 0.089, LB: 0.073, S: 0.07, TE: 0.066, RB: 0.053,
  K: 0.022, P: 0.014, LS: 0.008,
};

/** Where paid ability starts. Below this a player is on the minimum. */
const REPLACEMENT_LEVEL = 58;
const VALUE_RANGE = 40;
/** Convexity. Money concentrates hard at the top: the difference between good
 *  and great costs far more than the difference between poor and good. */
const VALUE_EXPONENT = 2.5;
/** What the market knocks off for age, past peak plus a grace year or two. */
const AGE_DISCOUNT = 0.8;

/** Reputation dominates, which is why the market is wrong in predictable ways. */
export function perceivedValue(player: CareerPlayer): number {
  return player.reputation * 0.62 + (player.ability + player.mental) * 0.38;
}

/** What this player commands on the open market, in dollars per year. */
export function marketValue(player: CareerPlayer, rules: CapRules): number {
  const quality = Math.max(0, perceivedValue(player) - REPLACEMENT_LEVEL) / VALUE_RANGE;
  let aav = rules.salaryCap * MAX_AAV_SHARE[player.group] * Math.pow(quality, VALUE_EXPONENT);
  if (player.age > PEAK_AGE[player.group] + 2) aav *= AGE_DISCOUNT;
  return Math.round(Math.max(aav, rules.veteranMinimum));
}

/** Rookie deals are slotted, not negotiated. */
export function rookieContract(
  round: number, overallPick: number, rules: CapRules, season: number,
): PlayerContract {
  if (round === 1) {
    const aav = Math.round(
      rules.rookiePoolTop * Math.exp(-0.037 * Math.max(overallPick, 1)) +
      rules.salaryCap * 0.005,
    );
    return { aav, years: 5, yearsRemaining: 5, guaranteed: Math.round(aav * 5 * 0.6), signedSeason: season };
  }
  if (round === 0) {
    // Undrafted: minimum money, no guarantee worth the name.
    return {
      aav: rules.veteranMinimum, years: 3, yearsRemaining: 3,
      guaranteed: Math.round(rules.veteranMinimum * 0.2), signedSeason: season,
    };
  }
  const aav = Math.round(Math.max(
    rules.veteranMinimum, rules.salaryCap * (0.0074 - 0.0009 * round),
  ));
  return { aav, years: 4, yearsRemaining: 4, guaranteed: Math.round(aav * 4 * 0.45), signedSeason: season };
}

export function veteranContract(
  aav: number, years: number, season: number, guaranteeShare = 0.45,
): PlayerContract {
  return {
    aav: Math.round(aav),
    years,
    yearsRemaining: years,
    guaranteed: Math.round(aav * years * guaranteeShare),
    signedSeason: season,
  };
}

export interface CapSheet {
  readonly teamId: string;
  readonly capLimit: number;
  readonly committed: number;
  readonly deadMoney: number;
  readonly available: number;
  readonly contracts: number;
}

/**
 * Cap position for one club.
 *
 * Only the largest 51 cap hits count, which is the rule real clubs build rosters
 * around: the bottom of a roster is effectively free, so a club can carry depth
 * it could not otherwise afford.
 */
/** What a cap sheet needs from a player: the money, and nothing else. Declared
 *  so the save-integrity check can pass documents rather than casting them into
 *  CareerPlayer, which is a lie the type system would have accepted. */
export interface CapCharge {
  readonly contract: { readonly aav: number } | null;
}

export function capSheet(
  teamId: string, roster: readonly CapCharge[], rules: CapRules, deadMoney = 0,
): CapSheet {
  const hits = roster
    .map((p) => p.contract?.aav ?? rules.veteranMinimum)
    .sort((a, b) => b - a)
    .slice(0, 51);
  const committed = hits.reduce((a, b) => a + b, 0);
  return {
    teamId,
    capLimit: rules.salaryCap,
    committed,
    deadMoney,
    available: rules.salaryCap - committed - deadMoney,
    contracts: roster.length,
  };
}

/**
 * What releasing this player still costs against this season's cap.
 *
 * Guaranteed money does not vanish, but the charge is capped at a share of what
 * the club was paying him anyway. Without that ceiling a club whose expensive
 * deals are all guaranteed has no legal route back under the cap at all: every
 * available cut leaves it further over than it started, and compliance cannot
 * converge. Real clubs restructure their way out; this engine does not model
 * restructures, so the ceiling stands in for them.
 *
 * The consequence that matters is preserved: a heavily guaranteed contract
 * frees almost nothing and is a poor cut, while a deal near its end frees
 * nearly all of itself.
 */
export const MAX_DEAD_MONEY_SHARE = 0.8;

export function deadMoneyIfCut(player: CareerPlayer): number {
  const contract = player.contract;
  if (contract === null) return 0;
  const served = contract.years - contract.yearsRemaining;
  const remainingShare = contract.years > 0
    ? clamp(1 - served / contract.years, 0, 1)
    : 0;
  const owed = contract.guaranteed * remainingShare;
  return Math.round(Math.min(owed, contract.aav * MAX_DEAD_MONEY_SHARE));
}

/** Ticks every contract down a year and returns the players now unsigned. */
export function expireContracts(players: readonly CareerPlayer[]): CareerPlayer[] {
  const expired: CareerPlayer[] = [];
  for (const player of players) {
    if (player.contract === null) continue;
    // A contract is a relationship with a club: no club, no contract. Skipping
    // unrostered players left a free agent's deal frozen for ever -- it never
    // ticked down and never expired -- so a save carried thousands of players
    // "under contract" to nobody. Nothing reads such a contract (free agency
    // writes a new one on signing), so clearing it changes no outcome; it stops
    // the save from asserting something untrue.
    if (player.retired || player.teamId === null) {
      player.contract = null;
      continue;
    }
    player.contract.yearsRemaining -= 1;
    if (player.contract.yearsRemaining <= 0) {
      player.previousTeamId = player.teamId;
      player.teamId = null;
      player.contract = null;
      expired.push(player);
    }
  }
  return expired;
}

/** Value for money. */
export function contractEfficiency(player: CareerPlayer, rules: CapRules): number {
  const hit = player.contract?.aav ?? rules.veteranMinimum;
  return (player.ability + player.mental) / Math.max(hit, 1);
}

/**
 * What releasing this player actually frees up.
 *
 * Not his cap hit: guaranteed money stays on the books. A first-round rookie is
 * the worst ability-per-dollar on a roster and simultaneously the worst possible
 * cut, because almost none of his deal comes off. Ranking cuts by cap hit alone
 * released the first overall pick in the same offseason he was drafted.
 */
export function capSavings(player: CareerPlayer, rules: CapRules): number {
  const hit = player.contract?.aav ?? rules.veteranMinimum;
  return hit - deadMoneyIfCut(player);
}

/**
 * How attractive a player is to cut: money freed per point of ability lost.
 * Higher means a more tempting release.
 */
export function cutAppeal(player: CareerPlayer, rules: CapRules): number {
  const savings = capSavings(player, rules);
  if (savings <= 0) return -Infinity;
  return savings / Math.max(player.ability + player.mental, 1);
}
