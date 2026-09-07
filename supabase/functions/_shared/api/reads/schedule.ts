// schedule: one week of fixtures, with scores where played.

import type { Handler } from '../context.ts';
import { ownedSave, seasonWeeks } from '../save.ts';
import { optionalInt, rawOf, requireString } from '../parse.ts';
import type { FixtureOut } from './team.ts';

export interface ScheduleIn { readonly saveId: string; readonly week?: number }
export interface ScheduleOut { readonly weeks: number; readonly week: number; readonly fixtures: readonly FixtureOut[] }

export const schedule: Handler<ScheduleIn, ScheduleOut> = {
  auth: 'required',
  parse: (raw) => {
    const r = rawOf(raw);
    const week = optionalInt(r, 'week');
    return { saveId: requireString(r, 'saveId'), ...(week === undefined ? {} : { week }) };
  },
  run: async ({ sql, userId }, input) => {
    const s = await ownedSave(sql, userId, input.saveId);
    const weeks = await seasonWeeks(sql, s.id, s.season);
    const week = Math.min(Math.max(input.week ?? s.week, 1), weeks);
    const rows = await sql<{
      game_id: string; week: number; home_team_id: string; away_team_id: string;
      home_score: number | null; away_score: number | null;
    }[]>`
      select f.game_id, f.week, f.home_team_id, f.away_team_id, g.home_score, g.away_score
        from public.season_schedule f
        left join public.game_results g on g.save_id = f.save_id and g.game_id = f.game_id
       where f.save_id = ${s.id} and f.season = ${s.season} and f.week = ${week}
       order by f.game_id`;
    return {
      weeks, week,
      fixtures: rows.map((r) => ({
        gameId: r.game_id, week: r.week, homeTeamId: r.home_team_id, awayTeamId: r.away_team_id,
        homeScore: r.home_score, awayScore: r.away_score,
      })),
    };
  },
};
