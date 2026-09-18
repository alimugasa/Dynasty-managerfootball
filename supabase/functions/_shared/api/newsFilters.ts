// The News tab's filter chips, defined once for both builds.
//
// The chips are a question about a story, and the answer has to be the same on
// the server that counts them and on the screen that draws them. Two copies of
// "is this a team story" would drift the moment a category is added, and the
// count on the chip would stop matching the list under it -- which is the kind
// of small lie that makes a whole feed untrustworthy.
//
// Overlap is deliberate and correct. An injury to one of your own players is a
// Team story and an Injuries story; the chips are filters, not a partition, and
// a story belongs to as many as it belongs to.

/** Every category that can reach the `news` table. Mirrors 0030's check. */
export const NEWS_CATEGORIES = [
  'UPSET', 'STREAK', 'MILESTONE', 'INJURY', 'HOT_SEAT', 'AWARD_RACE',
  'FRANCHISE', 'OWNER', 'CAMP', 'MATCHUP', 'RESULT', 'TRANSACTION',
] as const;

export const NEWS_CHIPS = [
  'ALL', 'TEAM', 'LEAGUE', 'INJURIES', 'TRANSACTIONS', 'DRAFT', 'OWNER',
] as const;

export type NewsChip = (typeof NEWS_CHIPS)[number];

export const CHIP_LABEL: Readonly<Record<NewsChip, string>> = {
  ALL: 'All',
  TEAM: 'Team',
  LEAGUE: 'League',
  INJURIES: 'Injuries',
  TRANSACTIONS: 'Transactions',
  DRAFT: 'Draft',
  OWNER: 'Owner',
};

/** The least a filter needs to know about a story to place it. */
export interface FilterableNews {
  readonly category: string;
  /** The club the story is about, or null for a league-wide one. */
  readonly teamId: string | null;
}

/**
 * One of the seven chips still has nothing behind it.
 *
 * It was two. The waiver wire writes TRANSACTION stories now -- a release, a
 * claim, a signing -- so that chip has a feed behind it and the sentence
 * saying otherwise has gone. The draft board is still not wired to the feed.
 *
 * The chip stays either way, because it is part of the shape the tab is meant
 * to have, and an empty one that says why is honest in a way a missing one is
 * not -- but the screen has to be able to say it, so the fact is recorded here
 * rather than discovered by an empty list.
 */
export const CHIP_UNWRITTEN: Readonly<Partial<Record<NewsChip, string>>> = {
  DRAFT: 'Draft stories are not written to the feed yet.',
};

export function isNewsChip(value: unknown): value is NewsChip {
  return typeof value === 'string' && (NEWS_CHIPS as readonly string[]).includes(value);
}

/**
 * Does this story belong under this chip?
 *
 * `userTeamId` is what makes Team and League meaningful; without it neither
 * can be answered, so a caller that does not know which club is being managed
 * gets nothing under either rather than a guess.
 */
export function matchesChip(
  chip: NewsChip, item: FilterableNews, userTeamId: string | null,
): boolean {
  switch (chip) {
    case 'ALL':
      return true;
    // Your club, whatever the story is about it.
    case 'TEAM':
      return userTeamId !== null && item.teamId === userTeamId;
    // Everyone else, plus the stories that belong to no single club. A
    // league-wide story is not about your club, so it is league news even
    // though nobody's name is on it.
    case 'LEAGUE':
      return userTeamId === null ? false : item.teamId !== userTeamId;
    case 'INJURIES':
      return item.category === 'INJURY';
    case 'TRANSACTIONS':
      return item.category === 'TRANSACTION';
    case 'DRAFT':
      return item.category === 'DRAFT';
    // What the owner said, and what the league is saying about a coach's job.
    case 'OWNER':
      return item.category === 'OWNER' || item.category === 'HOT_SEAT';
  }
}

/** How many stories each chip would show, for the number on the chip itself. */
export function chipCounts(
  items: readonly FilterableNews[], userTeamId: string | null,
): Readonly<Record<NewsChip, number>> {
  const counts = {} as Record<NewsChip, number>;
  for (const chip of NEWS_CHIPS) {
    counts[chip] = items.filter((i) => matchesChip(chip, i, userTeamId)).length;
  }
  return counts;
}
