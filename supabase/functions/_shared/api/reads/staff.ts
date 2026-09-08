// staff: who coaches a club, and how the league's staffs compare.
//
// Read from the rows the engine projected, not from the document: the same
// rule as every other screen. The rating and the rank are computed in the
// query rather than in the browser, so two screens cannot disagree about
// which staff is third best.

import type { Handler } from '../context.ts';
import { ownedSave } from '../save.ts';
import { optionalString, rawOf, requireString } from '../parse.ts';

export interface StaffIn { readonly saveId: string; readonly teamId?: string }

export interface CoachOut {
  readonly coachId: string;
  readonly name: string;
  readonly role: string;
  readonly age: number | null;
  readonly experience: number | null;
  readonly yearsWithTeam: number | null;
  readonly overall: number | null;
  readonly tree: string | null;
  /** The attributes a manager would actually look at. */
  readonly playCalling: number | null;
  readonly development: number | null;
  readonly evaluation: number | null;
  readonly hotSeat: number | null;
  readonly callsPlays: boolean;
}

export interface StaffOut {
  readonly teamId: string;
  readonly coaches: readonly CoachOut[];
  /** Weighted head coach and coordinators, and where that sits in the league. */
  readonly rating: number | null;
  readonly rank: number | null;
  readonly clubs: number;
  /** Every club's head coach, so the carousel is readable at a glance. */
  readonly headCoaches: readonly { readonly teamId: string; readonly name: string; readonly overall: number | null; readonly hotSeat: number | null }[];
}

/** The order a staff reads in. Anything else is a position coach. */
const ROLE_ORDER = [
  'Head Coach', 'Offensive Coordinator', 'Defensive Coordinator', 'Special Teams Coordinator',
];

interface Row {
  coach_id: string; display_name: string; role: string; age: number | null;
  years_experience: number | null; years_with_team: number | null;
  overall_rating: number | null; coaching_tree: string | null;
  play_calling: number | null; player_development: number | null;
  talent_evaluation: number | null; hot_seat_rating: number | null;
  play_calling_duty: boolean | null;
}

export const staff: Handler<StaffIn, StaffOut> = {
  auth: 'required',
  parse: (raw) => {
    const r = rawOf(raw);
    const teamId = optionalString(r, 'teamId');
    return { saveId: requireString(r, 'saveId'), ...(teamId === undefined ? {} : { teamId }) };
  },
  run: async ({ sql, userId }, input) => {
    const s = await ownedSave(sql, userId, input.saveId);
    const teamId = input.teamId ?? s.user_team_id;
    const rows = await sql<Row[]>`
      select c.coach_id, c.display_name, c.role, c.age, c.years_experience,
             st.years_with_team, c.overall_rating, c.coaching_tree,
             a.play_calling, a.player_development, a.talent_evaluation,
             c.hot_seat_rating, st.play_calling_duty
        from public.coaches c
        left join public.coach_attributes a
          on a.save_id = c.save_id and a.coach_id = c.coach_id
        left join public.team_coaching_staff st
          on st.save_id = c.save_id and st.coach_id = c.coach_id
       where c.save_id = ${s.id} and c.team_id = ${teamId}
       order by c.coach_id`;

    // The club's staff rating and its place in the league, both from the same
    // expression, so the number and the rank cannot disagree.
    const ranked = await sql<{ team_id: string; rating: number; rank: string }[]>`
      with weighted as (
        select c.team_id,
               sum(c.overall_rating * case c.role
                     when 'Head Coach' then 2
                     when 'Offensive Coordinator' then 1
                     when 'Defensive Coordinator' then 1 else 0 end)::numeric as points,
               sum(case c.role
                     when 'Head Coach' then 2
                     when 'Offensive Coordinator' then 1
                     when 'Defensive Coordinator' then 1 else 0 end)::numeric as weight
          from public.coaches c
         where c.save_id = ${s.id} and c.team_id is not null
         group by c.team_id)
      select team_id, round(points / nullif(weight, 0), 1) as rating,
             rank() over (order by points / nullif(weight, 0) desc)::text as rank
        from weighted order by rating desc`;
    const mine = ranked.find((r) => r.team_id === teamId);

    const heads = await sql<{ team_id: string; display_name: string; overall_rating: number | null; hot_seat_rating: number | null }[]>`
      select team_id, display_name, overall_rating, hot_seat_rating from public.coaches
       where save_id = ${s.id} and team_id is not null and role = 'Head Coach'
       order by team_id`;

    const order = (role: string): number => {
      const at = ROLE_ORDER.indexOf(role);
      return at === -1 ? ROLE_ORDER.length : at;
    };
    return {
      teamId,
      coaches: [...rows]
        .sort((a, b) => order(a.role) - order(b.role)
          || (b.overall_rating ?? 0) - (a.overall_rating ?? 0))
        .map((r) => ({
          coachId: r.coach_id, name: r.display_name, role: r.role, age: r.age,
          experience: r.years_experience, yearsWithTeam: r.years_with_team,
          overall: r.overall_rating, tree: r.coaching_tree,
          playCalling: r.play_calling, development: r.player_development,
          evaluation: r.talent_evaluation, hotSeat: r.hot_seat_rating,
          callsPlays: r.play_calling_duty === true,
        })),
      rating: mine === undefined ? null : Number(mine.rating),
      rank: mine === undefined ? null : Number(mine.rank),
      clubs: ranked.length,
      headCoaches: heads.map((h) => ({
        teamId: h.team_id, name: h.display_name,
        overall: h.overall_rating, hotSeat: h.hot_seat_rating,
      })),
    };
  },
};
