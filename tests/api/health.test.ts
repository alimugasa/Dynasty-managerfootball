// The pipe: client -> transport -> shared handler -> Postgres -> back.
//
// Against a real database, through the real shim. Needs DATABASE_URL pointing
// at a Postgres with every migration applied; when it is unset the suite is
// skipped with a message, and when it is set but wrong the suite FAILS -- a
// missing database is not the same thing as a passing test.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { ApiRequestError, createApi } from '../../src/data/client';
import { SAVE_SCHEMA_VERSION } from '../../supabase/functions/_shared/save/version';
import type { HealthOut } from '../../supabase/functions/_shared/api/health';

const DATABASE_URL = process.env['DATABASE_URL'];
const PORT = 8790;

describe.skipIf(DATABASE_URL === undefined)('the api pipe', () => {
  let shim: ChildProcess;

  beforeAll(async () => {
    shim = spawn('node', ['scripts/dev-api.ts'], {
      env: { ...process.env, DATABASE_URL: DATABASE_URL ?? '', DEV_API_PORT: String(PORT) },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { reject(new Error('dev-api did not start')); }, 15000);
      shim.stderr?.on('data', (chunk: Buffer) => {
        if (chunk.toString().includes('listening')) { clearTimeout(timer); resolve(); }
      });
      shim.on('exit', (code) => { clearTimeout(timer); reject(new Error(`dev-api exited ${String(code)}`)); });
    });
  });

  afterAll(() => { shim.kill('SIGTERM'); });

  it('reaches Postgres through the shim and reads the real schema version', async () => {
    const api = createApi({ apiUrl: `http://localhost:${String(PORT)}` });
    const out = await api.call<HealthOut>('health');
    expect(out.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(out.database).not.toBe('');
    expect(out.saves).toBeGreaterThanOrEqual(0);
  });

  it('names an unknown route rather than answering something plausible', async () => {
    const api = createApi({ apiUrl: `http://localhost:${String(PORT)}` });
    // Caught and inspected rather than matched: toMatchObject compares an
    // Error by message and would pass on the text alone, which is not the
    // contract -- the status and code are.
    let failure: unknown = null;
    try { await api.call('no-such-route'); } catch (e) { failure = e; }
    expect(failure).toBeInstanceOf(ApiRequestError);
    expect((failure as ApiRequestError).status).toBe(404);
    expect((failure as ApiRequestError).code).toBe('no_such_route');
  });
});

describe('the api pipe (no database configured)', () => {
  it.skipIf(DATABASE_URL !== undefined)('is skipped, and says so', () => {
    // A visible marker in the run, so nobody mistakes "skipped" for "passed".
    expect(DATABASE_URL).toBeUndefined();
  });
});
