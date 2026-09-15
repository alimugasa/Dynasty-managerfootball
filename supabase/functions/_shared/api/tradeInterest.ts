// What the other club makes of it, in words.
//
// Five bands and a list of reasons. The bands are what a manager reads at a
// glance while building a package; the reasons are what tells them which way
// to move. A number on its own -- "valuation gap: 14.2" -- is an answer to a
// question nobody asked, and "no" on its own is a dead end.
//
// The reasons are generated from the same evaluation that produced the band,
// not written alongside it. That matters: a screen that says "contract too
// expensive" while the refusal was actually about pick value has lied about
// its own reasoning, and a manager who trusts it will build the wrong package
// three times in a row.

import { clamp } from '../engine/calibration.ts';
import { APPETITE, STRATEGY_LABEL, YOUNG_ENOUGH, appetiteValue, type Strategy, type ValuedAsset } from './tradeStrategy.ts';
import { packageValue } from './tradeValue.ts';

export const INTEREST_BANDS = ['NO_INTEREST', 'WEAK', 'FAIR', 'STRONG', 'LIKELY_ACCEPT'] as const;
export type Interest = (typeof INTEREST_BANDS)[number];

export const INTEREST_LABEL: Readonly<Record<Interest, string>> = {
  NO_INTEREST: 'No interest',
  WEAK: 'Weak',
  FAIR: 'Fair',
  STRONG: 'Strong',
  LIKELY_ACCEPT: 'Likely accept',
};

export interface TradeContext {
  readonly strategy: Strategy;
  /** 0-1 per position group: how badly this club needs each. */
  readonly needs: Readonly<Record<string, number>>;
  /** Cap room, in dollars. */
  readonly capSpace: number;
  readonly rosterCount: number;
  readonly rosterLimit: number;
  /** Players this club will not trade at any price, and why. */
  readonly untouchable: ReadonlySet<string>;
  /** How hard the franchise is set to make trading. */
  readonly difficulty: 'EASY' | 'NORMAL' | 'HARD';
}

export interface TradeProposal {
  /** What the proposing club sends, which the evaluating club receives. */
  readonly incoming: readonly ValuedAsset[];
  /** What the evaluating club gives up. */
  readonly outgoing: readonly ValuedAsset[];
}

export interface Evaluation {
  readonly interest: Interest;
  readonly reasons: readonly string[];
  /** What the club is being offered, in its own terms. */
  readonly valueOffered: number;
  /** What it wants for what it is giving up. */
  readonly valueAsked: number;
  readonly accepted: boolean;
  /** Set where no package could be accepted at all. */
  readonly blocked: string | null;
}

/** How much the difficulty setting moves the margin a club demands. */
const DIFFICULTY_MARGIN: Readonly<Record<TradeContext['difficulty'], number>> = {
  EASY: 0.94, NORMAL: 1, HARD: 1.09,
};

/**
 * Whether this club is interested, by how much, and why.
 *
 * Both sides are priced in the *evaluating* club's terms, which is the whole
 * point of a strategy: a rebuilding club counts the second-round pick it is
 * being offered for more than the contender across the table does, and counts
 * the 30-year-old it is giving up for less. A single neutral valuation would
 * make every club agree about every deal, and then no deal would ever be
 * interesting.
 */
