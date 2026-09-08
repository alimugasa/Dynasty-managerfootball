// schedule: one week of fixtures, with scores where played.
//
// The regular season's weeks are known from the start; a playoff week exists
// once the bracket has written it, so the chips for those come from the rows.

import type { Handler } from '../context.ts';
import { ownedSave, seasonWeeks } from '../save.ts';
import { optionalInt, rawOf, requireString } from '../parse.ts';
import { ROUND_LABEL, type PlayoffRound } from '../../engine/playoffs.ts';
import { PLAYOFF_WEEKS } from '../postseason.ts';
import type { FixtureOut } from './team.ts';

export interface ScheduleIn { readonly saveId: string; readonly week?: number }
export interface PlayoffWeekOut { readonly week: number; readonly round: PlayoffRound; readonly label: string }
export interface ScheduleOut {
  /** Regular-season weeks. */
  readonly weeks: number;
  readonly week: number;
  /** Set on a playoff week. */
  readonly round: PlayoffRound | null;
  readonly fixtures: readonly FixtureOut[];
  /** Playoff weeks the bracket has written so far. */
  readonly playoffWeeks: readonly PlayoffWeekOut[];
}

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
    const playoffWeeks = await sql<{ week: number; playoff_round: string }[]>`
      select distinct week, playoff_round from public.season_schedule
       where save_id = ${s.id} and season = ${s.season} and competition = 'PLAYOFF'
       order by week`;
    const lastWritten = playoffWeeks.reduce((n, r) => Math.max(n, r.week), weeks);
    const week = Math.min(Math.max(input.week ?? s.week, 1), lastWritten, weeks + PLAYOFF_WEEKS);
    const rows = await sql<{
      game_id: string; week: number; home_team_id: string; away_team_id: string;
      home_score: number | null; away_score: number | null; playoff_round: string | null;
    }[]>`
      select f.game_id, f.week, f.home_team_id, f.away_team_id, g.home_score, g.away_score,
             f.playoff_round
        from public.season_schedule f
        left join public.game_results g on g.save_id = f.save_id and g.game_id = f.game_id
       where f.save_id = ${s.id} and f.season = ${s.season} and f.week = ${week}
       order by f.game_id`;
    const roundOf = (name: string | null): PlayoffRound | null =>
      (Object.keys(ROUND_LABEL) as PlayoffRound[]).find((r) => r === name) ?? null;
    return {
      weeks, week, round: roundOf(rows[0]?.playoff_round ?? null),
      fixtures: rows.map((r) => ({
        gameId: r.game_id, week: r.week, homeTeamId: r.home_team_id, awayTeamId: r.away_team_id,
        homeScore: r.home_score, awayScore: r.away_score,
      })),
      playoffWeeks: playoffWeeks.flatMap((r) => {
        const round = roundOf(r.playoff_round);
        return round === null ? [] : [{ week: r.week, round, label: ROUND_LABEL[round] }];
      }),
    };
  },
};
