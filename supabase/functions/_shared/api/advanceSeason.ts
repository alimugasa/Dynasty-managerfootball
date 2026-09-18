// advance-season: run the offseason and open the next year.

import type { Handler } from './context.ts';
import { ownedSave } from './save.ts';
import { rawOf, requireString } from './parse.ts';
import { advanceSeason as run, type SeasonOutcome } from './rollover.ts';

export interface AdvanceSeasonIn { readonly saveId: string }

export const advanceSeason: Handler<AdvanceSeasonIn, SeasonOutcome> = {
  auth: 'required',
  parse: (raw) => ({ saveId: requireString(rawOf(raw), 'saveId') }),
  run: ({ sql, userId }, input) => sql.begin(async (tx) => {
    await tx`select 1 from public.saves where id = ${input.saveId} for update`;
    const save = await ownedSave(tx, userId, input.saveId);
    return run(tx, save);
  }),
};
