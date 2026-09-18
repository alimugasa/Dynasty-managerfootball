// The Waiver Wire screen, in one call.
//
// The header a manager needs before looking at a single name -- where their
// club sits in the queue, which window is open, how many players are on it,
// how many claims they have in, and whether they have the roster place and the
// money to take anybody at all -- plus the list itself.
//
// Claim counts are on every row. That is a deliberate disclosure: knowing that
// four clubs want a man is what makes a waiver decision a decision rather than
// a shrug, and it is information a front office would have.

import type { Handler } from '../context.ts';
import { ownedSave } from '../save.ts';
import { rawOf, requireString } from '../parse.ts';
import { seasonWeeks } from '../save.ts';
import { waiverPriorityOf } from '../waivers.ts';
import { ACTIVE_ROSTER_LIMIT, teamCapPosition, teamRosterCount } from '../rosterSpace.ts';
import { WAIVER_WINDOW_WEEKS } from '../waiverRules.ts';

export interface WaiverWireIn { readonly saveId: string }

export interface WaiverRow {
  readonly playerId: string;
  readonly name: string;
  readonly position: string;
  readonly positionGroup: string;
  readonly age: number;
  readonly overall: number;
  readonly potential: number;
  readonly experienceYears: number;
  readonly fromTeamId: string | null;
  readonly fromTeamName: string | null;
  readonly postedWeek: number;
  readonly deadlineWeek: number;
  /** The deal a claiming club inherits. Null where he was released without one,
   *  which is a different thing from a deal worth nothing. */
  readonly inheritedAav: number | null;
  readonly inheritedYears: number | null;
  readonly injuredWeeksOut: number | null;
  readonly claims: number;
  /** Whether this club has a claim in on him. */
  readonly claimed: boolean;
}

export interface WaiverWireOut {
  readonly season: number;
  readonly week: number;
  readonly seasonWeeks: number;
  readonly phase: string;
  /** 1 is first. Null before the season's first refresh, and the screen says
   *  so rather than printing a number nobody set. */
  readonly priority: number | null;
  readonly clubs: number;
  readonly windowWeeks: number;
  /** The latest week any open window shuts, so the header can name one. */
  readonly closesWeek: number | null;
  readonly available: number;
  readonly claimsSubmitted: number;
  readonly rosterCount: number;
  readonly rosterLimit: number;
  readonly capSpace: number;
  readonly players: readonly WaiverRow[];
}

interface Row {
  player_id: string; display_name: string; position: string; position_group: string;
  age: number; overall_rating: number; potential_rating: number;
  experience_years: number; from_team_id: string | null; from_team_name: string | null;
  posted_week: number; deadline_week: number;
  aav: string | null; years: number | null; weeks_out: number | null;
  claims: string; mine: boolean;
}

export const waiverWire: Handler<WaiverWireIn, WaiverWireOut> = {
  auth: 'required',
  parse: (raw) => ({ saveId: requireString(rawOf(raw), 'saveId') }),
  run: async ({ sql, userId }, input) => {
    const save = await ownedSave(sql, userId, input.saveId);
    const weeks = await seasonWeeks(sql, save.id, save.season);

    const rows = await sql<Row[]>`
      select w.player_id, p.display_name, p.position, p.position_group,
             p.age, p.overall_rating, p.potential_rating, p.experience_years,
             w.from_team_id,
             t.metro_area || ' ' || t.nickname as from_team_name,
             w.posted_week, w.deadline_week,
             c.average_annual_value::text as aav, c.years_remaining as years,
             (i.injured_week + i.weeks_out_estimate - ${save.week})::int as weeks_out,
             (select count(*) from public.waiver_claims k
               where k.save_id = w.save_id and k.season = w.season
                 and k.player_id = w.player_id and k.posted_week = w.posted_week
             )::text as claims,
             exists (select 1 from public.waiver_claims k
                      where k.save_id = w.save_id and k.season = w.season
                        and k.player_id = w.player_id and k.posted_week = w.posted_week
                        and k.team_id = ${save.user_team_id}) as mine
        from public.waiver_wire w
        join public.players p on p.save_id = w.save_id and p.player_id = w.player_id
        left join public.teams t on t.save_id = w.save_id and t.team_id = w.from_team_id
        left join public.player_contracts c
          on c.save_id = w.save_id and c.player_id = w.player_id
         and c.contract_status = 'TERMINATED'
        left join public.player_injuries i
          on i.save_id = w.save_id and i.player_id = w.player_id
         and i.injured_season = ${save.season}
         and i.injured_week + i.weeks_out_estimate - ${save.week} >= 1
       where w.save_id = ${save.id} and w.season = ${save.season} and w.state = 'OPEN'
         and w.deadline_week > ${save.week}
       order by p.overall_rating desc, w.player_id`;

    const [clubs] = await sql<{ n: string }[]>`
      select count(*)::text as n from public.teams where save_id = ${save.id}`;
    const cap = await teamCapPosition(sql, save.id, save.season, save.user_team_id);

    const players = rows.map((r): WaiverRow => ({
      playerId: r.player_id, name: r.display_name, position: r.position,
      positionGroup: r.position_group, age: r.age,
      overall: r.overall_rating, potential: r.potential_rating,
      experienceYears: r.experience_years,
      fromTeamId: r.from_team_id, fromTeamName: r.from_team_name,
      postedWeek: r.posted_week, deadlineWeek: r.deadline_week,
      inheritedAav: r.aav === null ? null : Number(r.aav),
      inheritedYears: r.years,
      injuredWeeksOut: r.weeks_out,
      claims: Number(r.claims), claimed: r.mine,
    }));

    return {
      season: save.season, week: save.week, seasonWeeks: weeks, phase: save.phase,
      priority: await waiverPriorityOf(sql, save.id, save.user_team_id),
      clubs: Number(clubs?.n ?? 0),
      windowWeeks: WAIVER_WINDOW_WEEKS,
      closesWeek: players.length === 0
        ? null
        : Math.min(...players.map((p) => p.deadlineWeek)),
      available: players.length,
      claimsSubmitted: players.filter((p) => p.claimed).length,
      rosterCount: await teamRosterCount(sql, save.id, save.user_team_id),
      rosterLimit: ACTIVE_ROSTER_LIMIT,
      capSpace: cap.available,
      players,
    };
  },
};
