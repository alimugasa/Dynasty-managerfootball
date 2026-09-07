// Where a save lives.
//
// The interface is deliberately small and storage-agnostic: Postgres in the
// real system, memory in tests, a file for an export. What matters is that
// every one of them goes through the same load path -- read bytes, migrate,
// validate, deserialise -- so a bug in migration cannot be hidden by a store
// that happens to hold objects rather than data.
//
// The in-memory store below is not a stub for the real thing. It exists so the
// season loop and the integrity checks can be tested without a database, and
// it round-trips through JSON for exactly that reason: a store that handed back
// the same object it was given would pass tests that a real store fails.

import { deserialize, type LoadedSave } from './deserialize.ts';
import { migrate, type MigrationReport } from './migrations.ts';
import type { SaveDocument, UnknownDocument } from './types.ts';

export interface SaveStore {
  write(saveId: string, document: SaveDocument): Promise<void>;
  read(saveId: string): Promise<UnknownDocument | null>;
  list(): Promise<readonly string[]>;
  delete(saveId: string): Promise<void>;
}

export class SaveNotFound extends Error {
  readonly saveId: string;

  constructor(saveId: string) {
    super(`No save with id "${saveId}"`);
    this.name = 'SaveNotFound';
    this.saveId = saveId;
  }
}

export interface LoadResult extends LoadedSave {
  readonly migration: MigrationReport;
}

/**
 * The one load path.
 *
 * Migration happens before validation, never after: a version-1 document
 * validated against version-3 rules fails for the wrong reason and tells the
 * player their save is corrupt when it is merely old.
 */
export async function load(store: SaveStore, saveId: string): Promise<LoadResult> {
  const raw = await store.read(saveId);
  if (raw === null) throw new SaveNotFound(saveId);
  const { document, report } = migrate(raw);
  return { ...deserialize(document), migration: report };
}

export async function save(
  store: SaveStore, saveId: string, document: SaveDocument,
): Promise<void> {
  await store.write(saveId, document);
}

/** Memory-backed, round-tripping through JSON. */
export class MemorySaveStore implements SaveStore {
  private readonly saves = new Map<string, string>();

  write(saveId: string, document: SaveDocument): Promise<void> {
    // Serialising here is the point: it is what catches a document holding a
    // Map, a Date, an undefined or a circular reference -- none of which
    // survive a real store, and all of which a Map<string, object> would.
    this.saves.set(saveId, JSON.stringify(document));
    return Promise.resolve();
  }

  read(saveId: string): Promise<UnknownDocument | null> {
    const text = this.saves.get(saveId);
    if (text === undefined) return Promise.resolve(null);
    return Promise.resolve(JSON.parse(text) as UnknownDocument);
  }

  list(): Promise<readonly string[]> {
    return Promise.resolve([...this.saves.keys()]);
  }

  delete(saveId: string): Promise<void> {
    this.saves.delete(saveId);
    return Promise.resolve();
  }

  /** Bytes on the wire, for a size check. Not part of the interface. */
  sizeOf(saveId: string): number {
    return this.saves.get(saveId)?.length ?? 0;
  }
}
