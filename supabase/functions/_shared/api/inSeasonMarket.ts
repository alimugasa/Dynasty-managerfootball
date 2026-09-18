// Signing a free agent in November.
//
// The offseason already has a market model -- what a club will offer, what a
// player thinks of an offer, and seven personalities that weigh money against
// contention, role, loyalty and place. This does not write a second one. It
// takes the same model and changes the two things that are actually different
// about signing somebody mid-season:
//
//   * there is no auction. In March a player hears from six clubs and picks;
//     in November he has one offer in front of him and answers it. So the
//     question is not "which is best" but "is this good enough", which is a
//     threshold rather than a comparison.
//   * the season is half gone. A one-year deal in week 12 is ten weeks of
//     work, and a player prices it that way.
//
// Everything else -- who wants money, who wants a ring, who wants to play --
// is the engine's, and deliberately so. Two market models would mean a player
// who signs for one number in March and a different one in October for no
// reason anybody could name.

import { clamp } from '../engine/calibration.ts';
import { FREE_AGENCY, PERSONALITY_WEIGHTS } from '../engine/offseason/freeAgency.ts';
import type { FaPersonality } from '../engine/offseason/types.ts';

export const DESIRED_ROLES = ['STARTER', 'ROTATION', 'DEPTH'] as const;
export type DesiredRole = (typeof DESIRED_ROLES)[number];

export interface MarketPlayer {
  readonly playerId: string;
  readonly name: string;
  readonly position: string;
  readonly age: number;
  readonly overall: number;
  readonly potential: number;
  readonly experienceYears: number;
  /** What he is asking a year. */
  readonly askingAav: number;
  readonly expectedYears: number;
  readonly desiredRole: DesiredRole;
  readonly personality: FaPersonality;
  readonly previousTeamId: string | null;
}

export interface ClubOffer {
  readonly teamId: string;
  readonly aav: number;
  readonly years: number;
  /** The role the club is offering him, which is a promise about snaps. */
  readonly role: DesiredRole;
  /** 0-1: how badly this club needs his position. */
  readonly need: number;
  /** 0-1: how close this club is to competing this season. */
  readonly contention: number;
  /** Cap room, in dollars. */
  readonly capSpace: number;
}

/**
 * What a player will take, given how much season is left.
 *
 * A year signed in week 12 is ten weeks of work, and the asking price follows.
 * Not linearly: a club signing a man in December is buying a playoff run as
 * much as a salary, and the floor under that is the veteran minimum, which
 * this never goes below.
 */
export function inSeasonAsk(
  player: MarketPlayer, week: number, seasonWeeks: number, minimum: number,
): number {
  const left = clamp((seasonWeeks - week + 1) / Math.max(1, seasonWeeks), 0, 1);
  // Two thirds of the way to pro-rata. A late signing is cheaper than a March
  // one and dearer than the arithmetic alone would make it.
  const prorated = player.askingAav * (0.34 + 0.66 * left);
  return Math.max(minimum, Math.round(prorated));
}

/**
 * How long a player wants, in November.
 *
 * An older player takes the short deal because the alternative is no deal, and
 * because a one-year contract in a good situation is how a thirty-four year
 * old gets a thirty-five year old's contract. A young one wants the years,
 * because years are what he has to sell.
 */
export function desiredLength(player: MarketPlayer): number {
  if (player.age >= 32) return 1;
  if (player.age >= 29) return Math.min(2, player.expectedYears);
  if (player.experienceYears <= 2) return Math.max(2, player.expectedYears);
  return player.expectedYears;
}

const ROLE_RANK: Readonly<Record<DesiredRole, number>> = {
  STARTER: 3, ROTATION: 2, DEPTH: 1,
};

/** Below this he says no. Above it he says yes; between, he counters. */
export const ACCEPT_THRESHOLD = 0.62;
export const COUNTER_THRESHOLD = 0.4;

/** How far above his ask money stops helping, and the divisor that turns a
 *  share of the ask into a share of the score. Paying double does not make a
 *  man twice as likely to sign; it makes him certain, and this is where
 *  certain starts. */
const MONEY_CEILING = 1.6;
const MONEY_SCALE = 1.2;

