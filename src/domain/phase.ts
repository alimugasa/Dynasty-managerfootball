// Where a save is in its year, as the client understands it.
//
// The server's list is the authority (supabase/functions/_shared/api/phases.ts)
// and the client cannot import it: that module reaches Postgres, and pulling it
// into the bundle would pull the database driver with it. So this is a second
// copy, and tests/phase.test.ts holds the two equal -- which is the point of
// having it in one place rather than inline in whichever screen needed it.
//
// A screen that hardcoded its own list is how AWARDS and RECAP came to be
// missing from the Team screen: the two phases were added to the season, the
// server learned about them, and a literal array in a component did not. A
// save reopened in either then offered "Sim week 23" on a season that was over.

/** The phases that are not football being played. */
export const OFFSEASON_PHASES: readonly string[] = [
  'OFFSEASON', 'AWARDS', 'RECAP', 'RETIREMENTS', 'DRAFT', 'FREE_AGENCY', 'CAMP',
];

export const isOffseasonPhase = (phase: string): boolean => OFFSEASON_PHASES.includes(phase);

/**
 * Every phase a save can sit in, named for a reader.
 *
 * Deliberately not the server's labels. The server names the *step* a manager
 * is about to take ("Season over", "The year in review"); this names *where the
 * save is* for a list of save files, which is a different sentence. Both are
 * right where they are used, so the two are not paired by a test -- only the
 * phases themselves are.
 */
export const PHASE_LABEL: Readonly<Record<string, string>> = {
  PRESEASON: 'Preseason',
  REGULAR_SEASON: 'Regular season',
  PLAYOFFS: 'Playoffs',
  OFFSEASON: 'Offseason',
  AWARDS: 'Awards',
  RECAP: 'Year in review',
  RETIREMENTS: 'Retirements',
  COACHING: 'Coaching',
  DRAFT: 'Draft',
  FREE_AGENCY: 'Free agency',
  CAMP: 'Training camp',
};
