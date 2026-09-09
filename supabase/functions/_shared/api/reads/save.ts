// save: the dynasty the client is playing, and the clubs it can name.
//
// Which dynasty is the caller's to say. The menu opens a save by id; a client
// that names none gets the one it touched most recently, which is the right
// guess for a reload and never a substitute for the menu having asked.

import type { Handler } from '../context.ts';
import type { Db } from '../db.ts';
import { latestSave, ownedSave, seasonWeeks } from '../save.ts';
import { optionalString, rawOf } from '../parse.ts';

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

export interface SaveIn {
  /** The save to open. Omitted means the most recently touched. */
  readonly saveId?: string;
}

export interface SaveSummary {
  readonly saveId: string;
  readonly name: string;
  readonly userTeamId: string;
  readonly season: number;
  readonly week: number;
  readonly phase: string;
  readonly weeks: number;
  /** The save file it sits in. */
  readonly slot: number | null;
  /** Null on a save made before a GM was ever named; never a placeholder. */
  readonly gmName: string | null;
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

export const save: Handler<SaveIn, SaveOut> = {
  auth: 'required',
  parse: (raw) => {
    const saveId = optionalString(rawOf(raw), 'saveId');
    return saveId === undefined ? {} : { saveId };
  },
  run: async ({ sql, userId }, input) => {
    // A named save is checked for ownership; another user's id is "not found"
    // rather than "forbidden", so the answer confirms nothing.
    const row = userId === null ? null
      : input.saveId === undefined
        ? await latestSave(sql, userId)
        : await ownedSave(sql, userId, input.saveId);
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
        slot: row.slot,
        gmName: row.gm_first_name === null || row.gm_last_name === null
          ? null : `${row.gm_first_name} ${row.gm_last_name}`.trim(),
      },
      clubs: await clubsOf(sql, row.id),
    };
  },
};
