// The pipe: client -> transport -> shared handler -> Postgres -> back.
//
// Against a real database, through the real shim. Needs DATABASE_URL pointing
// at a Postgres with every migration applied; without it the suite FAILS and
// says what to set -- a missing database is not the same thing as a passing
// test, and a skipped suite reads as green.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiRequestError } from '../../src/data/client';
import { SAVE_SCHEMA_VERSION } from '../../supabase/functions/_shared/save/version';
import type { HealthOut } from '../../supabase/functions/_shared/api/health';
import { openPipe, type Pipe } from './harness.ts';

const PORT = 8790;

describe('the api pipe', () => {
  let pipe: Pipe;

  beforeAll(async () => { pipe = await openPipe(PORT); });
  afterAll(async () => { await pipe.close(); });

  it('reaches Postgres through the shim and reads the real schema version', async () => {
    const out = await pipe.api.call<HealthOut>('health');
    expect(out.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(out.database).not.toBe('');
    expect(out.saves).toBeGreaterThanOrEqual(0);
  });

  it('names an unknown route rather than answering something plausible', async () => {
    const api = pipe.api;
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