export function evaluateTrade(
  proposal: TradeProposal, ctx: TradeContext,
): Evaluation {
  const appetite = APPETITE[ctx.strategy];
  const offered = packageValue(appetiteValue(proposal.incoming, ctx.strategy));
  const giving = packageValue(appetiteValue(proposal.outgoing, ctx.strategy));
  const margin = appetite.margin * DIFFICULTY_MARGIN[ctx.difficulty];
  const asked = Math.round(giving * margin * 10) / 10;

  const reasons: string[] = [];
  const blocked = hardRefusal(proposal, ctx);
  if (blocked !== null) {
    return {
      interest: 'NO_INTEREST', reasons: [blocked],
      valueOffered: offered, valueAsked: asked, accepted: false, blocked,
    };
  }

  // What they like about it, and what they do not. Said before the verdict,
  // because these are the things a manager can act on.
  reasons.push(...fitReasons(proposal, ctx));
  reasons.push(...costReasons(proposal, ctx));

  const ratio = asked <= 0 ? (offered > 0 ? 2 : 1) : offered / asked;
  const interest = bandFor(ratio);
  if (interest === 'NO_INTEREST' || interest === 'WEAK') {
    reasons.push(ratio < 0.55
      ? 'Nowhere near enough value coming back'
      : 'Not enough value coming back');
  } else if (interest === 'FAIR') {
    reasons.push('Close, but they want a little more');
  }

  return {
    interest, reasons: dedupe(reasons),
    valueOffered: Math.round(offered * 10) / 10, valueAsked: asked,
    accepted: interest === 'LIKELY_ACCEPT',
    blocked: null,
  };
}

/** Where the ratio of offered to asked puts the club. */
export function bandFor(ratio: number): Interest {
  if (ratio >= 1) return 'LIKELY_ACCEPT';
  if (ratio >= 0.88) return 'STRONG';
  if (ratio >= 0.72) return 'FAIR';
  if (ratio >= 0.45) return 'WEAK';
  return 'NO_INTEREST';
}

/**
 * The refusals no package fixes.
 *
 * Kept apart from the valuation because they are a different kind of answer.
 * "Not enough value" is an invitation to offer more; "they will not trade
 * their quarterback" is not, and a manager who spends twenty minutes adding
 * picks to a deal that was never possible has been misled by the interface.
 */
function hardRefusal(proposal: TradeProposal, ctx: TradeContext): string | null {
  for (const asset of proposal.outgoing) {
    if (asset.kind === 'PLAYER' && ctx.untouchable.has(asset.id)) {
      return `They will not trade ${asset.label}`;
    }
  }
  if (proposal.incoming.length === 0 || proposal.outgoing.length === 0) {
    return 'A trade needs something on both sides';
  }
  const salaryIn = proposal.incoming.reduce((a, x) => a + x.salary, 0);
  const salaryOut = proposal.outgoing.reduce((a, x) => a + x.salary, 0);
  if (salaryIn - salaryOut > ctx.capSpace) {
    return 'They cannot fit the contracts coming back';
  }
  const players = (list: readonly ValuedAsset[]): number =>
    list.filter((a) => a.kind === 'PLAYER').length;
  const after = ctx.rosterCount + players(proposal.incoming) - players(proposal.outgoing);
  if (after > ctx.rosterLimit) {
    return 'They have no roster room for that many players';
  }
  return null;
}

/** What the deal does for them, in football terms. */
function fitReasons(proposal: TradeProposal, ctx: TradeContext): string[] {
  const out: string[] = [];
  const appetite = APPETITE[ctx.strategy];

  for (const asset of proposal.incoming) {
    if (asset.kind !== 'PLAYER') continue;
    const need = ctx.needs[asset.group ?? ''] ?? 0;
    if (need >= 0.55) out.push(`They need help at ${asset.groupLabel ?? asset.group ?? 'that position'}`);
    if ((asset.overall ?? 0) < appetite.floor) {
      out.push(`${asset.label} does not improve their roster`);
    }
    const young = (asset.age ?? 99) <= YOUNG_ENOUGH;
    if (young && (ctx.strategy === 'REBUILD' || ctx.strategy === 'FULL_REBUILD')) {
      out.push(`${asset.label} fits their rebuilding timeline`);
    }
    if (!young && (ctx.strategy === 'REBUILD' || ctx.strategy === 'FULL_REBUILD')) {
      out.push(`As a ${STRATEGY_LABEL[ctx.strategy].toLowerCase()} club they have little use for a veteran`);
    }
  }

  const picksIn = proposal.incoming.filter((a) => a.kind === 'PICK');
  if (picksIn.length > 0 && (ctx.strategy === 'CONTENDER' || ctx.strategy === 'PLAYOFF_PUSH')) {
    out.push('They are chasing this season, not the next draft');
  }
  if (picksIn.length > 0 && ctx.strategy === 'FULL_REBUILD') {
    out.push('Draft capital is exactly what they are collecting');
  }
  // A pick-only package offered for a good player, priced too low, is the
  // most common shape of a deal that is not close.
  const bestOut = Math.max(0, ...proposal.outgoing.map((a) => a.value));
  const bestIn = Math.max(0, ...proposal.incoming.map((a) => a.value));
  if (picksIn.length === proposal.incoming.length && bestIn < bestOut * 0.6) {
    out.push('The pick value is too low for what they are giving up');
  }
  return out;
}

