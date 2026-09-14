// The stories the front office writes about itself.
//
// The engine's news module writes what the league did -- upsets, streaks,
// milestones, injuries, hot seats. It has nothing to say on the day a save is
// created, because nothing has happened yet, and a News tab that opens empty
// on a brand new franchise reads as broken rather than as new.
//
// So these five are written here instead: four when the dynasty is created and
// one after each week is played. They are not filler. Every sentence below is
// assembled from a row that exists -- the GM name the player typed, the club's
// own metro and nickname, the owner row, the week 1 fixture, the score that was
// just simulated, the table that was just recomputed. Nothing is invented, and
// a fact that is missing is said to be missing rather than guessed at
// (ARCHITECTURE.md rule 3): a save created without a GM name gets a story about
// a vacant office, and a league with no schedule yet gets a story that says the
// schedule is being prepared.
//
// Pure. Facts in, rows out, no database and no clock -- the gathering lives in
// franchiseNewsFacts.ts and the ids and timestamps are Postgres's to mint.

import type { Mandate } from './reads/teamOutlook.ts';

/** The five categories this module writes. Mirrors 0030's widened check. */
export const FRANCHISE_CATEGORIES = [
  'FRANCHISE', 'OWNER', 'CAMP', 'MATCHUP', 'RESULT',
] as const;

export type FranchiseCategory = (typeof FRANCHISE_CATEGORIES)[number];

/**
 * A row destined for `news`, with the category left as text.
 *
 * The engine's NewsItem narrows `category` to its own six. These five are not
 * among them and never will be -- the engine has no business writing a story
 * about the player's appointment -- so the insert takes the wider type and
 * every NewsItem is assignable to it.
 */
export interface NewsRow {
  readonly season: number;
  readonly week: number | null;
  readonly phase: string;
  readonly category: string;
  readonly headline: string;
  readonly body: string | null;
  readonly teamId: string | null;
  readonly playerId: string | null;
  readonly gameId: string | null;
  readonly importance: number;
}

/** A club as the feed names it. */
export interface ClubName {
  readonly teamId: string;
  readonly metro: string;
  readonly nickname: string;
}

const full = (c: ClubName): string => `${c.metro} ${c.nickname}`;

// ------------------------------------------------------------ opening day

export interface OpeningFacts {
  readonly season: number;
  readonly club: ClubName;
  /** What the player typed on the Create GM screen. Null when they skipped it,
   *  which is a state the save records and this story reports. */
  readonly gmName: string | null;
  /** From public.owners. Any of these may be absent on a world that shipped
   *  no owner row, and the story shrinks to what is there. */
  readonly ownerName: string | null;
  readonly ownerTenure: number | null;
  readonly mandate: Mandate | null;
  /** How many players the club is carrying into camp, and how many of them
   *  open the year unavailable. Both counted, neither estimated. */
  readonly rosterCount: number;
  readonly campInjuries: number;
  /** Week 1, if the schedule has been written. Null is the case the fourth
   *  story exists to report. */
  readonly opener: {
    readonly gameId: string;
    readonly opponent: ClubName;
    readonly home: boolean;
    readonly neutral: boolean;
  } | null;
}

/**
 * What the owner asked for, in the words a story would use.
 *
 * Written without a pronoun for the owner anywhere. The world stores an
 * owner's name, archetype, patience and tenure and nothing else -- it does not
 * store a gender -- so a story that said "he" would be inventing one, and
 * would be wrong about half the league by construction.
 */
const MANDATE_LINE: Readonly<Record<Mandate, string>> = {
  CLEAR_CAP: 'the books under the ceiling before anything else is asked of this roster',
  WIN_DIVISION: 'the division, this year, off a roster the owner already rates highly enough',
  MAKE_PLAYOFFS: 'the playoffs in year one, with what happens after that left for next year',
  DEVELOP_QB: 'a straight answer at quarterback, even if the record suffers for it',
  REBUILD: 'a roster that looks better in two years than it does today, and no pretence otherwise',
};

/**
 * The four stories a new franchise opens with.
 *
 * Ordered oldest to newest so that the feed, which reads newest first, puts
 * the week 1 matchup at the top and the appointment at the bottom -- the order
 * a manager would have lived them in.
 */
