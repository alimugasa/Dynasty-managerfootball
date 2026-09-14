// office: the cap sheet and the dynasty's record.
//
// It carried the feed too, back when the Office showed six headlines halfway
// down the screen. News is a tab of its own now with a read of its own, and
// forty rows nobody renders is forty rows off the wire on every visit to a
// screen that shows the cap.

import type { Handler } from '../context.ts';
import { ownedSave } from '../save.ts';
import { rawOf, requireString } from '../parse.ts';

export interface OfficeIn { readonly saveId: string }

export interface CapOut {
  readonly capLimit: number; readonly committed: number; readonly available: number;
  readonly deadMoney: number;
}
export interface HistoryOut {
  readonly season: number; readonly wins: number; readonly losses: number; readonly ties: number;
}
export interface OfficeOut {
  readonly cap: CapOut | null;
  readonly history: readonly HistoryOut[];
}

export const office: Handler<OfficeIn, OfficeOut> = {
  auth: 'required',
  parse: (raw) => ({ saveId: requireString(rawOf(raw), 'saveId') }),
  run: async ({ sql, userId }, input) => {
    const s = await ownedSave(sql, userId, input.saveId);
    const [cap] = await sql<{ cap_limit: string; committed: string; available: string; dead_money: string }[]>`
      select cap_limit::text, committed::text, available::text, dead_money::text
        from public.salary_cap
       where save_id = ${s.id} and team_id = ${s.user_team_id} and season = ${s.season}`;
    const history = await sql<{ season: number; wins: number; losses: number; ties: number }[]>`
      select season, wins, losses, ties from public.league_history
       where save_id = ${s.id} and team_id = ${s.user_team_id} order by season desc`;
    return {
      cap: cap === undefined ? null : {
        capLimit: Number(cap.cap_limit), committed: Number(cap.committed),
        available: Number(cap.available), deadMoney: Number(cap.dead_money),
      },
      history,
    };
  },
};
