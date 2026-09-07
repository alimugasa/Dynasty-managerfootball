// The save store, in Postgres.
//
// Implements the store interface the save system defines, over the
// save_documents table, so a dynasty in the database goes through the one load
// path -- read, migrate, validate, deserialise -- that the memory store and the
// integration suite already exercise. The document is the engine's state; the
// relational tables are the projection the client reads.

import type { Db } from './db.ts';
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

/** The league and the ledger, through the migration chain. */
export async function loadEngineState(db: Db, saveId: string): Promise<EngineState> {
  const loaded = await load(new PostgresSaveStore(db), saveId);
  const ledger = await readLedger(db, saveId);
  return { ...loaded, ledger };
}
