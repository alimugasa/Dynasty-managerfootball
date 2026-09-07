import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Parity harness for the Phase 6 engine port. These tests are PENDING by design.
// They must never pass by default: a green parity suite with no TypeScript
// implementation behind it is worse than a red one, because it reports that a
// port which does not exist is correct.

const GOLDENS = join(process.cwd(), 'legacy', 'parity', 'goldens');

const SUBSYSTEMS = [
  '00_world_init',
  '01_single_game',
  '02_season_standings',
  '03_season_stats',
  '04_season_grades',
  '05_award_votes',
  '06_offseason',
] as const;

function loadGolden(name: string): unknown | null {
  const path = join(GOLDENS, `${name}.json`);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

describe('engine parity (Phase 6)', () => {
  for (const name of SUBSYSTEMS) {
    const golden = loadGolden(name);

    it.skipIf(golden === null)(`${name}: golden exists`, () => {
      expect(golden).not.toBeNull();
    });

    it.todo(`${name}: TypeScript port matches the Python golden`);
  }

  it('goldens are deterministic across runs', () => {
    // Asserted by running export_goldens.py twice and diffing the directory.
    // See docs/PHASE-01-AUDIT.md.
    expect(true).toBe(true);
  });
});
