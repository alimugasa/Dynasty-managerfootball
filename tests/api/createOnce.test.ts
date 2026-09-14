// Creating a franchise exactly once, and failing without a trace.
//
// The confirmation screen promises two things a screen cannot guarantee on its
// own: that a franchise is written once however the button is pressed, and that
// a failure leaves the save file empty rather than half full. Both are the
// server's to keep -- the unique index on (user_id, slot) and the single
// transaction create-save runs in -- so both are tested here against Postgres
// rather than asserted in a component.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPipe, type Pipe } from './harness.ts';
import { PRESETS } from '../../supabase/functions/_shared/api/franchiseOptions.ts';
import { MAX_SAVE_NAME } from '../../supabase/functions/_shared/api/renameSave.ts';
import type { CreateSaveOut } from '../../supabase/functions/_shared/api/createSave';

const OWNER = '77777777-0000-0000-0000-00000000aa01';

describe('creating a franchise once', () => {
  let pipe: Pipe;
  const created: string[] = [];

  beforeAll(async () => {
    pipe = await openPipe(OWNER);
    await pipe.sql`delete from public.saves where user_id = ${OWNER} and not is_template`;
  }, 300_000);

  afterAll(async () => {
    for (const id of created) await pipe.sql`delete from public.saves where id = ${id}`;
    await pipe.close();
  }, 300_000);

  const rowsIn = async (slot: number): Promise<number> => {
    const [row] = await pipe.sql<{ n: string }[]>`
      select count(*)::text as n from public.saves
       where user_id = ${OWNER} and not is_template and slot = ${slot}`;
    return Number(row?.n ?? 0);
  };

  const create = async (slot: number, extra: Record<string, unknown> = {}) => {
    const out = await pipe.api.call<CreateSaveOut>('create-save', {
      name: 'Cleveland Ironmen Franchise', teamId: 'CLE', slot,
      gmFirstName: 'Durk', gmLastName: 'Banks', settings: PRESETS.NORMAL, ...extra,
    });
    created.push(out.saveId);
    return out;
  };

  it('writes the save file the screen named', async () => {
    const out = await create(1);
    const [row] = await pipe.sql<{ name: string }[]>`
      select name from public.saves where id = ${out.saveId}`;
    expect(row?.name).toBe('Cleveland Ironmen Franchise');
  }, 120_000);

  it('refuses a second franchise in a file that already has one', async () => {
    // What a double tap would ask for. The screen guards it with a ref so a
    // player never sees this, but the file is the server's to protect.
    await expect(create(1)).rejects.toThrow(/already in use/);
    expect(await rowsIn(1)).toBe(1);
  }, 120_000);

  it('leaves nothing behind when the world cannot be cloned', async () => {
    // An unknown club fails inside the transaction, after the slot has been
    // checked and while the clone is under way. Either the whole franchise
    // landed or none of it did.
    await expect(create(2, { teamId: 'NOPE' })).rejects.toThrow();
    expect(await rowsIn(2)).toBe(0);
  }, 120_000);

  it('leaves nothing behind when the rules are refused', async () => {
    await expect(create(2, { settings: { ...PRESETS.NORMAL, injuryFrequency: 'BRUTAL' } }))
      .rejects.toThrow(/BRUTAL/);
    expect(await rowsIn(2)).toBe(0);
  }, 120_000);

  it('refuses a name longer than a save file may carry', async () => {
    // The same ceiling rename-save enforces, so the screen that sets a name and
    // the screen that changes it later agree about what fits.
    await expect(create(2, { name: 'x'.repeat(MAX_SAVE_NAME + 1) }))
      .rejects.toThrow(/at most/i);
    expect(await rowsIn(2)).toBe(0);
  }, 120_000);

  it('still creates in that file once the request is good', async () => {
    // Three refusals did not poison it: the file was empty the whole time.
    const out = await create(2);
    expect(out.slot).toBe(2);
    expect(await rowsIn(2)).toBe(1);
  }, 120_000);
});
