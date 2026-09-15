// What a club is trying to do, and what it makes of your offer.
//
// A trade system with one valuation and no direction produces thirty-one
// identical opponents who all want the same thing: slightly more than they
// give. That is a calculator, not a league. What makes a deadline interesting
// is that the club in front of you wants something *particular* -- a corner
// for January, or a 23-year-old and a second, and not the other one -- and
// says so.
//
// So a club has a strategy, the strategy re-weights the same valuation, and
// every refusal names its reason. A manager who is told no and not why cannot
// make a better offer, and a system that cannot be negotiated with is a
// system that gets used once.

import { clamp } from '../engine/calibration.ts';
import type { PackageAsset } from './tradeValue.ts';

export const STRATEGIES = [
  'CONTENDER', 'PLAYOFF_PUSH', 'COMPETITIVE', 'RETOOLING', 'REBUILD', 'FULL_REBUILD',
] as const;
export type Strategy = (typeof STRATEGIES)[number];

export const STRATEGY_LABEL: Readonly<Record<Strategy, string>> = {
  CONTENDER: 'Contender',
  PLAYOFF_PUSH: 'Playoff push',
  COMPETITIVE: 'Competitive',
  RETOOLING: 'Retooling',
  REBUILD: 'Rebuilding',
  FULL_REBUILD: 'Full rebuild',
};

export interface ClubShape {
  /** Games won and played this season. */
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  /** The club's mean rating against the league's, in rating points. Positive
   *  is better than average. */
  readonly ratingEdge: number;
  /** Mean age of the roster, which separates a good young club from a good
   *  old one -- they want opposite things at a deadline. */
  readonly averageAge: number;
  /** How many weeks of the season are gone. A 2-4 club in week 6 is not the
   *  same club as a 2-4 club in week 14. */
  readonly week: number;
  readonly seasonWeeks: number;
}

/**
 * Where a club thinks it is.
 *
 * The record decides most of it, because the table is what a front office
 * actually looks at in October. Two things bend it. A club whose roster is
 * much better than its record is unlucky rather than bad, and does not tear
 * itself down in week 7 over it. And a club going nowhere with an old roster
 * is in a worse position than one going nowhere with a young one, so it sells
 * harder.
 *
 * Early in the season nobody is a full rebuild: four games is not a verdict,
 * and a league where clubs gave up in September would have nothing left to
 * play for by November.
 */
export function strategyFor(shape: ClubShape): Strategy {
  const played = shape.wins + shape.losses + shape.ties;
  const pct = played === 0 ? 0.5 : (shape.wins + shape.ties * 0.5) / played;
  // How much of the season is gone, which is how much the record means.
  const through = clamp(shape.week / Math.max(1, shape.seasonWeeks), 0, 1);

  // The roster's own opinion, worth more early and less as results pile up.
  const roster = clamp(0.5 + shape.ratingEdge / 12, 0, 1);
  const standing = pct * through + roster * (1 - through);

  // An old roster going nowhere has less reason to wait.
  const old = shape.averageAge >= 27.5;

  if (standing >= 0.68) return 'CONTENDER';
  if (standing >= 0.56) return 'PLAYOFF_PUSH';
  if (standing >= 0.46) return 'COMPETITIVE';
  // Below this the club is a seller, and how hard depends on how late it is
  // and how old it is.
  if (standing >= 0.36) return old && through > 0.4 ? 'REBUILD' : 'RETOOLING';
  if (through < 0.35) return 'RETOOLING';
  return standing <= 0.24 && through > 0.5 ? 'FULL_REBUILD' : 'REBUILD';
}

/** What each strategy is shopping for, as multipliers on an asset's value. */
export interface Appetite {
  /** A player who helps this season. */
  readonly nowPlayer: number;
  /** A young player who helps later. */
  readonly youngPlayer: number;
  /** A draft pick. */
  readonly pick: number;
  /** How much better than even the club needs the deal to be. */
  readonly margin: number;
  /** Below this rating a player is not an asset to this club at all, he is a
   *  roster place. */
  readonly floor: number;
}

export const APPETITE: Readonly<Record<Strategy, Appetite>> = {
  // Wants help now and will pay in futures to get it. A contender that hoards
  // picks is a contender that wasted a window.
  CONTENDER: { nowPlayer: 1.22, youngPlayer: 0.92, pick: 0.72, margin: 1.05, floor: 68 },
  PLAYOFF_PUSH: { nowPlayer: 1.14, youngPlayer: 0.98, pick: 0.85, margin: 1.07, floor: 66 },
  // No strong direction, so no strong discount either -- and the hardest club
  // to move, because it has no reason to.
  COMPETITIVE: { nowPlayer: 1.0, youngPlayer: 1.05, pick: 1.0, margin: 1.12, floor: 62 },
  RETOOLING: { nowPlayer: 0.9, youngPlayer: 1.14, pick: 1.12, margin: 1.08, floor: 60 },
  REBUILD: { nowPlayer: 0.76, youngPlayer: 1.24, pick: 1.3, margin: 1.06, floor: 58 },
  // Will take futures for almost anybody, and wants nothing that turns 30
  // before it is good again.
  FULL_REBUILD: { nowPlayer: 0.62, youngPlayer: 1.3, pick: 1.45, margin: 1.04, floor: 55 },
};

/** The age below which a player counts as one a rebuild is buying. */
export const YOUNG_ENOUGH = 26;

export interface ValuedAsset extends PackageAsset {
  /** Null for a pick. */
  readonly age: number | null;
  readonly overall: number | null;
  /** The engine's position group, for matching against a club's needs. Null
   *  for a pick, which fills no position until it is used. */
  readonly group: string | null;
  /** What a person calls that group, so a reason reads as football rather
   *  than as a column value. */
  readonly groupLabel: string | null;
  /** Salary this season, for the cap check. */
  readonly salary: number;
}

/** What this club thinks the package is worth, given what it is trying to do. */
export function appetiteValue(
  assets: readonly ValuedAsset[], strategy: Strategy,
): readonly PackageAsset[] {
  const a = APPETITE[strategy];
  return assets.map((asset) => {
    if (asset.kind === 'PICK') return { ...asset, value: asset.value * a.pick };
    const young = (asset.age ?? 99) <= YOUNG_ENOUGH;
    return { ...asset, value: asset.value * (young ? a.youngPlayer : a.nowPlayer) };
  });
}
