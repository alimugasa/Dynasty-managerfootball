// The seed CSVs, bundled for the browser.
//
// Same six tables the report harnesses read from disk, and the same parser --
// they are imported as raw strings so the loader in scripts/drift-report can run
// unchanged in the browser. A second loader would be a second set of rules about
// what the starting world is.

import teams from '../../legacy/seed/teams.csv?raw';
import players from '../../legacy/seed/players.csv?raw';
import playerAttributes from '../../legacy/seed/player_attributes.csv?raw';
import owners from '../../legacy/seed/owners.csv?raw';
import coaches from '../../legacy/seed/coaches.csv?raw';
import coachAttributes from '../../legacy/seed/coach_attributes.csv?raw';
import { parseCsv } from '../../scripts/lib/csv';

const TABLES: Readonly<Record<string, string>> = {
  teams,
  players,
  player_attributes: playerAttributes,
  owners,
  coaches,
  coach_attributes: coachAttributes,
};

/** Parsed once. Three of these tables are hundreds of kilobytes and the loader
 *  is called on every new dynasty. */
const cache = new Map<string, Record<string, string>[]>();

export function readBundledSeed(name: string): Record<string, string>[] {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;
  const text = TABLES[name];
  if (text === undefined) {
    // Rule 3: a missing table is reported, not silently an empty league.
    throw new Error(
      `Seed table "${name}" is not bundled. Add it to src/game/seed.ts.`);
  }
  const parsed = parseCsv(text);
  cache.set(name, parsed);
  return parsed;
}
