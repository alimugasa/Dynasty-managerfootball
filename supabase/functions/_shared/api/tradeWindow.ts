// When trading is open.
//
// A deadline is the only thing that makes a trade season have a shape. Without
// one every week is the same week and there is no reason to act now rather
// than later; with one, the four weeks before it are the most interesting
// weeks of the year to be a manager.
//
// The rule is one line and the rest of this file is the words a screen needs
// to say it, which is most of what a deadline actually is: a countdown a
// person can see coming.

/** How far into the regular season the deadline falls, as a share of it.
 *  About two thirds of the way through -- late enough that clubs know what
 *  they are, early enough that what they do about it still matters. */
export const DEADLINE_SHARE = 0.61;

/** The league's default deadline for a season of this length. A save may name
 *  its own, which is why this takes the number of weeks rather than assuming
 *  one: an 18-week season and a 22-week one do not share a week 11. */
export const defaultDeadlineWeek = (seasonWeeks: number): number =>
  Math.max(1, Math.round(seasonWeeks * DEADLINE_SHARE));

export interface WindowState {
  readonly open: boolean;
  readonly deadlineWeek: number;
  /** Weeks left including this one. Zero on deadline week itself, negative
   *  once it has gone. */
  readonly weeksLeft: number;
  /** Deadline week itself, when a manager should be told loudly. */
  readonly isDeadlineWeek: boolean;
  /** Why it is shut, where it is. Null while it is open. */
  readonly closedBecause: string | null;
}

/**
 * Whether a trade can be agreed right now.
 *
 * Shut outside the season for a reason that is not the deadline: the
 * offseason has its own trade route and its own rules, and a deal agreed in
 * the Trade Center during the draft would be running two systems over one
 * roster. Shut after the deadline until the offseason opens.
 */
export function tradeWindow(
  phase: string, week: number, seasonWeeks: number, savedDeadline: number | null,
): WindowState {
  const deadlineWeek = savedDeadline ?? defaultDeadlineWeek(seasonWeeks);
  const weeksLeft = deadlineWeek - week;

  if (phase !== 'REGULAR_SEASON') {
    return {
      open: false, deadlineWeek, weeksLeft,
      isDeadlineWeek: false,
      closedBecause: phase === 'PLAYOFFS'
        ? 'Trading is shut for the postseason'
        : 'The in-season trade window opens with the regular season',
    };
  }
  if (week > deadlineWeek) {
    return {
      open: false, deadlineWeek, weeksLeft, isDeadlineWeek: false,
      closedBecause: `The deadline passed in week ${String(deadlineWeek)}`,
    };
  }
  return {
    open: true, deadlineWeek, weeksLeft,
    isDeadlineWeek: week === deadlineWeek,
    closedBecause: null,
  };
}

/**
 * The countdown, in the words a dashboard uses.
 *
 * It gets louder as it gets closer, because that is the information: "week 11"
 * is a fact and "this week" is a prompt. Null well out from the deadline --
 * a countdown that runs all season is wallpaper, and stops being read long
 * before it starts mattering.
 */
export function deadlineNotice(w: WindowState): string | null {
  if (!w.open) return w.closedBecause;
  if (w.isDeadlineWeek) return 'Trade deadline: today';
  if (w.weeksLeft === 1) return 'Trade deadline: next week';
  if (w.weeksLeft <= 4) return `Trade deadline in ${String(w.weeksLeft)} weeks`;
  return null;
}

/** How urgent the countdown is, for the colour a screen gives it. */
export const deadlineUrgency = (w: WindowState): 'none' | 'soon' | 'now' | 'shut' => {
  if (!w.open) return 'shut';
  if (w.isDeadlineWeek) return 'now';
  if (w.weeksLeft <= 2) return 'soon';
  return 'none';
};
