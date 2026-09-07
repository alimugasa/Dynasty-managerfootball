// roster: one position group of the managed club's depth chart, and the write
// that reorders it -- the one decision the client makes that the engine reads.

import { badRequest, type Handler } from '../context.ts';
import { ownedSave } from '../save.ts';
import { rawOf, requireString, requireStringList } from '../parse.ts';
import { readDepthChart, writeDepthChart } from '../project/depthChart.ts';
import { weeksOut } from '../project/stats.ts';
import { POSITION_GROUPS, type PositionGroup } from '../../engine/types.ts';

export interface RosterIn { readonly saveId: string; readonly group: PositionGroup }

export interface DepthRow {
  readonly playerId: string; readonly name: string; readonly age: number;
  readonly overall: number;
  /** Weeks still to miss, or null when fit. */
  readonly out: number | null;
}

export interface RosterOut { readonly order: readonly DepthRow[] }

function parseGroup(value: string): PositionGroup {
  if (!(POSITION_GROUPS as readonly string[]).includes(value)) {
    throw badRequest(`group must be one of ${POSITION_GROUPS.join(', ')}`);
  }
  return value as PositionGroup;
}

export const roster: Handler<RosterIn, RosterOut> = {
  auth: 'required',
  parse: (raw) => {
    const r = rawOf(raw);
    return { saveId: requireString(r, 'saveId'), group: parseGroup(requireString(r, 'group')) };
  },
  run: async ({ sql, userId }, input) => {
    const s = await ownedSave(sql, userId, input.saveId);
    const chart = await readDepthChart(sql, s.id, s.user_team_id);
    const ids = chart[input.group];
    const out = await weeksOut(sql, s.id, s.season, s.week, s.user_team_id);
    const rows = await sql<{ player_id: string; display_name: string; age: number; overall_rating: number }[]>`
      select player_id, display_name, age, overall_rating from public.players
       where save_id = ${s.id} and player_id = any(${ids}::text[])`;
    const byId = new Map(rows.map((r) => [r.player_id, r]));
    return {
      order: ids.flatMap((id) => {
        const p = byId.get(id);
        if (p === undefined) return [];
        return [{
          playerId: id, name: p.display_name, age: p.age, overall: p.overall_rating,
          out: out.get(id) ?? null,
        }];
      }),
    };
  },
};

export interface SetDepthChartIn {
  readonly saveId: string; readonly group: PositionGroup; readonly order: readonly string[];
}

/** The new order must be a permutation of the group's current order: nobody
 *  added, nobody dropped, nobody from another club. */
export const setDepthChart: Handler<SetDepthChartIn, { readonly ok: true }> = {
  auth: 'required',
  parse: (raw) => {
    const r = rawOf(raw);
    return {
      saveId: requireString(r, 'saveId'), group: parseGroup(requireString(r, 'group')),
      order: requireStringList(r, 'order'),
    };
  },
  run: ({ sql, userId }, input) => sql.begin(async (tx) => {
    const s = await ownedSave(tx, userId, input.saveId);
    const chart = await readDepthChart(tx, s.id, s.user_team_id);
    const current = chart[input.group];
    const same = current.length === input.order.length
      && new Set(input.order).size === input.order.length
      && input.order.every((id) => current.includes(id));
    if (!same) throw badRequest(`order must reorder exactly the ${input.group} group as it stands`);
    await writeDepthChart(tx, s.id, s.user_team_id, { ...chart, [input.group]: input.order });
    return { ok: true as const };
  }),
};
