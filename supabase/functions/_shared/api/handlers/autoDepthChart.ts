import type { Handler } from '../context.ts';
import { ownedSave } from '../save.ts';
import { rawOf, requireString } from '../parse.ts';
import { depthState, requireDepthRevision } from '../depthState.ts';
import { writeDepthChart } from '../project/depthChart.ts';

/** Exposes the same defaultDepthChart used by new saves, rollover and CPU teams. */
export const autoDepthChart: Handler<{ readonly saveId: string; readonly expectedRevision: string }, { readonly ok: true }> = {
  auth: 'required',
  parse: (raw) => {
    const r = rawOf(raw);
    return { saveId: requireString(r, 'saveId'), expectedRevision: requireString(r, 'expectedRevision') };
  },
  run: ({ sql, userId }, input) => sql.begin(async (tx) => {
    await tx`select 1 from public.saves where id = ${input.saveId} for update`;
    const save = await ownedSave(tx, userId, input.saveId);
    const state = await depthState(tx, save);
    requireDepthRevision(input.expectedRevision, state.revision);
    await writeDepthChart(tx, save.id, save.user_team_id, state.automatic);
    return { ok: true as const };
  }),
};