export function openingStories(f: OpeningFacts): readonly NewsRow[] {
  const club = f.club;
  const base = {
    season: f.season, week: 1, phase: 'REGULAR_SEASON',
    teamId: club.teamId, playerId: null, gameId: null,
  } as const;

  // 1 · The appointment. The one story that is about the player.
  const appointment: NewsRow = f.gmName === null
    ? {
      ...base, category: 'FRANCHISE', importance: 5,
      headline: `${full(club)} open the ${String(f.season)} season without a named GM`,
      body: `The ${club.nickname} front office is being run without a general manager's `
        + 'name on the door: this franchise was created without one. Everything else '
        + 'about the job is unchanged.',
    }
    : {
      ...base, category: 'FRANCHISE', importance: 5,
      headline: `${f.gmName} takes over the ${club.nickname}`,
      body: `${f.gmName} is the new general manager of the ${full(club)}, with `
        + `full control of the roster from today. The ${String(f.season)} season `
        + `opens in week 1.`
        + (f.ownerName === null
          ? ''
          : ` The appointment was made by ${f.ownerName}`
            + (f.ownerTenure === null || f.ownerTenure <= 0
              ? '.'
              : `, who has owned the club for ${String(f.ownerTenure)} `
                + `${f.ownerTenure === 1 ? 'year' : 'years'}.`)),
    };

  // 2 · What the owner wants. Derived from the owner row and the roster, the
  // same derivation the dashboard's Owner Goal card prints, so the story and
  // the card cannot disagree about what was asked for.
  const owner: NewsRow = f.mandate === null
    ? {
      ...base, category: 'OWNER', importance: 3,
      headline: `No first-season target has been set for the ${club.nickname}`,
      body: 'This club has no owner on record, so there is no stated expectation '
        + 'for the season. The front office is working without one.',
    }
    : {
      ...base, category: 'OWNER', importance: 4,
      headline: `${f.ownerName ?? 'The owner'} sets the bar for year one`,
      body: `${f.ownerName ?? 'The owner'} wants ${MANDATE_LINE[f.mandate]}. `
        + 'No consequence has been attached to it.',
    };

  // 3 · Camp. The calendar, plus the two numbers that describe the club
  // walking into it.
  const camp: NewsRow = {
    ...base, category: 'CAMP', importance: 2,
    headline: `Training camp opens in ${club.metro}`,
    body: `The ${club.nickname} are on the field. ${String(f.rosterCount)} players `
      + 'are in camp'
      + (f.campInjuries === 0
        ? ', all of them available.'
        : `, ${String(f.campInjuries)} of them carrying an injury into the season.`)
      + ' The depth chart is open until the week 1 kickoff.',
  };

  // 4 · The opener, or the honest absence of one.
  const opener: NewsRow = f.opener === null
    ? {
      ...base, category: 'MATCHUP', importance: 3,
      headline: 'The league schedule is being prepared',
      body: `No week 1 fixture has been written for the ${club.nickname} yet. `
        + 'The opponent, the venue and the kickoff will appear here once the '
        + 'league publishes the schedule.',
    }
    : {
      ...base, category: 'MATCHUP', importance: 4, gameId: f.opener.gameId,
      headline: f.opener.neutral
        ? `${club.nickname} open with the ${f.opener.opponent.nickname} at a neutral site`
        : f.opener.home
          ? `${club.nickname} open at home against the ${f.opener.opponent.nickname}`
          : `${club.nickname} open on the road at the ${f.opener.opponent.nickname}`,
      body: `Week 1 of the ${String(f.season)} season sends the ${club.nickname} `
        + (f.opener.neutral
          ? `against the ${full(f.opener.opponent)} at a neutral venue.`
          : f.opener.home
            ? `out in front of their own crowd against the ${full(f.opener.opponent)}.`
            : `to ${f.opener.opponent.metro} to face the ${f.opener.opponent.nickname}.`)
        + ' Set the depth chart before kickoff.',
    };

  return [appointment, owner, camp, opener];
}

// ------------------------------------------------------------ after a week

export interface ResultFacts {
  readonly season: number;
  readonly week: number;
  readonly phase: string;
  readonly club: ClubName;
  readonly opponent: ClubName;
  readonly gameId: string;
  readonly ourScore: number;
  readonly theirScore: number;
  readonly home: boolean;
  readonly overtime: boolean;
  /** The club's record after this game, from the table that was just
   *  recomputed rather than from a tally kept alongside it. */
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
}

/** A record the way a record is written, with the tie column dropped when it
 *  is empty because 9-4 and 9-4-0 are the same season. */
export function recordText(wins: number, losses: number, ties: number): string {
  const base = `${String(wins)}-${String(losses)}`;
  return ties === 0 ? base : `${base}-${String(ties)}`;
}

/**
 * The club's own game, once it has been played.
 *
 * One story per week about the team being managed. The engine writes about the
 * rest of the league; this is the one that is always about you, win or lose,
 * so the feed has a spine running down it rather than only the weeks something
 * remarkable happened.
 */
export function resultStory(f: ResultFacts): NewsRow {
  const margin = f.ourScore - f.theirScore;
  const score = `${String(f.ourScore)}-${String(f.theirScore)}`;
  const verb = margin > 0 ? 'beat' : margin < 0 ? 'fall to' : 'draw with';
  const headline = margin === 0
    ? `${f.club.nickname} and ${f.opponent.nickname} finish level ${score}`
    : `${f.club.nickname} ${verb} ${f.opponent.nickname} ${
      margin > 0 ? score : `${String(f.theirScore)}-${String(f.ourScore)}`}`;

  const where = f.home ? `at home in ${f.club.metro}` : `on the road in ${f.opponent.metro}`;
  const shape = margin === 0
    ? 'Neither side could separate it'
    : Math.abs(margin) >= 17
      ? (margin > 0 ? 'A comfortable afternoon' : 'It was over early')
      : Math.abs(margin) <= 3
        ? 'It came down to the last possession'
        : (margin > 0 ? 'They saw it out' : 'They could not close the gap');

  return {
    season: f.season,
    week: f.week,
    phase: f.phase,
    category: 'RESULT',
    // The postseason is the story of the week whatever else happened in it.
    importance: f.phase === 'PLAYOFFS' ? 5 : 4,
    headline,
    body: `${shape} ${where}${f.overtime ? ', and it took overtime' : ''}. The `
      + `${f.club.nickname} are ${recordText(f.wins, f.losses, f.ties)}.`,
    teamId: f.club.teamId,
    playerId: null,
    gameId: f.gameId,
  };
}