/**
 * An offer, split into the part money moves and the part it does not.
 *
 * Kept as a pair rather than a single number because two questions are asked
 * of it: how likely is he to sign, and what would it take. The second cannot
 * be answered from a probability -- it needs to know which part of the score
 * money is able to change.
 */
interface Weighing {
  /** What a full unit of the money term is worth to him. */
  readonly moneyWeight: number;
  /** Everything money cannot buy: the club's position, the role, the return
   *  home. Fixed for a given offer, whatever the number on it. */
  readonly rest: number;
  /** The discount a good player applies to a club going nowhere. */
  readonly proud: number;
}

function weigh(player: MarketPlayer, offer: ClubOffer): Weighing {
  const weights = PERSONALITY_WEIGHTS[player.personality];
  const role = clamp(ROLE_RANK[offer.role] / ROLE_RANK[player.desiredRole], 0, 1.25) / 1.1;
  const loyalty = offer.teamId === player.previousTeamId ? 1 : 0;
  return {
    moneyWeight: weights[0] ?? 0,
    rest: (weights[1] ?? 0) * offer.contention
      + (weights[2] ?? 0) * Math.max(offer.need, role)
      + (weights[3] ?? 0) * loyalty
      + (weights[4] ?? 0) * 0.5,
    // A good player will not join a bad club for the going rate. He will join
    // it for more -- which is what this is: a penalty money can pay off rather
    // than a refusal, because a flat refusal would make half the league unable
    // to sign anybody worth signing.
    proud: player.overall >= 78 && offer.contention < 0.35 ? 0.72 : 1,
  };
}

/**
 * Whether this offer is good enough, as a probability between 0 and 1.
 *
 * The engine's personality weights decide what he is weighing; this decides
 * what he is weighing it against. Money is measured against what he is asking
 * rather than against a rival bid, because in-season there is no rival bid --
 * that substitution is the one real difference between this and the offseason
 * market, and it is the reason this function exists at all.
 */
export function signingProbability(
  player: MarketPlayer, offer: ClubOffer, ask: number,
): number {
  const w = weigh(player, offer);
  const money = clamp(offer.aav / Math.max(1, ask), 0, MONEY_CEILING) / MONEY_SCALE;
  return clamp((w.moneyWeight * money + w.rest) * w.proud, 0, 1);
}

/**
 * The salary that would actually close this deal, or null if none would.
 *
 * Written after a counter-offer failed to close a deal it had itself named.
 * The counter used to be a nudge -- the offer plus a percentage scaled to how
 * far short it fell -- which is fine when the gap is money and useless when it
 * is not: a player who wants a ring, offered his exact asking price by a club
 * out of the race, was handed a number, given it, and counter-offered again.
 * That is not a negotiation, it is a loop, and a manager could not tell it
 * from a refusal except by playing it out.
 *
 * So this solves for the number instead of guessing at it. The score is linear
 * in the money term, so the salary that reaches the threshold can be worked
 * out exactly -- and when the money term is already at its ceiling and the
 * threshold is still out of reach, there is no such salary, and the honest
 * answer is no rather than a number that will not work either.
 */
export function closingAav(
  player: MarketPlayer, offer: ClubOffer, ask: number,
): number | null {
  const w = weigh(player, offer);
  if (w.moneyWeight <= 0) return null;
  const needed = (ACCEPT_THRESHOLD / w.proud - w.rest) / w.moneyWeight;
  if (needed <= 0) return Math.max(1, Math.round(ask * 0.01));
  const share = needed * MONEY_SCALE;
  if (share > MONEY_CEILING) return null;
  // A cent under and he says no, so round up.
  return Math.ceil(share * Math.max(1, ask));
}

export type OfferVerdict =
  | { readonly kind: 'ACCEPTED' }
  | { readonly kind: 'REJECTED'; readonly reason: string }
  | { readonly kind: 'COUNTERED'; readonly aav: number; readonly years: number; readonly reason: string };

/**
 * What he says.
 *
 * A counter rather than a refusal wherever a number could still close it,
 * because "no" to an offer a player would have taken for ten per cent more is
 * a dead end dressed as a decision -- and the manager cannot tell the two
 * apart without being told.
 */
