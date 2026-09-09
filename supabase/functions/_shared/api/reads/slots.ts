// slots: the save files, as the main menu sees them.
//
// Read before any dynasty is open, so it names no save id the caller has not
// earned and touches no engine document -- a slot screen that had to open a
// 12MB save to print a record would take a second per slot. Everything here is
// a column on `saves` or a row of `standings`.
//
// An empty slot is a slot with no save in it, not a slot that failed to load.
// An occupied slot whose GM was never named reports that it has none; there is
// no such person as "Unknown Unknown" (ARCHITECTURE.md rule 3).

import type { Handler } from '../context.ts';

/** How many slots the menu offers. Three is what fits a phone without
 *  scrolling and is more dynasties than most people run at once; a save that
 *  somehow sits beyond it is still listed rather than hidden. */
export const SLOT_COUNT = 3;

export interface SlotRow {
  readonly slot: number;
  /** Null when the slot is empty. Everything below is null with it. */
  readonly saveId: string | null;
  readonly teamId: string | null;
  readonly teamName: string | null;
  /** The club's colours, so the menu can draw its badge without opening the
   *  save the colours live in. */
  readonly primary: string | null;
  readonly secondary: string | null;
  /** "Jordan Vance", or null when the save was made before GMs were named. */
  readonly gmName: string | null;
  readonly season: number | null;
  readonly week: number | null;
  readonly phase: string | null;
  readonly wins: number | null;
  readonly losses: number | null;
  readonly ties: number | null;
  /** ISO 8601. The screen formats it; the server does not guess a timezone. */
  readonly savedAt: string | null;
}

export interface SlotsOut {
  readonly slots: readonly SlotRow[];
}

interface Row {
  slot: number; id: string; user_team_id: string;
  metro_area: string | null; nickname: string | null;
  primary_color: string | null; secondary_color: string | null;
  gm_first_name: string | null; gm_last_name: string | null;
  season: number; week: number; phase: string;
  wins: number | null; losses: number | null; ties: number | null;
  updated_at: Date;
}

const empty = (slot: number): SlotRow => ({
  slot, saveId: null, teamId: null, teamName: null, primary: null, secondary: null, gmName: null,
  season: null, week: null, phase: null,
  wins: null, losses: null, ties: null, savedAt: null,
});

export const slots: Handler<Record<string, never>, SlotsOut> = {
  auth: 'required',
  parse: () => ({}),
  run: async ({ sql, userId }) => {
    if (userId === null) return { slots: [] };

    // One query. The club is joined from the save's own teams, and the record
    // from the save's own standings for the season it is in: a left join, so a
    // save whose table has not been seeded yet is still listed, with its record
    // reported as unavailable rather than as 0-0.
    const rows = await sql<Row[]>`
      select s.slot, s.id, s.user_team_id,
             t.metro_area, t.nickname, t.primary_color, t.secondary_color,
             s.gm_first_name, s.gm_last_name,
             s.season, s.week, s.phase,
             st.wins, st.losses, st.ties,
             s.updated_at
        from public.saves s
        left join public.teams t
          on t.save_id = s.id and t.team_id = s.user_team_id
        left join public.standings st
          on st.save_id = s.id and st.season = s.season and st.team_id = s.user_team_id
       where s.user_id = ${userId} and not s.is_template
       order by s.slot`;

    const occupied = new Map(rows.map((r) => [r.slot, r]));
    // Every slot the menu offers, plus any a save sits in beyond them: a save
    // is never hidden by the size of the list that is meant to show it.
    const numbers = [...new Set([
      ...Array.from({ length: SLOT_COUNT }, (_, i) => i + 1),
      ...rows.map((r) => r.slot),
    ])].sort((a, b) => a - b);

    return {
      slots: numbers.map((slot) => {
        const r = occupied.get(slot);
        if (r === undefined) return empty(slot);
        const named = r.gm_first_name !== null && r.gm_last_name !== null;
        const club = r.metro_area === null || r.nickname === null
          ? null : `${r.metro_area} ${r.nickname}`.trim();
        return {
          slot,
          saveId: r.id,
          teamId: r.user_team_id,
          teamName: club,
          primary: r.primary_color, secondary: r.secondary_color,
          gmName: named ? `${r.gm_first_name ?? ''} ${r.gm_last_name ?? ''}`.trim() : null,
          season: r.season, week: r.week, phase: r.phase,
          wins: r.wins, losses: r.losses, ties: r.ties,
          savedAt: r.updated_at.toISOString(),
        };
      }),
    };
  },
};
