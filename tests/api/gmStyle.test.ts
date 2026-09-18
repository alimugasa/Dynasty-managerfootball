// The GM style, against Postgres.
//
// The column exists so a question the screen asks has somewhere to be kept.
// What is worth pinning is the two ways it can go wrong: a style the server
// has never heard of must be refused rather than stored or dropped, and a save
// created without one must come back as "none recorded" rather than as the
// default the picker happens to open on.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPipe, type Pipe } from './harness.ts';
import { GM_STYLES } from '../../supabase/functions/_shared/api/gmStyles.ts';
import type { CreateSaveOut } from '../../supabase/functions/_shared/api/createSave';
import type { SaveOut } from '../../supabase/functions/_shared/api/reads/save';

const OWNER = '77777777-0000-0000-0000-0000000000cc';

describe('the style a general manager is created with', () => {
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

  // Seven dynasties, each cascading its own copy of the world. The default
  // hook timeout is a tenth of what that takes.
  afterAll(async () => {
    for (const id of created) await pipe.sql`delete from public.saves where id = ${id}`;
    await pipe.close();
  }, 300_000);

  const make = async (slot: number, extra: Record<string, unknown>): Promise<string> => {
    const out = await pipe.api.call<CreateSaveOut>('create-save', {
      name: 'Casey Okonkwo', teamId: 'CLE', slot,
      gmFirstName: 'Casey', gmLastName: 'Okonkwo', ...extra,
    });
    created.push(out.saveId);
    return out.saveId;
  };

  const styleOf = async (saveId: string): Promise<string | null> => {
    const out = await pipe.api.call<SaveOut>('save', { saveId });
    return out.save?.gmStyle ?? null;
  };

  it('keeps the style the franchise was created with', async () => {
    const saveId = await make(1, { gmStyle: 'NEGOTIATOR' });
    expect(await styleOf(saveId)).toBe('NEGOTIATOR');
  }, 120_000);

  it('reports no style rather than the default when none was given', async () => {
    // The picker opens on Architect. That is where a control starts, not an
    // answer a save may claim its creator gave.
    const saveId = await make(2, {});
    expect(await styleOf(saveId)).toBeNull();
  }, 120_000);

  it('refuses a style it does not know instead of storing null', async () => {
    await expect(make(3, { gmStyle: 'CHEQUEBOOK' })).rejects.toThrow(/CHEQUEBOOK/);
  }, 120_000);

  it('accepts every style the catalogue offers', async () => {
    // One key list in the module, one CHECK constraint in the migration. A key
    // added to the module and forgotten in the migration fails here, rather
    // than on the first player who picks it and gets a 500 for an answer.
    for (const [i, style] of GM_STYLES.entries()) {
      const saveId = await make(4 + i, { gmStyle: style });
      expect(await styleOf(saveId), style).toBe(style);
    }
  }, 300_000);
});
