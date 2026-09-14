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

/** A numeric column as a number, or null where the row was not there. */
export const num = (v: string | null): number | null => (v === null ? null : Number(v));

/** One decimal, rounded once, here -- so the screen and the label agree about
 *  what a club is rated. Two roundings of the same number is how a 74 gets
 *  filtered as a 73. */
export const rounded = (v: string | null): number | null => {
  const n = num(v);
  return n === null ? null : Math.round(n * 10) / 10;
};

/**
 * A club in one number, from its three units.
 *
 * The kicking game is a tenth of a club, which is about what it is worth and
 * well short of what it feels like in December. A club with no special teams
 * measured is rated as though its kickers were its defence rather than as
 * though it had none.
 *
 * It lives here rather than in either screen because the scouting board and
 * the franchise dashboard both print it, and two copies of one formula is how
 * the same club comes to be rated 78 on one screen and 79 on the next.
 */
export function overallRating(
  offense: number | null, defense: number | null, specialTeams: number | null,
): number | null {
  if (offense === null || defense === null) return null;
  return Math.round(offense * 0.45 + defense * 0.45 + (specialTeams ?? defense) * 0.1);
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

// ------------------------------------------------------------------ the owner
//
// What the owner has asked for this season, and how the season is going
// against it.
//
// Everything below is a function of rows the save actually holds: the owner's
// patience and win-now bias from public.owners, the roster's rating and age
// from the players, the cap sheet, and the quarterback. It is a reading of
// those numbers, not a mechanic -- nothing in the simulation reads the mandate
// back, no owner fires anybody, and the screen that shows this says so in as
// many words. A goal the game silently ignored would be worse than no goal.

/** The five mandates an owner hands a new manager, by their keys. The screen
 *  writes them out; the server decides which one it is. */
export type Mandate =
  | 'CLEAR_CAP' | 'WIN_DIVISION' | 'MAKE_PLAYOFFS' | 'DEVELOP_QB' | 'REBUILD';

export interface OwnerInput {
  /** 0-100 from public.owners. Null on a world that shipped no owner row. */
  readonly patience: number | null;
  /** How far the owner leans on this year over the next one, 0-1. */
  readonly winNowBias: number | null;
  readonly overall: number | null;
  readonly averageAge: number | null;
  readonly capSpace: number | null;
  /** The label quarterbackSituation() returned for this club. */
  readonly quarterback: string | null;
}

/**
 * What the owner wants first.
 *
 * Ordered the way suggestedMove is ordered -- by what would sink the franchise
 * soonest -- with one difference: the owner's own temperament breaks the tie
 * between winning the division and reaching the playoffs, because those two
 * mandates sit on the same roster and it is the man upstairs who decides which
 * one he said out loud.
 */
export function ownerMandate(o: OwnerInput): Mandate | null {
  const { overall, capSpace, quarterback, averageAge, patience, winNowBias } = o;
  // No rating means no roster was measured, and an owner with no idea what he
  // has does not get to have an opinion about it.
  if (overall === null) return null;
  if (capSpace !== null && capSpace < 0) return 'CLEAR_CAP';
  // An impatient owner of a good team wants the division. A patient one with
  // the same roster will settle for January. Absent an owner row, the roster
  // decides alone and the bar is the higher one.
  const winNow = (winNowBias !== null && winNowBias >= 0.6)
    || (patience !== null && patience < 45);
  if (overall >= 82) return winNow ? 'WIN_DIVISION' : 'MAKE_PLAYOFFS';
  if (quarterback === 'No Answer') return overall >= 74 ? 'MAKE_PLAYOFFS' : 'REBUILD';
  if (quarterback === 'Rookie Project' || quarterback === 'Open Competition') return 'DEVELOP_QB';
  if (overall >= 76) return 'MAKE_PLAYOFFS';
  if (overall < 70) return 'REBUILD';
  // The middle of the league, with a settled quarterback and nothing forcing
  // the decision. This is where the owner earns his place on the card: one who
  // wants it now asks for January off a roster that probably cannot get there,
  // and one who can wait asks for the roster to be better in two years. Age
  // breaks the tie for the patient owner, because a young middling roster is
  // a thing to build on and an old one is a thing to take apart.
  if (winNow) return 'MAKE_PLAYOFFS';
  return averageAge !== null && averageAge >= 25.8 ? 'REBUILD' : 'DEVELOP_QB';
}

/**
 * Where the season stands against the mandate.
 *
 * A reading of the record, and only of the record: null before a game is
 * played, because a club that has not taken the field is neither on track nor
 * behind, and saying either would be inventing a judgement out of nothing.
 *
 * `winPace` is wins as a share of games played. The thresholds are the shape
 * of the competition rather than the club: a division is won around two thirds
 * of the time and the bracket takes roughly the top half.
 */
export function mandateStanding(
  mandate: Mandate | null, wins: number, losses: number, ties: number,
): string | null {
  const played = wins + losses + ties;
  if (mandate === null || played === 0) return null;
  if (mandate === 'CLEAR_CAP' || mandate === 'REBUILD' || mandate === 'DEVELOP_QB') {
    // These are not judged by a win column, and pretending otherwise would
    // rate a rebuild a failure for doing exactly what it was asked to do.
    return null;
  }
  const pace = (wins + ties * 0.5) / played;
  const bar = mandate === 'WIN_DIVISION' ? 0.66 : 0.5;
  if (pace >= bar + 0.12) return 'Ahead of it';
  if (pace >= bar) return 'On track';
  if (pace >= bar - 0.15) return 'Just short';
  return 'Behind it';
}

/**
 * How hard next week looks, from the two ratings.
 *
 * A margin, not a ranking: eight rating points is roughly the gap between a
 * playoff team and a bad one, so it is where "tough" starts. Null unless both
 * clubs were measured, because a matchup against a club we could not rate is
 * not an even one -- it is an unknown one.
 */
export function matchupDifficulty(
  mine: number | null, theirs: number | null,
): string | null {
  if (mine === null || theirs === null) return null;
  const margin = mine - theirs;
  if (margin >= 8) return 'Comfortable';
  if (margin >= 3) return 'Favoured';
  if (margin > -3) return 'Even';
  if (margin > -8) return 'Tough';
  return 'Severe';
}
