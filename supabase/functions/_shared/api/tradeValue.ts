// What an asset is worth in a trade.
//
// The engine already prices a player as an asset (offseason/deals.ts), and
// that function is the anchor here rather than a starting point to improve on.
// Two valuations would mean a player worth one thing in March and another in
// October for no reason anybody could name -- the same argument that kept the
// in-season market on the offseason's model.
//
// What this adds is the rest of what the request asks a trade to weigh, and
// every one of them is a multiplier on the engine's number rather than a term
// added to it. That is deliberate: a multiplier cannot make a bad player
// valuable, only make a good one more or less so, which is how each of these
// actually behaves. A 63-rated linebacker with a clean injury record is still
// a 63-rated linebacker.
//
// Where a factor is not known, it does not move the number and says so. An
// unscouted morale, a player with no games this season, a club with no scheme
// on record: none of them is treated as average, because "we do not know" and
// "it is average" are different facts and only one of them is ever true.

import { clamp } from '../engine/calibration.ts';
import { PEAK_AGE } from '../engine/offseason/calibration.ts';
import { POSITION_VALUE } from '../engine/offseason/needs.ts';
import { tradeValue as engineTradeValue } from '../engine/offseason/deals.ts';
import type { CapRules } from '../engine/offseason/frontOffice.ts';
import type { CareerPlayer } from '../engine/offseason/types.ts';
import type { PositionGroup } from '../engine/types.ts';

/** Every factor named in the request, and what is known about each. A null is
 *  a fact about the save rather than a gap to be filled in. */
export interface TradeFactors {
  /** Games missed to injury across the career, and this season. */
  readonly gamesMissedCareer: number | null;
  readonly gamesMissedSeason: number | null;
  /** 0-100 against a positional expectation. Null before he has played. */
  readonly production: number | null;
  /** 0-1: how short the league is of his position, counted across every club. */
  readonly scarcity: number | null;
  /** 0-100 against the acquiring club's scheme. Null where it has none. */
  readonly schemeFit: number | null;
  /** 0-100. Null until something this game models has moved it. */
  readonly morale: number | null;
  /** Round he was taken in, 1 best; 0 undrafted; null not on record. */
  readonly draftRound: number | null;
  /** Seasons a club holds him for beyond this one. */
  readonly yearsRemaining: number | null;
}

export const NO_FACTORS: TradeFactors = {
  gamesMissedCareer: null, gamesMissedSeason: null, production: null,
  scarcity: null, schemeFit: null, morale: null, draftRound: null,
  yearsRemaining: null,
};

/**
 * A player's trade value, to a specific club, in a specific week.
 *
 * The engine's figure, then seven adjustments. Each is bounded and each is
 * small: together they can move a valuation by roughly a third either way,
 * which is about the range two front offices would actually disagree over the
 * same player by. A wider range would mean the factors decided trades and the
 * player did not.
 */
export function playerTradeValue(
  player: CareerPlayer, rules: CapRules, factors: TradeFactors,
): number {
  const base = engineTradeValue(player, rules);
  return Math.round(base * factorMultiplier(player, factors) * 10) / 10;
}

/**
 * How far the factors may move a valuation, together.
 *
 * Seven multipliers compounding reached 1.65x with every one of them at its
 * best, which is not "two front offices disagreeing about a player" -- it is
 * the factors deciding the trade and the player coming along. The individual
 * bounds are each defensible and their product was not, so the product is
 * bounded too, and this is the number the module's promise is measured
 * against.
 */
export const FACTOR_FLOOR = 0.7;
export const FACTOR_CEILING = 1.35;

/** The seven adjustments, as one number. Exported so a screen can explain a
 *  valuation instead of only printing it. */
