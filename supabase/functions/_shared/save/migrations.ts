// Forward migrations.
//
// One step per version, each taking a document at version N and returning one
// at N + 1. The chain runs in order, so a version-1 save opened by a build at
// version 3 passes through both steps -- which is what makes it possible to
// change the format without keeping a reader for every historical shape.
//
// Three rules these steps live by, learned from every save system that has had
// to do this:
//
//   A step never reads the current types. It works on UnknownDocument, because
//   the types describe today's shape and a step that imported them would break
//   the moment the shape changed again -- silently, by compiling against the
//   wrong thing.
//
//   A step never invents data it cannot derive. Where an added field has no
//   answer in the old document, the honest value is the one that makes the old
//   behaviour continue, and the step says so.
//
//   A step is pure and total. No clock, no RNG, no I/O. Migrating the same
//   document twice gives the same result, which is what makes it safe to retry
//   a failed load.

import { SAVE_SCHEMA_VERSION, assertLoadable } from './version.ts';
import type { SaveDocument, UnknownDocument } from './types.ts';

export interface MigrationStep {
  /** Version this step reads. It produces `from + 1`. */
  readonly from: number;
  readonly summary: string;
  readonly run: (document: UnknownDocument) => UnknownDocument;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  (typeof value === 'object' && value !== null ? value as Record<string, unknown> : {});

export const MIGRATIONS: readonly MigrationStep[] = [
  {
    from: 1,
    summary: 'deadMoney: number per club -> amount keyed by the season incurred.',
    run: (document) => {
      // v1 held `deadMoney: { BUF: 12000000 }` with no season. The charge can
      // only have been incurred in the save's current season -- that is the
      // only year v1 ever wrote -- so it is filed there. This is a derivation,
      // not a guess: v1 cleared the map at the start of every offseason.
      const season = String(asRecord(document['meta'])['season'] ?? '');
      const old = asRecord(document['deadMoney']);
      const migrated: Record<string, Record<string, number>> = {};
      for (const [teamId, amount] of Object.entries(old)) {
        if (typeof amount !== 'number' || amount === 0) continue;
        migrated[teamId] = { [season]: amount };
      }
      return { ...document, deadMoney: migrated, version: 2 };
    },
  },
  {
    from: 2,
    summary: 'players: add previousTeamId, defaulting to the current club.',
    run: (document) => {
      // A v2 save does not record where a player was before. The current club
      // is the correct answer for everyone under contract, and null is correct
      // for a free agent, because v2's free agency had no loyalty term: reading
      // the previous club as "none" reproduces exactly the behaviour the save
      // was played under. Inventing a plausible former club would change the
      // outcome of the next free agency the player opened the save to run.
      const players = Array.isArray(document['players']) ? document['players'] : [];
      return {
        ...document,
        players: players.map((raw) => {
          const p = asRecord(raw);
          return { ...p, previousTeamId: p['previousTeamId'] ?? p['teamId'] ?? null };
        }),
        version: 3,
      };
    },
  },
  {
    from: 3,
    summary: 'coaches: added, empty. A v3 save has no staffs to carry forward.',
    run: (document) => {
      // There is nothing in a v3 document to derive a staff from: it holds
      // players and clubs, and a coach is neither. An empty list is the honest
      // value -- the engine reads league-average coaching for a club with no
      // staff, which is exactly the behaviour the save was played under -- and
      // it is what the server sees when it rehydrates the staffs from the
      // save's own coach rows, which this step cannot reach.
      return { ...document, coaches: [], version: 4 };
    },
  },
];

export class MigrationError extends Error {
  readonly from: number;

  constructor(from: number, detail: string) {
    super(`Migrating save from format ${String(from)} failed: ${detail}`);
    this.name = 'MigrationError';
    this.from = from;
  }
}

export function versionOf(document: UnknownDocument): number {
  const version = document.version;
  if (typeof version !== 'number') {
    // A document with no version is not a version-1 document: it is a file this
    // system did not write, and guessing would run migration steps over
    // arbitrary data.
    throw new MigrationError(0, 'document carries no version field');
  }
  return version;
}

export interface MigrationReport {
  readonly from: number;
  readonly to: number;
  readonly applied: readonly string[];
}

/**
 * Runs the chain, and proves it arrived.
 *
 * The final version check is not paranoia about the loop: it is what catches a
 * step that forgot to set `version` on its output, which otherwise loops
 * forever or -- worse -- returns a half-migrated document that deserialises
 * without complaint.
 */
export function migrate(
  document: UnknownDocument,
): { document: SaveDocument; report: MigrationReport } {
  const from = versionOf(document);
  assertLoadable(from);

  let current = document;
  const applied: string[] = [];

  for (let guard = 0; guard <= MIGRATIONS.length; guard += 1) {
    const version = versionOf(current);
    if (version >= SAVE_SCHEMA_VERSION) break;

    const step = MIGRATIONS.find((m) => m.from === version);
    if (step === undefined) {
      throw new MigrationError(version, `no step upgrades format ${String(version)}`);
    }

    const next = step.run(current);
    const reached = versionOf(next);
    if (reached !== version + 1) {
      throw new MigrationError(version,
        `step produced format ${String(reached)}, expected ${String(version + 1)}`);
    }
    current = next;
    applied.push(step.summary);
  }

  const final = versionOf(current);
  if (final !== SAVE_SCHEMA_VERSION) {
    throw new MigrationError(from,
      `chain ended at format ${String(final)}, expected ${String(SAVE_SCHEMA_VERSION)}`);
  }

  return {
    document: current as unknown as SaveDocument,
    report: { from, to: final, applied },
  };
}