/** What the deal costs them off the field. */
function costReasons(proposal: TradeProposal, ctx: TradeContext): string[] {
  const out: string[] = [];
  const salaryIn = proposal.incoming.reduce((a, x) => a + x.salary, 0);
  const salaryOut = proposal.outgoing.reduce((a, x) => a + x.salary, 0);
  const added = salaryIn - salaryOut;
  if (added > 0 && added > ctx.capSpace * 0.6) {
    out.push('The contract coming back is expensive for them');
  }
  if (ctx.strategy === 'FULL_REBUILD' && added > 0) {
    out.push('They are protecting cap flexibility, not spending it');
  }
  return out;
}

const dedupe = (list: readonly string[]): readonly string[] => [...new Set(list)];

/* --------------------------------------------------------------- counters */

export interface Counter {
  /** What they want added, in words a manager can act on. */
  readonly ask: string;
  /** The value still missing, in the evaluating club's own terms. */
  readonly gap: number;
  /** The kind of asset that would close it, so the screen can point at one. */
  readonly wants: 'PICK' | 'YOUNG_PLAYER' | 'PLAYER' | 'LESS_SALARY';
}

/**
 * What they would say instead of no.
 *
 * Only where the deal is close enough that a counter is honest. A club that
 * has been offered a third of what it wants does not counter, it declines --
 * and a counter generated anyway would be a negotiation the manager cannot
 * win, dressed up as one they can.
 *
 * What it asks for follows the club's own appetite rather than the gap alone:
 * a rebuilding club short of value asks for a pick, a contender asks for a
 * player, and a club that cannot fit the money asks for less of it. That is
 * what makes a counter feel like it came from somebody.
 */
export function counterFor(
  evaluation: Evaluation, ctx: TradeContext,
): Counter | null {
  if (evaluation.accepted || evaluation.blocked !== null) return null;
  const gap = Math.round((evaluation.valueAsked - evaluation.valueOffered) * 10) / 10;
  if (gap <= 0) return null;
  // Below FAIR there is nothing to counter: the two sides are not talking
  // about the same deal.
  if (evaluation.interest === 'NO_INTEREST' || evaluation.interest === 'WEAK') return null;

  if (evaluation.reasons.some((r) => r.includes('expensive'))) {
    return { ask: 'They want less salary coming back', gap, wants: 'LESS_SALARY' };
  }
  switch (ctx.strategy) {
    case 'FULL_REBUILD':
    case 'REBUILD':
      return { ask: 'They want another pick in the deal', gap, wants: 'PICK' };
    case 'RETOOLING':
      return { ask: 'They want a younger player in the deal', gap, wants: 'YOUNG_PLAYER' };
    default:
      return { ask: 'They want another player in the deal', gap, wants: 'PLAYER' };
  }
}

/** How close a package is, 0-1, for the meter under the label. */
export const interestFill = (e: Evaluation): number =>
  clamp(e.valueAsked <= 0 ? 1 : e.valueOffered / e.valueAsked, 0, 1);
