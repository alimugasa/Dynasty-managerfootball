// Renaming a save file, against Postgres.
//
// The name is the one thing about a dynasty the client may set, so the checks
// here are mostly about what it may NOT do: rename somebody else's save, empty
// a name, or quietly truncate one.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPipe, type Pipe } from './harness.ts';
import type { CreateSaveOut } from '../../supabase/functions/_shared/api/createSave';
import type { SlotsOut } from '../../supabase/functions/_shared/api/reads/slots';
import { MAX_SAVE_NAME } from '../../supabase/functions/_shared/api/renameSave';

const OWNER = '77777777-0000-0000-0000-0000000000aa';
const STRANGER = '77777777-0000-0000-0000-0000000000bb';

describe('renaming a save file', () => {
  let pipe: Pipe;
  let other: Pipe;
  let saveId = '';

  beforeAll(async () => {
    pipe = await openPipe(OWNER);
    other = await openPipe(STRANGER);
    const created = await pipe.api.call<CreateSaveOut>('create-save', {
      name: 'Casey Okonkwo', teamId: 'CLE', slot: 1,
      gmFirstName: 'Casey', gmLastName: 'Okonkwo',
    });
    saveId = created.saveId;
  }, 120_000);

  afterAll(async () => {
    await pipe.sql`delete from public.saves where id = ${saveId}`;
    await pipe.close();
    await other.close();
  });

  const fileOne = async (): Promise<SlotsOut['slots'][number] | undefined> => {
    const out = await pipe.api.call<SlotsOut>('slots', {});
    return out.slots.find((s) => s.slot === 1);
  };

  it('shows the name the save was created with', async () => {
    expect((await fileOne())?.name).toBe('Casey Okonkwo');
  });

  it('renames it, and the slot list says so', async () => {
    await pipe.api.call('rename-save', { saveId, name: 'The Rebuild' });
    expect((await fileOne())?.name).toBe('The Rebuild');
  });

  it('trims the name it stores', async () => {
    await pipe.api.call('rename-save', { saveId, name: '   Year One   ' });
    expect((await fileOne())?.name).toBe('Year One');
  });

  it('refuses a name of nothing but spaces rather than storing one', async () => {
    await expect(pipe.api.call('rename-save', { saveId, name: '   ' })).rejects.toThrow();
    expect((await fileOne())?.name).toBe('Year One');
  });

  it('refuses an over-long name rather than truncating it', async () => {
    // Silently cutting it would hand back a name the player did not type.
    const long = 'x'.repeat(MAX_SAVE_NAME + 1);
    await expect(pipe.api.call('rename-save', { saveId, name: long })).rejects.toThrow();
    expect((await fileOne())?.name).toBe('Year One');
  });

  it('will not let one player rename another player\'s save', async () => {
    await expect(
      other.api.call('rename-save', { saveId, name: 'Mine now' }),
    ).rejects.toThrow();
    expect((await fileOne())?.name).toBe('Year One');
  });
});
