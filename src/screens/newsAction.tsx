// Where a story can take you, and when it cannot take you anywhere.
//
// The rule this module exists to keep: a card shows an action button only when
// the destination is a screen that exists and will render something about this
// story. Everything else shows no button at all -- not a greyed one, not one
// that opens an empty screen. A feed whose buttons sometimes go nowhere is
// worse than a feed with none, because the first dead one teaches a player not
// to trust the rest.
//
// Three things can disqualify a destination, and all three are checked from
// the story's own fields rather than assumed from its category:
//
//   * the story names no game, player or club to open;
//   * it names a game that has not been played, and the Game screen reads box
//     scores -- so the week 1 preview written on creation has no box score to
//     open and is sent to the Play tab instead, which is where that fixture
//     actually is;
//   * it is about another club, and the screens that would show it (the roster,
//     the front office) only ever show yours.

import type { FeedItem } from '../../supabase/functions/_shared/api/reads/news';

export interface NewsAction {
  readonly label: string;
  readonly screen: string;
  readonly params: Record<string, string>;
  /** Tab roots are replaced rather than pushed, per the navigation contract:
   *  a tab is where a stack rests, never a page on top of one. */
  readonly root: boolean;
}

/**
 * The one destination for a story, or null when there is none.
 *
 * Ordered most specific first. A played game is the best answer there is --
 * it opens the box score the story is about. A player is next. The club-level
 * destinations come last, because "your roster" is a much weaker answer than
 * "this game", and only apply to your own club.
 */
export function actionFor(item: FeedItem, userTeamId: string | null): NewsAction | null {
  const mine = userTeamId !== null && item.teamId === userTeamId;

  // The game, once there is a box score to show for it.
  if (item.gameId !== null && item.gamePlayed) {
    return { label: 'View Matchup', screen: 'game', params: { id: item.gameId }, root: false };
  }
  // A fixture that has not been played yet. The Game screen has nothing for
  // it, but the Play tab is built around exactly this week's matchup -- so
  // that is where the preview goes, and only when it is your own fixture.
  if (item.gameId !== null && mine) {
    return { label: 'Go to This Week', screen: 'play', params: {}, root: true };
  }
  // A named player, on any club: the player screen shows anyone in the league.
  if (item.playerId !== null) {
    return { label: 'View Player', screen: 'player', params: { id: item.playerId }, root: false };
  }
  // Club-level, and only for the club being managed. The roster screen reads
  // your own roster and the office your own front office; pointing another
  // club's story at either would open a screen with nothing to do with it.
  if (!mine) return null;
  if (item.category === 'CAMP') {
    return { label: 'View Roster', screen: 'roster', params: {}, root: false };
  }
  if (item.category === 'OWNER' || item.category === 'HOT_SEAT') {
    return { label: 'View Office', screen: 'office', params: {}, root: true };
  }
  if (item.category === 'FRANCHISE') {
    return { label: 'View Team', screen: 'team', params: {}, root: true };
  }
  // Everything else -- a league-wide upset with no game attached, a streak,
  // an award race -- has no screen about it. No button.
  return null;
}
