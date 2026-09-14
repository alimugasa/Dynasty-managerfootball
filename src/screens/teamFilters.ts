// Narrowing thirty-two clubs down to the one you want.
//
// The chips' keys are the server's tags -- which club is a contender, which
// eight have the most cap space -- because those are statements about the
// league and the league is only whole on the server. The labels are here
// because they are copy. A test asserts the two lists name the same tags.
//
// The search is the opposite: it matches on strings the client already has, so
// it filters as fast as the player types and asks nothing of the network.

import { divisionCompact, divisionFull, divisionShort } from '../../supabase/functions/_shared/api/leaguePlacing';
import type { TeamProfile } from '../../supabase/functions/_shared/api/reads/teamProfiles';

/** The chip that is no filter at all. Not a tag: it is the absence of one. */
export const ALL = 'ALL';

export const TEAM_FILTERS = [
  { key: ALL, label: 'All' },
  { key: 'CONTENDERS', label: 'Contenders' },
  { key: 'PLAYOFF_PUSH', label: 'Playoff Push' },
  { key: 'MID_TIER', label: 'Mid-Tier' },
  { key: 'REBUILDS', label: 'Rebuilds' },
  { key: 'CAP_SPACE', label: 'Cap Space' },
  { key: 'YOUNG_ROSTER', label: 'Young Roster' },
  { key: 'ELITE_QB', label: 'Elite QB' },
  { key: 'HIGH_DRAFT_PICKS', label: 'High Draft Picks' },
] as const;

/** What a chip is actually selecting, for the line under the list. Said in
 *  words because "top eight by cap space" is a rule a player can check, and
 *  "Cap Space" on its own is a word they have to guess at. */
export const FILTER_DETAIL: Readonly<Record<string, string>> = {
  CONTENDERS: 'The six strongest rosters in the league.',
  PLAYOFF_PUSH: 'Eight clubs a season away.',
  MID_TIER: 'The middle of the league.',
  REBUILDS: 'Rosters that need rebuilding.',
  CAP_SPACE: 'The eight clubs with the most room under the cap.',
  YOUNG_ROSTER: 'The eight youngest rosters.',
  ELITE_QB: 'A quarterback rated 88 or better.',
  HIGH_DRAFT_PICKS: 'The eight best-stocked with draft picks.',
};

/** Everything a player might type a club's way. The abbreviation and both
 *  division forms are in here because "AC-N", "AC North" and "North" are all
 *  things somebody will try. */
function haystack(t: TeamProfile): string {
  return [
    t.city, t.teamName, t.fullName, t.abbreviation,
    t.conferenceName, t.conferenceAbbr, t.conferenceShort,
    t.divisionName, t.region,
    // Every way the label is written on screen, so a player who searches what
    // they can see finds it. The ids are deliberately absent: "NC" is the id
    // of the Frontier Conference and matching it would return the wrong eight
    // clubs to somebody who typed the letters off a card.
    divisionShort(t), divisionCompact(t), divisionFull(t),
  ].join(' ').toLowerCase();
}

/**
 * The list as the screen shows it: the chip first, then the search.
 *
 * Every word of the query has to match something, so "cleveland iron" finds
 * the Ironmen and "north iron" finds them too. Matching the whole query as one
 * string would fail the second, which is how a search feels broken.
 */
export function filterTeams(
  teams: readonly TeamProfile[], filter: string, query: string,
): readonly TeamProfile[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w !== '');
  return teams.filter((t) => {
    if (filter !== ALL && !t.tags.includes(filter as never)) return false;
    if (words.length === 0) return true;
    const hay = haystack(t);
    return words.every((w) => hay.includes(w));
  });
}