export function factorMultiplier(
  player: CareerPlayer, f: TradeFactors,
): number {
  let m = 1;

  // Injury history. A career of missed games is a discount that grows and
  // then stops: past a point a club is not buying the player at all, and no
  // further absence makes that truer.
  if (f.gamesMissedCareer !== null) {
    m *= clamp(1 - f.gamesMissedCareer * 0.006, 0.78, 1);
  }
  // Hurt right now is a separate and sharper thing from hurt often.
  if (f.gamesMissedSeason !== null && f.gamesMissedSeason > 0) {
    m *= clamp(1 - f.gamesMissedSeason * 0.02, 0.85, 1);
  }

  // Production. What he has actually done this season, against what his
  // position is expected to do. Null before he has played a game, and then it
  // moves nothing -- a rating is what is known about a man in week 1.
  if (f.production !== null) {
    m *= clamp(0.9 + (f.production / 100) * 0.22, 0.9, 1.12);
  }

  // Positional scarcity. A league short of cornerbacks pays more for one, and
  // this is the only factor here that is about everybody else rather than
  // about the player.
  if (f.scarcity !== null) {
    m *= clamp(0.94 + f.scarcity * 0.16, 0.94, 1.1);
  }

  // Scheme fit, to the club doing the acquiring. A run-heavy club is not
  // buying the same receiver a pass-heavy one is.
  if (f.schemeFit !== null) {
    m *= clamp(0.92 + (f.schemeFit / 100) * 0.16, 0.92, 1.08);
  }

  // Morale. A player who wants out is worth less to the club that has him and
  // no less to the club that wants him -- but this is one number, so it takes
  // the average of those two positions, which is a discount that shrinks the
  // happier he is.
  if (f.morale !== null) {
    m *= clamp(0.9 + (f.morale / 100) * 0.14, 0.9, 1.04);
  }

  // Draft pedigree. It fades: a first-round pick in his sixth season is a
  // sixth-year player, and what he is now is on tape.
  if (f.draftRound !== null && player.experience <= 3) {
    const pedigree = f.draftRound === 0 ? -0.03 : (0.09 - (f.draftRound - 1) * 0.015);
    m *= 1 + pedigree * clamp((4 - player.experience) / 4, 0, 1);
  }

  // Team control. Years on the deal beyond this one are the difference between
  // buying a player and renting one, and it is the single biggest thing a
  // rebuilding club is actually shopping for.
  if (f.yearsRemaining !== null) {
    m *= clamp(0.82 + f.yearsRemaining * 0.07, 0.82, 1.12);
  }

  return clamp(m, FACTOR_FLOOR, FACTOR_CEILING);
}

/* ------------------------------------------------------------------ picks */

/**
 * How many picks a round is worth relative to the top of the draft.
 *
 * A steep curve, because draft value is steep: the first pick is worth several
 * late firsts and a seventh-rounder is worth almost nothing, which is why
 * clubs give them away to balance salary. Anchored so a mid-first is roughly a
 * very good starter and a fourth is roughly a rotation player, matching what
 * playerTradeValue returns for those.
 */
const ROUND_TOP = [0, 92, 34, 17, 9.5, 5.5, 3, 1.6] as const;
const ROUND_BOTTOM = [0, 34, 17, 9.5, 5.5, 3, 1.6, 0.7] as const;

export interface PickFacts {
  readonly round: number;
  /** Where in the round it is expected to fall, 1 to `picksPerRound`. Null
   *  where the order is not set yet -- a future year has no standings behind
   *  it -- and then the middle of the round is used and the caller is told
   *  that is what happened. */
  readonly slot: number | null;
  readonly picksPerRound: number;
  /** Seasons ahead. 0 is this draft. */
  readonly yearsAway: number;
}

/**
 * What a pick is worth.
 *
 * Three things decide it. The round sets the range. Where in the round it
 * falls places it inside that range, which is what makes a bad club's second
 * worth more than a good club's -- and is why a pick's value moves as the
 * season does. And how far away it is discounts it: a pick two drafts from now
 * is a real asset and not as real as one this spring, because nobody knows
 * what it will be.
 */
