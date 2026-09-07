// Free agency.
//
// The highest bidder does not automatically win, and that single fact is what
// makes the market a market. A player weighs money against contention, playing
// time, loyalty and the club's standing, and how he weighs them depends on who
// he is. A player who wants a ring will take less to get one; a player who wants
// paying will not.
//
// Clubs are not rational either. What a club offers is what it can justify, and
// a club with a hole at a position and an owner willing to spend will pay well
// over a player's market value to fill it. That is where overpayment comes from:
// not a rule that says "sometimes overpay", but need multiplied by willingness,
// which is occasionally a large number.

import { clamp } from '../calibration.ts';
import { capSheet, marketValue, veteranContract } from './contracts.ts';
import { saturated, teamNeeds, type TeamNeeds } from './needs.ts';
import { OFFSEASON_QUOTA, OFFSEASON_ROSTER_LIMIT, type League } from './league.ts';
import { available, roster as rosterOf, setTeam, type RosterIndex } from './rosterIndex.ts';
import type { CapRules } from './frontOffice.ts';
import type { Rng } from '../rng.ts';
import type { CareerPlayer, FaPersonality } from './types.ts';

/** How each type weighs (money, contention, playing time, loyalty, prestige).
 *  Each row sums to 1. */
export const PERSONALITY_WEIGHTS: Readonly<Record<FaPersonality, readonly number[]>> = {
  MAX_MONEY: [0.72, 0.06, 0.08, 0.04, 0.1],
  CHAMPIONSHIP: [0.28, 0.42, 0.1, 0.04, 0.16],
  LOYALTY: [0.34, 0.1, 0.1, 0.36, 0.1],
  ROLE: [0.3, 0.1, 0.46, 0.04, 0.1],
  LOCATION: [0.38, 0.14, 0.12, 0.1, 0.26],
  COACH_RELATIONSHIP: [0.32, 0.16, 0.16, 0.18, 0.18],
  LONG_TERM_SECURITY: [0.52, 0.14, 0.16, 0.08, 0.1],
};

export const FREE_AGENCY = {
  /**
   * What a club offers a player it does not especially need, relative to his
   * asking price.
   *
   * Anchored at 0.62 the whole market cleared below market value: a typical
   * club has a low need at most positions, so a typical offer was two thirds of
   * the ask, and since the player picks on fit rather than money the winning
   * offer was lower still. Eighty-three per cent of deals came in under market.
   * Recentred so the average deal lands about at market and the tail overpays.
   */
  baseOffer: 0.78,
  /** How far need pushes an offer up. A maximum need nearly doubles it, which
   *  is the overpayment mechanism. */
  needPremium: 0.75,
  /** Owner willingness, mapped from 0-99 onto roughly 0.75 to 1.25. */
  spendingSpan: 200,
  /** Clubs value the same player differently even holding need constant. */
  offerNoiseSd: 0.17,
  offerNoiseMin: 0.6,
  offerNoiseMax: 1.5,
  /** No club commits more than this share of its room to one player. */
  maxShareOfSpace: 0.55,
  /** A club needs at least this much room to be in the market at all. */
  minimumSpaceMultiple: 2,
  /** Players do not rank offers perfectly either. */
  choiceNoiseSd: 0.05,
  /** Cap sheets are refreshed every this many signings as rooms fill up. */
  refreshInterval: 25,
} as const;

export interface Bid {
  readonly teamId: string;
  readonly money: number;
  readonly need: number;
  /** Player's score for this offer, once he has weighed it. */
  score: number;
}

export interface Signing {
  readonly playerId: string;
  readonly teamId: string;
  readonly aav: number;
  readonly years: number;
  /** What the player was worth on the open market. */
  readonly marketValue: number;
  /** Signed value over market. Above 1 is an overpay. */
  readonly premium: number;
  readonly bids: number;
  /** True when the club that won was not the one offering most. */
  readonly outbidByAnother: boolean;
  readonly personality: FaPersonality;
}

export interface FreeAgencyResult {
  readonly signings: readonly Signing[];
  readonly unsigned: number;
}

