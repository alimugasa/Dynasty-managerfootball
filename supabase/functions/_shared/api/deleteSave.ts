// delete-save: the whole dynasty, gone. Every table cascades from saves.

import type { Handler } from './context.ts';
import { ownedSave } from './save.ts';
import { rawOf, requireString } from './parse.ts';

export interface DeleteSaveIn { readonly saveId: string }

export const deleteSave: Handler<DeleteSaveIn, { readonly ok: true }> = {
  auth: 'required',
  parse: (raw) => ({ saveId: requireString(rawOf(raw), 'saveId') }),
  run: async ({ sql, userId }, input) => {
    const s = await ownedSave(sql, userId, input.saveId);
    await sql`delete from public.saves where id = ${s.id}`;
    return { ok: true as const };
  },
};
