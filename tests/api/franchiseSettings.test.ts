// The rules a franchise is played under, against Postgres.
//
// The settings are the first document this client sends, so the checks are
// mostly about what the server refuses: a partial one, an unknown value and an
// unknown key each mean the catalogues have drifted, and any of them stored
// quietly is a save that looks fine until a setting turns out to be gone.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPipe, type Pipe } from './harness.ts';
import { PRESETS } from '../../supabase/functions/_shared/api/franchiseOptions.ts';
import type { CreateSaveOut } from '../../supabase/functions/_shared/api/createSave';
import type { SaveOut } from '../../supabase/functions/_shared/api/reads/save';

const OWNER = '77777777-0000-0000-0000-0000000000ff';

describe('the rules a franchise is created under', () => {
  let pipe: Pipe;
  const created: string[] = [];

  beforeAll(async () => {
    pipe = await openPipe(OWNER);
    // This user's slots, from a run that was interrupted before its cleanup
    // ran. A test that can only pass on a pristine database fails for the
    // wrong reason the next time somebody's laptop sleeps mid-suite.
    await pipe.sql`delete from public.saves
                    where user_id = ${OWNER} and not is_template`;
  }, 300_000);

  // Each dynasty cascades its own copy of the world; the default hook timeout
  // is a fraction of what that takes.
  afterAll(async () => {
    for (const id of created) await pipe.sql`delete from public.saves where id = ${id}`;
    await pipe.close();
  }, 300_000);

  const make = async (slot: number, extra: Record<string, unknown>): Promise<string> => {
    const out = await pipe.api.call<CreateSaveOut>('create-save', {
      name: 'Durk Banks', teamId: 'CLE', slot,
      gmFirstName: 'Durk', gmLastName: 'Banks', ...extra,
    });
    created.push(out.saveId);
    return out.saveId;
  };

  const settingsOf = async (saveId: string): Promise<SaveOut['save']> =>
    (await pipe.api.call<SaveOut>('save', { saveId })).save;

  it('keeps every rule the franchise was created under', async () => {
    const saveId = await make(1, { settings: PRESETS.HARD });
    const save = await settingsOf(saveId);
    expect(save?.settings).toEqual(PRESETS.HARD);
  }, 120_000);

  it('reports no rules rather than the Normal preset when none were given', async () => {
    // The screen opens on Normal. That is where a control starts, not an
    // answer a save whose creator was never asked may claim to have given.
    const saveId = await make(2, {});
    expect((await settingsOf(saveId))?.settings).toBeNull();
  }, 120_000);

  it('refuses a document missing a rule instead of filling it in', async () => {
    const partial: Record<string, string> = { ...PRESETS.NORMAL };
    delete partial['salaryCap'];
    await expect(make(3, { settings: partial })).rejects.toThrow(/salaryCap/);
  }, 120_000);

  it('refuses a value it does not know', async () => {
    await expect(make(3, { settings: { ...PRESETS.NORMAL, injuryFrequency: 'BRUTAL' } }))
      .rejects.toThrow(/BRUTAL/);
  }, 120_000);

  it('refuses an unknown rule rather than dropping it', async () => {
    await expect(make(3, { settings: { ...PRESETS.NORMAL, weatherSeverity: 'HIGH' } }))
      .rejects.toThrow(/weatherSeverity/);
  }, 120_000);

  it('stores a custom set exactly as it was chosen', async () => {
    // Including the editing tools, which no preset turns on.
    const custom = {
      ...PRESETS.NORMAL,
      injuryFrequency: 'LOW' as const,
      salaryCap: 'OFF' as const,
      scoutingVisibility: 'HIDDEN' as const,
      commissionerMode: 'ON' as const,
    };
    const saveId = await make(3, { settings: custom });
    expect((await settingsOf(saveId))?.settings).toEqual(custom);
  }, 120_000);
});
