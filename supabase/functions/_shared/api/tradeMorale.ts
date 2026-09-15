// How a player feels about being moved around.
//
// Morale is deliberately thin, and null by default. The league models a
// player's ability, his contract and his availability; it does not model his
// home life, his coach or his agent, and a morale number that moved for
// reasons this game cannot name would be a number pretending to know things.
//
// So it starts as null -- which reads as "nobody has asked", and is a
// different fact from "he is fine" -- and moves only on events with a cause
// this game can point at. Two, for now: being listed for trade, and being
// traded. Each writes a number and a reason it changed.

/** Where a player sits once something has happened to him and there is no
 *  earlier reading. The midpoint, used only as the starting point of a move
 *  that is about to happen -- never written on its own. */
const NEUTRAL = 60;

/** Being made available is not a compliment. */
export const BLOCK_PENALTY = 14;
/** Coming off the block returns most, but not all, of it: he knows now. */
export const UNBLOCK_RECOVERY = 9;
/** Being traded unsettles a player, and rather less than being shopped did --
 *  a trade is at least a club that wanted him. */
export const TRADE_PENALTY = 6;

const clampMorale = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

/** His morale after being listed. A player with no reading yet gets one now,
 *  because being put on the block is exactly the event that creates one. */
export const moraleAfterBlock = (current: number | null): number =>
  clampMorale((current ?? NEUTRAL) - BLOCK_PENALTY);

export const moraleAfterUnblock = (current: number | null): number | null =>
  current === null ? null : clampMorale(current + UNBLOCK_RECOVERY);

/**
 * His morale after a trade.
 *
 * Null stays null. A player nobody has ever recorded a feeling about does not
 * acquire one by changing clubs -- a trade is not the event that makes a
 * player's mood knowable, and inventing a number here would put a figure on
 * every screen that no event in this game produced.
 */
export const moraleAfterTrade = (current: number | null): number | null =>
  current === null ? null : clampMorale(current - TRADE_PENALTY);

/** What a screen says about a morale reading, including not having one. */
export function moraleLabel(morale: number | null): string {
  if (morale === null) return 'Not on record';
  if (morale >= 80) return 'Happy';
  if (morale >= 60) return 'Settled';
  if (morale >= 40) return 'Unsettled';
  if (morale >= 20) return 'Unhappy';
  return 'Wants out';
}
