// save: the dynasty the client is playing, and the clubs it can name.

import type { Handler } from '../context.ts';
import type { Db } from '../db.ts';
import { latestSave, seasonWeeks } from '../save.ts';

export interface Club {
  readonly id: string;
  readonly metro: string;
  readonly nickname: string;
  readonly name: string;
  readonly conferenceId: string;
  readonly divisionId: string;
  readonly primary: string;
  readonly secondary: string;
}

export interface SaveSummary {
  readonly saveId: string;
  readonly name: string;
  readonly userTeamId: string;
  readonly season: number;
  readonly week: number;
  readonly phase: string;
  readonly weeks: number;
}

export interface SaveOut {
  readonly save: SaveSummary | null;
  /** The save's clubs, or the template's when there is no save to pick from. */
  readonly clubs: readonly Club[];
}

interface ClubRow {
  team_id: string; metro_area: string; nickname: string; conference_id: string;
  division_id: string; primary_color: string; secondary_color: string;
}

export async function clubsOf(db: Db, saveId: string): Promise<Club[]> {
  const rows = await db<ClubRow[]>`
    select team_id, metro_area, nickname, conference_id, division_id,
           primary_color, secondary_color
      from public.teams where save_id = ${saveId} order by conference_id, division_id, team_id`;
  return rows.map((r) => ({
    id: r.team_id, metro: r.metro_area, nickname: r.nickname,
    name: `${r.metro_area} ${r.nickname}`.trim(),
    conferenceId: r.conference_id, divisionId: r.division_id,
    primary: r.primary_color, secondary: r.secondary_color,
  }));
}

export const save: Handler<Record<string, never>, SaveOut> = {
  auth: 'required',
  parse: () => ({}),
  run: async ({ sql, userId }) => {
    const row = userId === null ? null : await latestSave(sql, userId);
    if (row === null) {
      const [template] = await sql<{ id: string }[]>`select id from public.saves where is_template`;
      if (template === undefined) throw new Error('No template world has been imported');
      return { save: null, clubs: await clubsOf(sql, template.id) };
    }
    return {
      save: {
        saveId: row.id, name: row.name, userTeamId: row.user_team_id,
        season: row.season, week: row.week, phase: row.phase,
        weeks: await seasonWeeks(sql, row.id, row.season),
      },
      clubs: await clubsOf(sql, row.id),
    };
  },
};