/** What one club will put on the table, or null if it is not in the market. */
export function offerFrom(
  ask: number,
  need: number,
  spending: number,
  space: number,
  rules: CapRules,
  rng: Rng,
): number | null {
  if (space < rules.veteranMinimum * FREE_AGENCY.minimumSpaceMultiple) return null;

  let willing = ask
    * (FREE_AGENCY.baseOffer + FREE_AGENCY.needPremium * need)
    * (0.75 + spending / FREE_AGENCY.spendingSpan);
  willing *= clamp(
    rng.normal(1, FREE_AGENCY.offerNoiseSd),
    FREE_AGENCY.offerNoiseMin, FREE_AGENCY.offerNoiseMax,
  );

  const ceiling = space * FREE_AGENCY.maxShareOfSpace;
  if (willing > ceiling) willing = ceiling;
  if (willing < rules.veteranMinimum) return null;
  return Math.round(willing);
}

/** How attractive one offer looks to this particular player. */
export function scoreOffer(
  player: CareerPlayer,
  bid: Bid,
  bestMoney: number,
  contention: number,
  prestige: number,
  rng: Rng,
): number {
  const weights = PERSONALITY_WEIGHTS[player.personality];
  const money = bid.money / Math.max(bestMoney, 1);
  const loyalty = bid.teamId === player.previousTeamId ? 1 : 0;
  const score =
    (weights[0] ?? 0) * money +
    (weights[1] ?? 0) * contention +
    (weights[2] ?? 0) * bid.need +
    (weights[3] ?? 0) * loyalty +
    (weights[4] ?? 0) * (prestige / 100);
  return score + rng.normal(0, FREE_AGENCY.choiceNoiseSd);
}

/**
 * Work the market.
 *
 * Players are handled in order of reputation, not ability: the market moves on
 * what clubs believe, and the best-regarded player signs first whether or not he
 * is the best player available.
 */
export function runFreeAgency(
  league: League, index: RosterIndex, rules: CapRules, rng: Rng,
): FreeAgencyResult {
  const market = available(index).sort((a, b) => b.reputation - a.reputation);
  const signings: Signing[] = [];

  let needsByTeam = new Map<string, TeamNeeds>();
  let spaceByTeam = new Map<string, number>();
  const refresh = (): void => {
    needsByTeam = new Map();
    spaceByTeam = new Map();
    for (const teamId of league.teamIds) {
      const held = rosterOf(index, teamId);
      needsByTeam.set(teamId, teamNeeds(held));
      spaceByTeam.set(
        teamId,
        capSheet(teamId, held, rules, league.deadMoney.get(teamId) ?? 0).available,
      );
    }
  };
  refresh();

  let handled = 0;
  for (const player of market) {
    if (handled > 0 && handled % FREE_AGENCY.refreshInterval === 0) refresh();
    handled += 1;

    const ask = marketValue(player, rules);
    const bids: Bid[] = [];

    for (const teamId of league.teamIds) {
      const held = rosterOf(index, teamId);
      const needs = needsByTeam.get(teamId);
      if (needs === undefined) continue;
      if (held.length >= OFFSEASON_ROSTER_LIMIT) continue;
      if (saturated(held, player.group, needs, OFFSEASON_QUOTA)) continue;

      const front = league.fronts.get(teamId);
      const money = offerFrom(
        ask, needs[player.group] ?? 0, front?.spending ?? 60,
        spaceByTeam.get(teamId) ?? 0, rules, rng,
      );
      if (money === null) continue;
      bids.push({ teamId, money, need: needs[player.group] ?? 0, score: 0 });
    }

    if (bids.length === 0) continue;

    const bestMoney = bids.reduce((a, b) => (b.money > a ? b.money : a), 0);
    for (const bid of bids) {
      const front = league.fronts.get(bid.teamId);
      bid.score = scoreOffer(
        player, bid, bestMoney,
        front?.recentWinRate ?? 0.5, front?.prestige ?? 55, rng,
      );
    }
    bids.sort((a, b) => b.score - a.score);
    const winner = bids[0];
    if (winner === undefined) continue;

    // Younger players get longer deals; nobody signs for more than five years.
    const years = clamp(rng.int(1, 4) + (player.age < 27 ? 1 : 0), 1, 5);
    setTeam(index, player, winner.teamId);
    player.contract = veteranContract(winner.money, years, league.season);

    signings.push({
      playerId: player.id,
      teamId: winner.teamId,
      aav: winner.money,
      years,
      marketValue: ask,
      premium: winner.money / Math.max(ask, 1),
      bids: bids.length,
      outbidByAnother: winner.money < bestMoney,
      personality: player.personality,
    });

    spaceByTeam.set(winner.teamId, (spaceByTeam.get(winner.teamId) ?? 0) - winner.money);
  }

  return { signings, unsigned: market.length - signings.length };
}
