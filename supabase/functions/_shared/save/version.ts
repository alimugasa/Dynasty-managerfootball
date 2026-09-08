// The save format's version, and what each version changed.
//
// A dynasty is meant to be played for real-world years. The schema will change
// underneath saves that already exist, so the format carries its version and
// the loader upgrades forward. There is no downgrade path and there will not be
// one: an old build opening a newer save must refuse, because the alternative
// is silently discarding whatever the newer version added.
//
// Adding a version means three things, all of them required:
//   1. bump SAVE_SCHEMA_VERSION,
//   2. add the VERSION_LOG entry saying what changed and why,
//   3. add the migration step in migrations.ts.
// A test asserts that all three agree, so a bump without a step fails the build
// rather than failing on a player's save file.

export const SAVE_SCHEMA_VERSION = 4;

/** The oldest version the loader can still upgrade. Raising this abandons
 *  saves, so it moves only when a step becomes impossible to write. */
export const MIN_SUPPORTED_VERSION = 1;

export interface VersionNote {
  readonly version: number;
  readonly summary: string;
}

export const VERSION_LOG: readonly VersionNote[] = [
  { version: 1, summary: 'Initial format: league, players, contracts, fronts, pipeline.' },
  {
    version: 2,
    summary: 'Dead money moved from a per-club number to a per-club record keyed '
      + 'by season incurred, so a save reloaded mid-offseason no longer forgets '
      + 'which year a charge belongs to.',
  },
  {
    version: 3,
    summary: 'Added previousTeamId to players. Free-agency loyalty reads it, and '
      + 'a v2 save loaded without it made every player a first-time free agent.',
  },
  {
    version: 4,
    summary: 'Added coaches: the staffs that call the plays and develop the '
      + 'players. A v3 save has none, and the step adds an empty list rather '
      + 'than inventing a staff; the server rehydrates it from the save\'s own '
      + 'coach rows on the next load.',
  },
];

export class SaveVersionError extends Error {
  readonly found: number;
  readonly supported: number;

  constructor(message: string, found: number, supported: number) {
    super(message);
    this.name = 'SaveVersionError';
    this.found = found;
    this.supported = supported;
  }
}

/** Refuses a save this build cannot read, in either direction. */
export function assertLoadable(version: number): void {
  if (!Number.isInteger(version)) {
    throw new SaveVersionError(
      `Save version is not a number: ${String(version)}`, version, SAVE_SCHEMA_VERSION);
  }
  if (version > SAVE_SCHEMA_VERSION) {
    throw new SaveVersionError(
      `Save was written by a newer build (format ${String(version)}, this build reads `
      + `${String(SAVE_SCHEMA_VERSION)}). Update the app rather than opening it here: `
      + 'loading it would silently drop whatever the newer format added.',
      version, SAVE_SCHEMA_VERSION);
  }
  if (version < MIN_SUPPORTED_VERSION) {
    throw new SaveVersionError(
      `Save format ${String(version)} is older than this build can upgrade `
      + `(minimum ${String(MIN_SUPPORTED_VERSION)}).`,
      version, SAVE_SCHEMA_VERSION);
  }
}
