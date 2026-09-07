// The first handler: proves the pipe from transport to Postgres and back.
//
// Deliberately trivial and deliberately real. It reads the save-schema version
// from the function migration 0013 installed, so a transport that reaches this
// handler against a database missing that migration fails loudly here rather
// than three handlers later.

import type { Handler } from './context.ts';

export interface HealthOut {
  readonly database: string;
  readonly saveSchemaVersion: number;
  readonly saves: number;
}

export const health: Handler<Record<string, never>, HealthOut> = {
  auth: 'none',
  parse: () => ({}),
  run: async ({ sql }) => {
    const [row] = await sql<{ database: string; version: number; saves: string }[]>`
      select current_database() as database,
             public.current_save_schema_version() as version,
             (select count(*) from public.saves) as saves`;
    if (row === undefined) throw new Error('health query returned no row');
    return {
      database: row.database,
      saveSchemaVersion: row.version,
      saves: Number(row.saves),
    };
  },
};
