// What the owner's mandate is called, and what it means.
//
// The server decides which mandate it is (teamOutlook.ts, ownerMandate); this
// is the copy. The split is the same one the settings catalogue keeps: keys
// and rules on the side that validates them, words on the side that renders
// them.
//
// Every line is written as something the owner said, in the present tense,
// because that is what it is -- an expectation handed over on day one. None of
// them is hedged, and none of them promises consequences, because there are
// none: nothing in the simulation reads the mandate back. The card says so
// itself rather than leaving a player to find out over four seasons.

import type { Mandate } from '../../supabase/functions/_shared/api/reads/teamOutlook';

export interface MandateCopy {
  readonly label: string;
  readonly detail: string;
}

const MANDATES: Readonly<Record<Mandate, MandateCopy>> = {
  CLEAR_CAP: {
    label: 'Clear cap space',
    detail: 'The books are over the ceiling. Get them under it before anything else '
      + 'is asked of this roster.',
  },
  WIN_DIVISION: {
    label: 'Win the division',
    detail: 'This roster is good enough now, and the owner is not in a mood to wait '
      + 'for it to be good enough later.',
  },
  MAKE_PLAYOFFS: {
    label: 'Make the playoffs',
    detail: 'January, in the first year. What happens once you are there is next '
      + "year's conversation.",
  },
  DEVELOP_QB: {
    label: 'Develop a young quarterback',
    detail: 'The job is unsettled. Find out what you have at it, and play the season '
      + 'like the answer matters more than the record.',
  },
  REBUILD: {
    label: 'Begin a rebuild',
    detail: 'Nobody is expecting a winning season. They are expecting the roster to '
      + 'look better in two years than it does now.',
  },
};

export const mandateCopy = (mandate: Mandate | null): MandateCopy | null =>
  (mandate === null ? null : MANDATES[mandate]);
