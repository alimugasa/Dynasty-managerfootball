// Camp, the preseason, and the cut to 53.
//
// Three phases between the offseason breaking camp and week 1 kicking off, and
// they are phases rather than a screen: the save sits in one of them, the week
// runner behaves differently in each, and the regular season cannot start from
// any of them until the roster is legal.
//
//   TRAINING_CAMP  the 90 are in. Battles are visible, nothing has been played.
//   PRESEASON      three games that count for nothing and decide everything.
//   FINAL_CUTS     get to 53. The season does not start until you do.
//
// The roster the manager cuts from is not invented here. The world already
// ships 90 players a club -- 53 marked ACTIVE, 17 practice-squad candidates and
// 20 camp bodies -- so camp opens on a real roster with real competition on it,
// and the cut is a decision rather than a formality.

import type { FranchiseSettings } from './franchiseOptions.ts';

export const PRESEASON_PHASES = ['TRAINING_CAMP', 'PRESEASON', 'FINAL_CUTS'] as const;
export type PreseasonPhase = (typeof PRESEASON_PHASES)[number];

export const isPreseasonPhase = (phase: string): phase is PreseasonPhase =>
  (PRESEASON_PHASES as readonly string[]).includes(phase);

export const PRESEASON_LABEL: Readonly<Record<PreseasonPhase, string>> = {
  TRAINING_CAMP: 'Training camp',
  PRESEASON: 'Preseason',
  FINAL_CUTS: 'Final cuts',
};

/** What the button that leaves each phase says. */
export const PRESEASON_ACTION: Readonly<Record<PreseasonPhase, string>> = {
  TRAINING_CAMP: 'Start the preseason',
  PRESEASON: 'Play the preseason game',
  FINAL_CUTS: 'Finalize the roster',
};

/** Three games. Enough for a fringe player to be seen three times, which is
 *  what makes a camp battle a battle rather than one good afternoon. */
export const PRESEASON_WEEKS = 3;

export interface RosterLimits {
  /** The most a club may carry through camp. */
  readonly camp: number;
  /** What the roster must be when the season starts. */
  readonly active: number;
  readonly practiceSquad: number;
  /** Whether the active limit is enforced at all. Commissioner mode is the one
   *  setting that turns a rule into a recommendation, and a screen that hides
   *  the difference would be lying about which save is which. */
  readonly enforced: boolean;
}

export const DEFAULT_LIMITS: RosterLimits = {
  camp: 90, active: 53, practiceSquad: 17, enforced: true,
};

/**
 * The limits this save is played under.
 *
 * Commissioner mode lifts enforcement rather than raising the number: the
 * target is still 53, the screens still count toward it, and the difference is
 * only that the season is allowed to start over it. A commissioner who wants
 * 60 men is not told they have the wrong number of players; they are told the
 * number, and left to it.
 */
export function rosterLimits(settings: FranchiseSettings | null): RosterLimits {
  if (settings === null) return DEFAULT_LIMITS;
  return { ...DEFAULT_LIMITS, enforced: settings.commissionerMode !== 'ON' };
}

/** How many players still have to go. Never negative: a club under the limit
 *  is finished, not owed cuts. */
export function cutsRemaining(rosterCount: number, limits: RosterLimits): number {
  return Math.max(0, rosterCount - limits.active);
}

/**
 * Is this roster allowed to start a season?
 *
 * Under commissioner mode anything is. Otherwise it is exactly the active
 * limit -- not "at most", because a club that starts the year with 51 men has
 * two holes it cannot fill on a Sunday, and the rule exists to stop that as
 * much as to stop a 60-man roster.
 */
export function rosterIsLegal(rosterCount: number, limits: RosterLimits): boolean {
  return !limits.enforced || rosterCount === limits.active;
}

/** Why it is not legal, in the words the modal uses. Null when it is. */
export function rosterFault(rosterCount: number, limits: RosterLimits): string | null {
  if (rosterIsLegal(rosterCount, limits)) return null;
  const over = rosterCount - limits.active;
  if (over > 0) {
    return `${String(over)} ${over === 1 ? 'player has' : 'players have'} to go before the season `
      + `can start. The roster is ${String(rosterCount)}; the limit is ${String(limits.active)}.`;
  }
  const short = -over;
  return `The roster is ${String(short)} ${short === 1 ? 'player' : 'players'} short of the `
    + `${String(limits.active)} the season starts with. Sign somebody, or promote from the `
    + 'practice squad.';
}

/**
 * The phase after this one.
 *
 * Preseason repeats until its three games are played, which is why this takes
 * the week: every other phase has one way out.
 */
export function nextPreseasonPhase(phase: PreseasonPhase, week: number): PreseasonPhase | 'REGULAR_SEASON' {
  if (phase === 'TRAINING_CAMP') return 'PRESEASON';
  if (phase === 'PRESEASON') return week >= PRESEASON_WEEKS ? 'FINAL_CUTS' : 'PRESEASON';
  return 'REGULAR_SEASON';
}
