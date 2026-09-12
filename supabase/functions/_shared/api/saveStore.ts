// The save store, in Postgres.
//
// Implements the store interface the save system defines, over the
// save_documents table, so a dynasty in the database goes through the one load
// path -- read, migrate, validate, deserialise -- that the memory store and the
// integration suite already exercise. The document is the engine's state; the
// relational tables are the projection the client reads.

import type { Db } from './db.ts';
import { loadCoaches } from '../engine/careerWorld.ts';
import {
  load, type LoadResult, type SaveDocument, type SaveStore, type UnknownDocument,
} from '../save/index.ts';
import {
  createLedger, ledgerFromJson, ledgerToJson, type LedgerJson, type NewsLedger,
} from '../engine/news/index.ts';

export class PostgresSaveStore implements SaveStore {
  private readonly db: Db;

  // A plain field rather than a parameter property: node runs these files with
  // type stripping only, which does not rewrite constructor parameters.
  constructor(db: Db) { this.db = db; }

  async write(saveId: string, document: SaveDocument): Promise<void> {
    // The ledger column is not nullable and a first write has no ledger yet:
    // a fresh season's, which is what a brand-new save is at.
    const fresh = JSON.stringify(ledgerToJson(createLedger(document.meta.season)));
    // ::text::jsonb, not ::jsonb. The driver JSON-encodes a string parameter
    // bound straight to jsonb, which stores the document as one long string;
    // the text hop makes Postgres parse it.
    await this.db`
      insert into public.save_documents (save_id, document, ledger)
      values (${saveId}, ${JSON.stringify(document)}::text::jsonb, ${fresh}::text::jsonb)
      on conflict (save_id) do update set document = excluded.document`;
  }

  async read(saveId: string): Promise<UnknownDocument | null> {
    const [row] = await this.db<{ document: UnknownDocument }[]>`
      select document from public.save_documents where save_id = ${saveId}`;
    return row === undefined ? null : row.document;
  }

  async list(): Promise<readonly string[]> {
    const rows = await this.db<{ save_id: string }[]>`
      select save_id from public.save_documents order by save_id`;
    return rows.map((r) => r.save_id);
  }

  async delete(saveId: string): Promise<void> {
    await this.db`delete from public.save_documents where save_id = ${saveId}`;
  }
}

export async function readLedger(db: Db, saveId: string): Promise<NewsLedger> {
  const [row] = await db<{ ledger: LedgerJson }[]>`
    select ledger from public.save_documents where save_id = ${saveId}`;
  if (row === undefined) throw new Error(`Save ${saveId} has no engine state on record`);
  return ledgerFromJson(row.ledger);
}

export async function writeLedger(db: Db, saveId: string, ledger: NewsLedger): Promise<void> {
  await db`
    update public.save_documents
       set ledger = ${JSON.stringify(ledgerToJson(ledger))}::text::jsonb
     where save_id = ${saveId}`;
}

export interface EngineState extends LoadResult {
  readonly ledger: NewsLedger;
}

/**
 * The staffs a save written before format 4 has no record of.
 *
 * The migration step cannot reach them: it sees the document alone. They are
 * not invented here either -- they are read from this save's own coach rows,
 * cloned from the template when the dynasty was created, which is exactly
 * where a save created today gets them. A save whose rows are gone gets no
 * staff and league-average coaching, and says so by holding none.
 */
async function rehydrateCoaches(db: Db, saveId: string, league: LoadResult['league']): Promise<void> {
  if (league.coaches.length > 0) return;
  const read = async (table: string, key: string): Promise<Record<string, string>[]> => {
    const rows = await db<Record<string, unknown>[]>`
      select * from public.${db(table)} where save_id = ${saveId} order by ${db(key)}`;
    return rows.map((row) => Object.fromEntries(
      Object.entries(row).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)])));
  };
  league.coaches = loadCoaches(
    await read('coaches', 'coach_id'),
    await read('coach_attributes', 'coach_id'),
    await read('team_coaching_staff', 'coach_id'),
    new Set(league.teamIds));
}

/** The league and the ledger, through the migration chain. */
export async function loadEngineState(db: Db, saveId: string): Promise<EngineState> {
  const loaded = await load(new PostgresSaveStore(db), saveId);
  await rehydrateCoaches(db, saveId, loaded.league);
  const ledger = await readLedger(db, saveId);
  return { ...loaded, ledger };
}