export function answerOffer(
  player: MarketPlayer, offer: ClubOffer, ask: number,
): OfferVerdict {
  if (offer.capSpace < offer.aav) {
    return { kind: 'REJECTED', reason: 'Your cap cannot carry the deal' };
  }
  const p = signingProbability(player, offer, ask);
  if (p >= ACCEPT_THRESHOLD) return { kind: 'ACCEPTED' };

  // What would close it. A counter is only worth making if meeting it works,
  // so where no salary reaches him the answer is no -- and the reason says
  // which wall was hit, because "he wants more" and "he does not want you"
  // call for completely different moves.
  const closing = closingAav(player, offer, ask);
  if (closing === null || p < COUNTER_THRESHOLD) {
    return {
      kind: 'REJECTED',
      reason: closing === null
        ? (player.overall >= 78 && offer.contention < 0.35
          ? 'No money closes this: he does not see a winner here'
          : 'No money closes this: he wants a bigger role than this')
        : offer.aav < ask * 0.6
          ? 'Nowhere near what he is asking'
          : 'He wants a bigger role than this',
    };
  }
  return {
    kind: 'COUNTERED',
    aav: closing,
    years: desiredLength(player),
    reason: 'He will sign, at his number',
  };
}

/**
 * What a computer-run club offers, and whether it is in the market at all.
 *
 * The offseason's own offerFrom would do the arithmetic, but it takes cap
 * rules this module has no business loading, so the shape is the same and the
 * inputs are the two that matter in November: how badly the club needs the
 * position, and how much room it has.
 */
export function cpuOffer(
  ask: number, need: number, capSpace: number, minimum: number,
): number | null {
  if (capSpace < minimum) return null;
  const willing = ask * (FREE_AGENCY.baseOffer + FREE_AGENCY.needPremium * need);
  const ceiling = capSpace * FREE_AGENCY.maxShareOfSpace;
  const offer = Math.round(Math.min(willing, ceiling));
  return offer < minimum ? null : offer;
}

/**
 * Who a club goes after when it loses somebody.
 *
 * A contender replaces a starter with a man who has done it before; a club
 * going nowhere would rather find out what a 24-year-old is. Both are ranked
 * on the same pool, which is why this returns a score rather than a filter --
 * a rebuilding club that needs a quarterback still signs the best one
 * available if the young one is not there.
 */
export function replacementScore(
  candidate: { readonly overall: number; readonly potential: number; readonly age: number;
    readonly experienceYears: number },
  contending: boolean,
): number {
  if (contending) {
    // What he is now, plus a little for having done it before.
    return candidate.overall + Math.min(candidate.experienceYears, 8) * 0.6;
  }
  // What he might be, discounted by how long it would take to find out.
  const upside = Math.max(0, candidate.potential - candidate.overall);
  return candidate.overall * 0.7 + upside * 1.4 + Math.max(0, 28 - candidate.age) * 0.8;
}

/**
 * How long a deal a player of this age expects to be offered.
 *
 * The offseason rolls this (`rng.int(1, 4)` plus a year for anyone under 27),
 * which is right for a market where four hundred players sign in an afternoon
 * and wrong for a pool a manager reads one row at a time: a screen that shows
 * a different expected term every time it is opened is showing noise. This is
 * the same shape without the roll -- the mean of the offseason's distribution,
 * by age band -- so the two markets agree on average and this one holds still.
 */
export function expectedYearsFor(age: number): number {
  if (age >= 33) return 1;
  if (age >= 30) return 2;
  if (age >= 27) return 3;
  return 4;
}

/**
 * What a player believes he is, from the role tier the league already records.
 *
 * players.role_tier is stored data rather than a derivation, which is why it
 * is preferred to the rating: a 71-rated starter and a 71-rated backup want
 * different things, and only the tier knows which is which. A player with no
 * tier on record falls back to his rating, and the pool row says which of the
 * two answered.
 */
export function roleFromTier(tier: string | null, overall: number): DesiredRole {
  switch (tier) {
    case 'STARTER': return 'STARTER';
    case 'ROTATIONAL': return 'ROTATION';
    case 'DEPTH': case 'CAMP': return 'DEPTH';
    default:
      return overall >= 74 ? 'STARTER' : overall >= 66 ? 'ROTATION' : 'DEPTH';
  }
}
