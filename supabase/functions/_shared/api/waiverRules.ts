// Who chooses first, who gets him, and when the window shuts.
//
// Pure. A waiver system is a queue and a deadline, and both are rules rather
// than judgement calls -- which is exactly the kind of thing that should be
// decidable by a test rather than argued about against a database.
//
// The one rule worth stating plainly: a claim is settled by the priority that
// was in force when it was made, not by the priority at resolution. Those are
// different numbers, because priority moves when a claim is awarded, and a
// club that submitted first on Tuesday must not be overtaken on Thursday by a
// result it had nothing to do with.

/**
 * How long a claim window stays open, in weeks.
 *
 * Two. One was the first answer and it was too fast to play against: a player
 * posted during a week was settled the moment the next one began, so the wire
 * a manager opened on a Tuesday held only what had been cut since the last
 * whistle, and anything they did not act on immediately was gone before they
 * looked again. Two weeks means the wire accumulates -- there is a list to
 * read rather than a snapshot to catch -- and a claim is a decision made over
 * a week rather than a reflex.
 *
 * This is the configurable deadline. Everything else about the window is
 * derived from it: when claims close, when the award is made, and what the
 * screen says the deadline is.
 */
export const WAIVER_WINDOW_WEEKS = 2;

/** Games a club must have played before its own record decides its place in
 *  the queue. Below this the table says almost nothing -- three clubs at 1-0
 *  are not ranked by anything -- so last season's finish is the better answer. */
export const STANDINGS_MINIMUM_GAMES = 3;

export interface ClubStanding {
  readonly teamId: string;
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  /** Where the club finished last season, 1 best. Null for a league with no
   *  previous season, which is the one case neither source can answer and is
   *  settled on the club id so the order is at least stable. */
  readonly lastSeasonRank: number | null;
}

/**
 * The queue, worst club first.
 *
 * Reverse order of standing, which is the whole point of a waiver system: the
 * club that has won least gets first refusal, so the wire works against the
 * table rather than with it.
 *
 * Early in a season the table cannot carry that weight. Three clubs at 1-0 are
 * not ranked by anything, and a queue built on it would be noise dressed as a
 * rule -- so until every club has played STANDINGS_MINIMUM_GAMES the previous
 * season's finish decides, in reverse, which is a real ordering that everybody
 * can see coming.
 */
export function waiverOrder(clubs: readonly ClubStanding[]): readonly string[] {
  const played = (c: ClubStanding): number => c.wins + c.losses + c.ties;
  const enough = clubs.length > 0 && clubs.every((c) => played(c) >= STANDINGS_MINIMUM_GAMES);

  const ranked = [...clubs].sort((a, b) => {
    if (enough) {
      // Fewest wins first; a worse win percentage breaks a tie on games played.
      const pct = (c: ClubStanding): number =>
        (c.wins + c.ties * 0.5) / Math.max(1, played(c));
      const byPct = pct(a) - pct(b);
      if (Math.abs(byPct) > 1e-9) return byPct;
    } else {
      // Last season, in reverse: the club that finished last picks first. A
      // club with no finish on record sorts behind everyone with one rather
      // than being given a rank it never earned.
      const rank = (c: ClubStanding): number => c.lastSeasonRank ?? -1;
      const byRank = rank(b) - rank(a);
      if (byRank !== 0) return byRank;
    }
    // Stable, and visibly arbitrary rather than invisibly arbitrary.
    return a.teamId.localeCompare(b.teamId);
  });
  return ranked.map((c) => c.teamId);
}

export interface Claim {
  readonly teamId: string;
  readonly priorityAtClaim: number;
}

export interface ClaimEligibility {
  /** Whether the club can actually take him: a roster place and the room. */
  readonly eligible: boolean;
  readonly reason: string | null;
}

/**
 * Which claim wins.
 *
 * The lowest priority number among the claims that can actually be honoured.
 * A club that claimed and has since filled its last roster place does not win
 * him and block everybody behind it -- the award falls to the next club that
 * can take him, which is what makes the queue a queue rather than a lottery.
 */
export function awardClaim(
  claims: readonly Claim[],
  eligibility: (teamId: string) => ClaimEligibility,
): { readonly winner: string | null; readonly passed: readonly string[] } {
  const passed: string[] = [];
  for (const claim of [...claims].sort((a, b) => a.priorityAtClaim - b.priorityAtClaim)) {
    const check = eligibility(claim.teamId);
    if (check.eligible) return { winner: claim.teamId, passed };
    passed.push(claim.teamId);
  }
  return { winner: null, passed };
}

/**
 * The queue after an award.
 *
 * The club that was awarded the player goes to the back. This is the rule that
 * stops one club at the top of the order taking every player it wants all
 * season, and it is why priority has to be stored rather than recomputed from
 * the table -- the table has not changed, and the order has.
 */
export function reorderAfterAward(
  order: readonly string[], awardedTo: string,
): readonly string[] {
  if (!order.includes(awardedTo)) return order;
  return [...order.filter((id) => id !== awardedTo), awardedTo];
}

/**
 * The week a window is settled at the top of.
 *
 * A player posted in week 6 with a one-week window is settled when week 7
 * begins, and plays for whoever claimed him that same week. The first version
 * of this settled a week later -- the window stayed open *through* the
 * deadline week and was resolved after it -- which meant a player cut in week
 * 5 sat on the wire for two Sundays before anybody could use him. Nobody would
 * claim a player on those terms, which would have made the whole wire
 * decorative.
 */
export const deadlineFor = (postedWeek: number): number =>
  postedWeek + WAIVER_WINDOW_WEEKS;

/** Can a claim still be made? Open up to, and not including, the week the
 *  window is settled in -- because by the time that week is being played the
 *  award has already been made. */
export const windowOpen = (deadlineWeek: number, week: number): boolean =>
  week < deadlineWeek;

/** Is this window due to be settled at the top of the week about to be played? */
export const windowDue = (deadlineWeek: number, week: number): boolean =>
  deadlineWeek <= week;
