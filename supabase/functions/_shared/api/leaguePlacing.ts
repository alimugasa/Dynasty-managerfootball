// Where a club sits, and the three ways of saying it.
//
// The league is 32 clubs in 2 conferences of 4 divisions of 4. That shape is
// the same on every screen; what changes is how much room there is to say it.
// So the shape is carried as structure -- a conference with a name, an
// abbreviation and a one-word short name, and a division with a region -- and
// the labels are built from those fields here, once.
//
// Built, never cut. The previous version stored divisions as "AC East" and
// recovered the region by slicing the conference id off the front of the name,
// which is why a screen that had only the ids could offer nothing better than
// "AC · AC-E". A label assembled from two columns cannot come apart that way,
// and adding a conference later cannot break the parsing, because there is
// none.
//
// The ids are not labels and must never be shown. 'NC' is the id of the
// Frontier Conference -- the ids predate the names (migration 0031) -- so a
// screen that printed a conference id would print the wrong letters.

/** A club's conference and division, as the reads hand it over. */
export interface Placing {
  readonly conferenceId: string;
  /** "Atlas Conference". */
  readonly conferenceName: string;
  /** "AC". */
  readonly conferenceAbbr: string;
  /** "Atlas". */
  readonly conferenceShort: string;
  readonly divisionId: string;
  /** "East", "North", "South" or "West". */
  readonly region: string;
  /** "Atlas Conference East". */
  readonly divisionName: string;
}

/**
 * The full division: "Atlas Conference East".
 *
 * For a screen with a line to spare -- the team preview, a standings heading.
 * Falls back to whichever half exists rather than printing a stray separator,
 * because a club whose division row is missing is a fault to show plainly, not
 * one to paper over with punctuation.
 */
export function divisionFull(p: Placing): string {
  if (p.divisionName !== '') return p.divisionName;
  return [p.conferenceName, p.region].filter((s) => s !== '').join(' ');
}

/**
 * The readable short form: "Atlas East".
 *
 * The default nearly everywhere. It is two words, it fits a phone row, and it
 * needs nothing else on screen to be understood -- which is what an
 * abbreviation cannot claim.
 */
export function divisionShort(p: Placing): string {
  return [p.conferenceShort, p.region].filter((s) => s !== '').join(' ');
}

/**
 * The compact form: "AC East".
 *
 * Only where the full conference name is already on screen, because two
 * letters on their own are a puzzle. Nothing in the product uses this without
 * the full name somewhere above it.
 */
export function divisionCompact(p: Placing): string {
  return [p.conferenceAbbr, p.region].filter((s) => s !== '').join(' ');
}

/** "Atlas Conference". */
export const conferenceFull = (p: Placing): string => p.conferenceName;

/**
 * The league's shape, stated once.
 *
 * Read by the screens that describe the competition to somebody who has not
 * played it yet. It is a claim about the data, so a test counts the rows
 * against it rather than trusting the sentence.
 */
export const LEAGUE_SHAPE = {
  teams: 32,
  conferences: 2,
  divisions: 8,
  divisionsPerConference: 4,
  teamsPerDivision: 4,
  regions: ['East', 'North', 'South', 'West'],
} as const;

/** "32 clubs · 2 conferences · 8 divisions" and the like, for a subtitle. */
export function leagueShapeLine(): string {
  const s = LEAGUE_SHAPE;
  return `${String(s.teams)} clubs · ${String(s.conferences)} conferences · `
    + `${String(s.divisions)} divisions of ${String(s.teamsPerDivision)}`;
}
