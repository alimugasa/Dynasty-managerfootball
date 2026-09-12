// sim-week: play the save's current week.

import { badRequest, type Handler } from './context.ts';
import { ownedSave } from './save.ts';
import { playWeek, type WeekOutcome } from './week.ts';

export interface SimWeekIn { readonly saveId: string }

export const simWeek: Handler<SimWeekIn, WeekOutcome> = {
  auth: 'required',
  parse: (raw) => {
    const r = (raw ?? {}) as Partial<Record<string, unknown>>;
    const saveId = typeof r['saveId'] === 'string' ? r['saveId'] : '';
    if (saveId === '') throw badRequest('saveId is required');
    return { saveId };
  },
  run: ({ sql, userId }, input) => sql.begin(async (tx) => {
    // FOR UPDATE on the save row: two sim-week calls for one save serialise
    // rather than both playing week 7.
    await tx`select 1 from public.saves where id = ${input.saveId} for update`;
    const save = await ownedSave(tx, userId, input.saveId);
    return playWeek(tx, save);
  }),
};
