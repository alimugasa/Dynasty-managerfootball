// What a club looks like to someone choosing one, worked out from its rows.
//
// Every number here is measured, not invented: the unit ratings are the mean
// of the players who would actually be on the field, the cap space is the cap
// sheet, the draft capital is the picks the club owns. Nothing is a flavour
// value seeded to make a screen look busy.
//
// The labels are the one place judgement enters, so the judgement is written
// down. An archetype describes the shape of a roster; a difficulty describes
// how hard the job is. Both are pure functions of the measurements, and both
// return null when the measurement behind them is missing -- a club whose
// players did not load is unrated, which is not the same fact as a bad club.
//
// Ranked labels are ranked against this league, not against absolute numbers,
// which is why they are computed over all thirty-two at once. "A top-six
// roster" is a fact about a league; "a roster rated 74" is a fact that means
// nothing without the other thirty-one.

/** Roster measurements for one club, before any label is put on them. */
export interface TeamMeasure {
  readonly teamId: string;
  readonly offense: number | null;
  readonly defense: number | null;
  readonly specialTeams: number | null;
  readonly overall: number | null;
  readonly averageAge: number | null;
  readonly capSpace: number | null;
  readonly draftCapital: number | null;
  readonly quarterback: number | null;
}

/** The six the product names. `CAP_HELL` outranks the rest: a club that owes
 *  more than it may spend has one problem before it has any other. */
export const DIFFICULTIES = [
  'Dynasty Ready', 'Playoff Push', 'Middle Class', 'Rebuild', 'Hard Rebuild', 'Cap Hell',
] as const;

export type Difficulty = (typeof DIFFICULTIES)[number];

/** The filter chips. The client renders the labels; these keys are what a
 *  club is actually tagged with, so that the statistics behind them -- "top
 *  eight by cap space" -- are worked out where the whole league is in hand. */
export const TEAM_TAGS = [
  'CONTENDERS', 'PLAYOFF_PUSH', 'MID_TIER', 'REBUILDS',
  'CAP_SPACE', 'YOUNG_ROSTER', 'ELITE_QB', 'HIGH_DRAFT_PICKS',
] as const;

export type TeamTag = (typeof TEAM_TAGS)[number];

/** How many clubs a "top of the league" chip admits. A quarter of thirty-two:
 *  narrow enough to be a shortlist, wide enough not to be a podium. */
const QUARTILE = 8;

/** Where the difficulty bands fall, by rank of roster strength. The bands are
 *  uneven on purpose -- most of a league is the middle. */
const BANDS: readonly (readonly [number, Difficulty])[] = [
  [6, 'Dynasty Ready'],
  [14, 'Playoff Push'],
  [24, 'Middle Class'],
  [29, 'Rebuild'],
  [32, 'Hard Rebuild'],
];

/** What the club's best quarterback is, in words. Absolute rather than ranked:
 *  a starting quarterback is judged against the position, not against the
 *  other thirty-one, and every manager in the game knows what 90 means. */
export function quarterbackStatus(rating: number | null): string | null {
  if (rating === null) return null;
  if (rating >= 88) return 'Elite';
  if (rating >= 80) return 'Established';
  if (rating >= 72) return 'Starter';
  if (rating >= 65) return 'Question mark';
  return 'Unsettled';
}

/**
 * The shape of the roster, in one phrase.
 *
 * Read in this order: a lopsided club is described by its lopsidedness first,
 * because that is the thing a manager would notice walking in, and only a club
 * that is even on both sides is then described by its age.
 *
 * The thresholds are absolute rather than ranked, because this is a
 * description and not a placing -- the eighth most offence-leaning club in a
 * balanced league is not an offensive engine. They are set against the spread
 * the shipped league actually has (units within about four points of each
 * other, ages within about a year), which is the only way a description can be
 * calibrated. A seed with a different spread would need them moved, and
 * tests/api/teamProfiles asserts that no one label has swallowed the league.
 */
const LOPSIDED = 1.5;
const YOUNG = 25.2;
const VETERAN = 25.8;

export function archetypeOf(m: TeamMeasure): string | null {
  const { offense, defense, averageAge } = m;
  if (offense === null || defense === null) return null;
  if (offense - defense >= LOPSIDED) return 'Offensive engine';
  if (defense - offense >= LOPSIDED) return 'Defensive core';
  if (averageAge === null) return 'Balanced';
  if (averageAge <= YOUNG) return 'Young core';
  if (averageAge >= VETERAN) return 'Veteran window';
  return 'Balanced';
}

/** Ranks 1..n over a measure, best first, with clubs missing it placed last.
 *  Returns the set of team ids inside the first `take`. */
function topBy(
  measures: readonly TeamMeasure[],
  of: (m: TeamMeasure) => number | null,
  take: number,
  best: 'high' | 'low' = 'high',
): ReadonlySet<string> {
  const rated = measures.filter((m) => of(m) !== null);
  const sorted = [...rated].sort((a, b) => {
    const x = of(a) ?? 0;
    const y = of(b) ?? 0;
    return best === 'high' ? y - x : x - y;
  });
  return new Set(sorted.slice(0, take).map((m) => m.teamId));
}

/** What every club is called and tagged, worked out over the whole league. */
export interface TeamShape {
  readonly difficulty: Difficulty | null;
  readonly archetype: string | null;
  readonly tags: readonly TeamTag[];
}

export function shapeLeague(
  measures: readonly TeamMeasure[],
): ReadonlyMap<string, TeamShape> {
  // Strength order, best first. A club with no rating is not ranked at all
  // rather than ranked last: last is a claim about it, and we have none.
  const ranked = measures.filter((m) => m.overall !== null)
    .sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
  const rankOf = new Map(ranked.map((m, i) => [m.teamId, i + 1]));

  const richest = topBy(measures, (m) => m.capSpace, QUARTILE);
  const youngest = topBy(measures, (m) => m.averageAge, QUARTILE, 'low');
  const stocked = topBy(measures, (m) => m.draftCapital, QUARTILE);

  const out = new Map<string, TeamShape>();
  for (const m of measures) {
    const rank = rankOf.get(m.teamId);
    const difficulty: Difficulty | null = m.capSpace !== null && m.capSpace < 0
      ? 'Cap Hell'
      : rank === undefined
        ? null
        : BANDS.find(([upTo]) => rank <= upTo)?.[1] ?? 'Hard Rebuild';

    const tags: TeamTag[] = [];
    if (difficulty === 'Dynasty Ready') tags.push('CONTENDERS');
    if (difficulty === 'Playoff Push') tags.push('PLAYOFF_PUSH');
    if (difficulty === 'Middle Class') tags.push('MID_TIER');
    if (difficulty === 'Rebuild' || difficulty === 'Hard Rebuild') tags.push('REBUILDS');
    if (richest.has(m.teamId)) tags.push('CAP_SPACE');
    if (youngest.has(m.teamId)) tags.push('YOUNG_ROSTER');
    if (quarterbackStatus(m.quarterback) === 'Elite') tags.push('ELITE_QB');
    if (stocked.has(m.teamId)) tags.push('HIGH_DRAFT_PICKS');

    out.set(m.teamId, { difficulty, archetype: archetypeOf(m), tags });
  }
  return out;
}
