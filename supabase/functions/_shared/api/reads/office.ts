// office: the cap sheet, the feed, the dynasty's record.

import type { Handler } from '../context.ts';
import { ownedSave } from '../save.ts';
import { rawOf, requireString } from '../parse.ts';

export interface OfficeIn { readonly saveId: string }

export interface CapOut {
  readonly capLimit: number; readonly committed: number; readonly available: number;
  readonly deadMoney: number;
}
export interface NewsOut {
  readonly newsId: number; readonly season: number; readonly week: number | null;
  readonly category: string; readonly headline: string; readonly body: string | null;
  readonly importance: number;
}
export interface HistoryOut {
  readonly season: number; readonly wins: number; readonly losses: number; readonly ties: number;
}
export interface OfficeOut {
  readonly cap: CapOut | null;
  readonly news: readonly NewsOut[];
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
    const news = await sql<{
      news_id: string; season: number; week: number | null; category: string;
      headline: string; body: string | null; importance: number;
    }[]>`
      select news_id::text, season, week, category, headline, body, importance
        from public.news where save_id = ${s.id} and season = ${s.season}
       order by news_id desc limit 40`;
    const history = await sql<{ season: number; wins: number; losses: number; ties: number }[]>`
      select season, wins, losses, ties from public.league_history
       where save_id = ${s.id} and team_id = ${s.user_team_id} order by season desc`;
    return {
      cap: cap === undefined ? null : {
        capLimit: Number(cap.cap_limit), committed: Number(cap.committed),
        available: Number(cap.available), deadMoney: Number(cap.dead_money),
      },
      news: news.map((n) => ({
        newsId: Number(n.news_id), season: n.season, week: n.week, category: n.category,
        headline: n.headline, body: n.body, importance: n.importance,
      })),
      history,
    };
  },
};