export function pickTradeValue(pick: PickFacts): number {
  const round = clamp(Math.round(pick.round), 1, 7);
  const top = ROUND_TOP[round] ?? 1;
  const bottom = ROUND_BOTTOM[round] ?? 0.5;
  // Unknown order is the middle of the round, which is the honest answer to
  // "where will this land" before any games decide it.
  const share = pick.slot === null
    ? 0.5
    : clamp((pick.slot - 1) / Math.max(1, pick.picksPerRound - 1), 0, 1);
  const value = top + (bottom - top) * share;
  // Roughly a fifth off per year out. A club trading its 2028 first is giving
  // up something real, and taking one is a bet.
  const discount = Math.pow(0.8, Math.max(0, pick.yearsAway));
  return Math.round(value * discount * 10) / 10;
}

/** Whether a pick's slot is known, which the screen says out loud rather than
 *  quietly showing a mid-round figure as though it were settled. */
export const pickSlotKnown = (pick: PickFacts): boolean => pick.slot !== null;

/* -------------------------------------------------------------- packages */

export interface PackageAsset {
  readonly kind: 'PLAYER' | 'PICK';
  readonly id: string;
  readonly label: string;
  readonly value: number;
}

/**
 * What a package is worth.
 *
 * Not the sum. Three players worth 20 each are not one player worth 60 --
 * the club receiving them has 53 roster places and can only start one at each
 * position, and the best player in any deal is the reason the deal happens.
 * So the largest asset counts fully and each one after it counts for less.
 *
 * This is the rule that stops the obvious exploit, which is bundling six
 * fringe players to buy a star. It also matches how clubs talk: a package is
 * described by its headline piece and its "and".
 */
export function packageValue(assets: readonly PackageAsset[]): number {
  const sorted = [...assets].map((a) => a.value).sort((a, b) => b - a);
  let total = 0;
  for (const [i, value] of sorted.entries()) {
    total += value * Math.pow(0.82, i);
  }
  return Math.round(total * 10) / 10;
}

/** Salary a package moves, for the cap check. */
export const packageSalary = (
  assets: readonly PackageAsset[], salaryOf: (id: string) => number,
): number => assets.filter((a) => a.kind === 'PLAYER')
  .reduce((sum, a) => sum + salaryOf(a.id), 0);

/** How short the league is of a position: the share of clubs whose best at the
 *  group is below a starter's standard. Counted, never assumed. */
export function positionScarcity(
  bestByClub: readonly number[], adequate = 76,
): number | null {
  if (bestByClub.length === 0) return null;
  const short = bestByClub.filter((best) => best < adequate).length;
  return Math.round((short / bestByClub.length) * 100) / 100;
}

/**
 * How well a player's position suits a club's scheme.
 *
 * Derived, and named as a derivation everywhere it is shown. The league stores
 * a club's run/pass balance and blitz rate and no per-player scheme fit at
 * all, so this is what those tendencies imply: a run-heavy club leans on its
 * line and its backs, a pass-heavy one on receivers and the men who chase
 * quarterbacks, and a blitzing club needs corners who can hold up alone.
 */
export function schemeFitFor(
  group: PositionGroup, scheme: { readonly runPassBalance: number; readonly blitzRate: number } | null,
): number | null {
  if (scheme === null) return null;
  const run = clamp(scheme.runPassBalance, 0, 1);
  const blitz = clamp(scheme.blitzRate, 0, 1);
  // 50 is the neutral reading, and every group moves from there.
  const lean: Partial<Record<PositionGroup, number>> = {
    RB: (run - 0.5) * 120, OL: (run - 0.5) * 80, TE: (run - 0.5) * 60,
    WR: (0.5 - run) * 100, QB: (0.5 - run) * 50,
    EDGE: (blitz - 0.4) * 80, LB: (blitz - 0.4) * 50,
    CB: (blitz - 0.4) * 70, S: (0.4 - blitz) * 40,
  };
  return Math.round(clamp(50 + (lean[group] ?? 0), 0, 100));
}

/** What a position is worth, for a screen that wants to say why a corner cost
 *  more than a safety. */
export const positionWeight = (group: PositionGroup): number => POSITION_VALUE[group];

/** Whether a player is on the right side of his position's peak, which is what
 *  a rebuilding club is really asking. */
export const yearsToPeak = (group: PositionGroup, age: number): number =>
  PEAK_AGE[group] - age;
