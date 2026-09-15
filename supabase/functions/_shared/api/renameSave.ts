// rename-save: what the save file is called, and nothing else about it.
//
// The name is the one thing about a dynasty a player owns outright -- the
// season, the record and the cap are the engine's to say -- so it is the one
// thing a write handler here may set from a string the client sent.
//
// `ownedSave` is what makes that safe: it resolves the id against this user's
// saves and throws otherwise, so a rename can only ever land on a row the
// caller already owns (ARCHITECTURE.md: every handler filters by ctx.userId).

import type { Handler } from './context.ts';
import { badRequest } from './context.ts';
import { ownedSave } from './save.ts';
import { rawOf, requireString } from './parse.ts';

/** Long enough for "The Cleveland Rebuild", short enough for a save-file card.
 *  Refused rather than silently truncated: a name that came back shorter than
 *  it was typed is a change the player did not make. */
export const MAX_SAVE_NAME = 40;

export interface RenameSaveIn {
  readonly saveId: string;
  readonly name: string;
}

export const renameSave: Handler<RenameSaveIn, { readonly name: string }> = {
  auth: 'required',
  parse: (raw) => {
    const r = rawOf(raw);
    return { saveId: requireString(r, 'saveId'), name: requireString(r, 'name') };
  },
  run: async ({ sql, userId }, input) => {
    const s = await ownedSave(sql, userId, input.saveId);
    // Trimmed once, here, so the stored name and the checked name are the same
    // string. A name of nothing but spaces is empty, and is refused.
    const name = input.name.trim();
    if (name === '') throw badRequest('A save file needs a name.');
    if (name.length > MAX_SAVE_NAME) {
      throw badRequest(`A save file name is at most ${String(MAX_SAVE_NAME)} characters.`);
    }
    await sql`update public.saves set name = ${name} where id = ${s.id}`;
    return { name };
  },
};
