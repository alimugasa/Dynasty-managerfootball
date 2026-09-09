// The real pipe for the API suites: a database, the shim, a client.
//
// DATABASE_URL is required, not optional. A suite that skipped itself when the
// database was missing passed in CI for months while proving nothing; now it
// fails, and the failure names what to set.

import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import postgres from 'postgres';
import { createApi, type ApiClient } from '../../src/data/client';
import { parseDatabaseUrl } from '../../supabase/functions/_shared/api/db';

export const DEV_USER = '11111111-0000-0000-0000-00000000dead';
export const TEMPLATE = '00000000-0000-0000-0000-000000000000';

export function databaseUrl(): string {
  const url = process.env['DATABASE_URL'];
  if (url === undefined || url === '') {
    throw new Error(
      'DATABASE_URL is not set. The API suites run against a real database: '
      + 'DB=dmp_test scripts/db-fresh.sh, then export the DATABASE_URL it prints.');
  }
  return url;
}

export interface Pipe {
  readonly sql: ReturnType<typeof postgres>;
  readonly api: ApiClient;
  readonly shim: ChildProcess;
  /** The port this pipe's shim actually got. */
  readonly port: number;
  close(): Promise<void>;
}

/**
 * A port nothing is listening on, from the operating system.
 *
 * Suites used to name their own ports, which held until there were enough of
 * them running at once to collide -- with each other, and with a shim left
 * running by hand during development. Asking for one is not racy in any way
 * that matters here: the window between closing this listener and the shim
 * binding is microseconds, inside a test process on a machine doing nothing
 * else.
 */
async function freePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      probe.close(() => { if (port === 0) reject(new Error('no port')); else resolve(port); });
    });
  });
}

/** Starts the shim as `user`, on a port of its own, connected to DATABASE_URL. */
export async function openPipe(user: string = DEV_USER): Promise<Pipe> {
  const port = await freePort();
  const url = databaseUrl();
  const sql = postgres({ ...parseDatabaseUrl(url), max: 2 });
  await sql`insert into auth.users (id) values (${user}) on conflict (id) do nothing`;

  const shim = spawn('node', ['scripts/dev-api.ts'], {
    env: { ...process.env, DATABASE_URL: url, DEV_API_PORT: String(port), DEV_USER_ID: user },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { reject(new Error('dev-api did not start')); }, 15000);
    let text = '';
    shim.stderr?.on('data', (chunk: Buffer) => {
      text += chunk.toString();
      if (text.includes('listening')) { clearTimeout(timer); resolve(); }
    });
    shim.on('exit', (code) => {
      clearTimeout(timer); reject(new Error(`dev-api exited ${String(code)}: ${text}`));
    });
  });

  return {
    sql, shim, port,
    api: createApi({ apiUrl: `http://localhost:${String(port)}` }),
    close: async () => { shim.kill('SIGTERM'); await sql.end(); },
  };
}

export async function countRows(
  sql: Pipe['sql'], table: string, saveId: string, extra = '',
): Promise<number> {
  const [r] = await sql<{ n: string }[]>`
    select count(*) as n from public.${sql(table)} where save_id = ${saveId} ${sql.unsafe(extra)}`;
  return Number(r?.n ?? 0);
}
