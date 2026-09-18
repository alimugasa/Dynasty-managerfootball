// The career league, read from disk.
//
// A thin binding over careerWorld.ts, which holds the actual loader and takes
// its tables through an injected reader. The split exists because this file
// imports node:fs (via seedCsv) and the browser build cannot evaluate that --
// so the browser imports careerWorld directly and hands it bundled CSVs.

import { readSeedCsv } from '../lib/seedCsv.ts';
import { loadCareerWorld, type SeedReader } from '../../supabase/functions/_shared/engine/careerWorld.ts';
import type { League } from '../../supabase/functions/_shared/engine/offseason/index.ts';

export { FIRST_SEASON } from '../../supabase/functions/_shared/engine/careerWorld.ts';
export type { SeedReader };

export function loadCareerLeague(read: SeedReader = readSeedCsv): League {
  return loadCareerWorld(read);
}
