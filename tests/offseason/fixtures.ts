// Shared builders for the offseason tests. Not a test file: importing a helper
// from a .test.ts makes that file's tests run again inside every importer.

import type { CareerPlayer } from '../../supabase/functions/_shared/engine/offseason/index.ts';

export function player(overrides: Partial<CareerPlayer> = {}): CareerPlayer {
  return {
    id: 'P1', name: 'Test Player', group: 'WR', teamId: 'AAA',
    ability: 70, potential: 85, mental: 0, reputation: 70,
    age: 23, experience: 2,
    devRate: 1, workEthic: 70, durability: 75, footballIq: 70,
    gamesMissedCareer: 0, gamesMissedSeason: 0,
    accolades: { allLeague: 0, awards: 0, rings: 0 },
    retired: false, retiredInSeason: null,
    ...overrides,
  };
}

export function mean(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}
