// What the measurements add up to, in the words a scouting report would use.
//
// Everything here is a pure function of numbers measured elsewhere, and every
// one of them returns null when the number behind it is missing. That is the
// whole discipline of this file: a phrase like "Find a long-term quarterback"
// is only worth reading if it could not have been printed over a club whose
// quarterback we never looked at.
//
// The bands are absolute, not ranked. A rating of 86 is elite whether or not
// six clubs are better, and a manager who has played any football game knows
// what 86 means; re-ranking it against this particular league would make the
// same roster read differently in a league that happened to be weaker.

/** A rating, banded. Drives the colour of every rating tile, so the bands are
 *  named rather than left as numbers in a style block. */
export type RatingBand = 'elite' | 'strong' | 'solid' | 'developing' | 'weak';

export function ratingBand(rating: number | null): RatingBand | null {
  if (rating === null) return null;
  if (rating >= 85) return 'elite';
  if (rating >= 80) return 'strong';
  if (rating >= 70) return 'solid';
  if (rating >= 60) return 'developing';
  return 'weak';
}

/**
 * The quarterback, in the six words a front office would use.
 *
 * Read in order, because the cases overlap: an elite passer is a franchise
 * quarterback at any age, and a 22-year-old rated 68 is a project rather than
 * an open competition even when the backup is close behind him.
 *
 * `backup` is what the second quarterback on the roster is rated. It is the
 * only way to tell a settled job from an unsettled one: two passers a point
 * apart is a competition whoever wins it.
 */
export function quarterbackSituation(
  starter: number | null, age: number | null, backup: number | null,
): string | null {
  if (starter === null) return null;
  if (starter >= 85) return 'Franchise QB';
  if (starter < 62) return 'No Answer';
  if (age !== null && age <= 24) return 'Rookie Project';
  if (age !== null && age >= 32) return 'Veteran Stopgap';
  if (backup !== null && starter - backup <= 3) return 'Open Competition';
  return 'Bridge QB';
}

/** How demanding the market is. Market size is the only thing the world
 *  models about a crowd, so it is what this says -- and it says so, rather
 *  than implying a fan base that was simulated week by week. */
export function fanPressure(marketSize: number | null): string | null {
  if (marketSize === null) return null;
  if (marketSize >= 9) return 'Relentless';
  if (marketSize >= 7) return 'Demanding';
  if (marketSize >= 5) return 'Engaged';
  if (marketSize >= 3) return 'Patient';
  return 'Forgiving';
}

/** What an owner's patience means for the job. */
export function ownerMood(patience: number | null): string | null {
  if (patience === null) return null;
  if (patience >= 70) return 'Patient';
  if (patience >= 45) return 'Even-handed';
  if (patience >= 25) return 'Restless';
  return 'Win now or else';
}

/** The club's standard allotment of picks: seven rounds, two drafts out. The
 *  anchor a draft-capital score of 50 means. */
const BASELINE_CAPITAL = 2 * [100, 60, 36, 22, 13, 8, 5].reduce((a, b) => a + b, 0);

/** Draft capital as a score out of 100, where 50 is exactly the picks every
 *  club is given. A club that has traded none of them scores 50 and should:
 *  the number is "how far from standard", not "how far from the best club in
 *  this particular league". */
export function draftScore(capital: number | null): number | null {
  if (capital === null) return null;
  return Math.min(100, Math.round((capital / BASELINE_CAPITAL) * 50));
}

export function draftLabel(score: number | null): string | null {
  if (score === null) return null;
  if (score >= 75) return 'Loaded';
  if (score >= 58) return 'Strong';
  if (score >= 43) return 'Standard';
  if (score >= 30) return 'Thin';
  return 'Mortgaged';
}

export interface Outlook {
  readonly offense: number | null;
  readonly defense: number | null;
  readonly overall: number | null;
  readonly averageAge: number | null;
  readonly capSpace: number | null;
  readonly draft: number | null;
  readonly quarterback: string | null;
  readonly weakest: string | null;
  /** How far the weakest room is below the league's average for that room, in
   *  rating points. Negative is behind. A club can be strong overall and still
   *  be five points light at one position, which is exactly the thing a first
   *  move should be about. */
  readonly weakestBehind: number | null;
}

/**
 * How long before this roster is the one that wins.
 *
 * Strength decides the horizon and age decides which way it is moving: a good
 * old team is closing a window, a good young one is opening one, and a weak
 * old team is the worst place to stand in this sport.
 */
export function rosterTimeline(o: Outlook): string | null {
  const { overall, averageAge } = o;
  if (overall === null) return null;
  const old = averageAge !== null && averageAge >= 25.8;
  const young = averageAge !== null && averageAge <= 25.2;
  if (overall >= 82) return old ? 'Closing window' : 'Win now';
  if (overall >= 78) return young ? 'Rising' : 'Contending soon';
  if (overall >= 74) return young ? 'Two years out' : 'Retooling';
  return old ? 'Long rebuild' : 'Building from the ground up';
}

/** The club in one phrase, for the line under the difficulty. */
export function franchiseStatus(o: Outlook, difficulty: string | null): string | null {
  const timeline = rosterTimeline(o);
  if (difficulty === null || timeline === null) return null;
  return `${difficulty} · ${timeline}`;
}

/** How far behind the league a room has to be before it is the thing to fix.
 *  Three rating points across a starting group is a unit somebody notices on
 *  a Sunday; one point is noise in how the seed was generated. */
const THIN = -3;

/**
 * The first thing this manager should do, from what the numbers say.
 *
 * Ordered by what would sink the franchise soonest: money first, because a
 * club over the cap cannot do anything else until it is not; then the position
 * that decides more games than any other; then the assets; then the club whose
 * problem is that its window is open and closing; then the hole in the roster;
 * and only at the end the advice that is about a good team rather than a
 * broken one.
 *
 * The hole is judged on how far behind the league that room is rather than on
 * the club's overall rating. Gating it on overall put seventeen of thirty-two
 * clubs on the final fallback, which is a way of saying nothing to more than
 * half the league.
 */
export function suggestedMove(o: Outlook): string | null {
  const { overall, capSpace, quarterback, weakest, weakestBehind, averageAge, draft } = o;
  if (overall === null) return null;
  if (capSpace !== null && capSpace < 0) return 'Clear cap space before anything else.';
  if (quarterback === 'No Answer' || quarterback === 'Open Competition') {
    return 'Find a long-term quarterback.';
  }
  if (draft !== null && draft < 35) return 'Rebuild the draft board before trading more picks.';
  if (overall >= 82 && averageAge !== null && averageAge >= 25.8) {
    return 'Win now, before the veteran core ages out.';
  }
  if (weakest !== null && weakestBehind !== null && weakestBehind <= THIN) {
    return `Review ${weakest.toLowerCase()} depth.`;
  }
  if (capSpace !== null && capSpace < 8_000_000) return 'Protect cap space.';
  if (quarterback === 'Rookie Project') return 'Build around the young quarterback.';
  return 'Extend the core before the market sets the price.';
}
