// League -> coaches, coach_attributes, team_coaching_staff.
//
// The engine's staffs, written back as rows the client reads. The same one-way
// rule as the players: the document is the truth, these tables are its
// projection, rewritten after anything that moves a coach.
//
// The seed's own vocabulary is kept on the rows -- 'Head Coach', not
// 'HEAD_COACH' -- because that is what the column already holds for the
// coaches the seed shipped, and a screen reading a mix of the two would show
// both. The engine's role is the source; this is the spelling.

import type { Db } from '../db.ts';
import type { CareerCoach, CoachRole, CoachTree, League } from '../../engine/offseason/index.ts';
import { ENGINE_DATA_CLASS } from './players.ts';

const ROLE_COLUMN: Readonly<Record<CoachRole, string>> = {
  HEAD_COACH: 'Head Coach',
  OFFENSIVE_COORDINATOR: 'Offensive Coordinator',
  DEFENSIVE_COORDINATOR: 'Defensive Coordinator',
  SPECIAL_TEAMS: 'Special Teams Coordinator',
  POSITION_COACH: 'Position Coach',
};

const TREE_COLUMN: Readonly<Record<CoachTree, string>> = {
  OFFENSE: 'Offensive',
  DEFENSE: 'Defensive',
  SPECIAL_TEAMS: 'Special Teams',
  FRONT_OFFICE: 'Front Office',
};

/** Which side of the ball a job sits on. A head coach's staff is neither. */
const SIDE_OF_BALL: Readonly<Record<CoachRole, string>> = {
  HEAD_COACH: 'Staff',
  OFFENSIVE_COORDINATOR: 'Offense',
  DEFENSIVE_COORDINATOR: 'Defense',
  SPECIAL_TEAMS: 'Special Teams',
  POSITION_COACH: 'Staff',
};

export async function projectCoaches(db: Db, saveId: string, league: League): Promise<void> {
  const coaches = league.coaches.filter((c) => !c.retired);
  if (coaches.length === 0) return;
  const col = <T>(f: (c: CareerCoach) => T): T[] => coaches.map(f);

  // The seed names its position coaches by the room they run -- quarterbacks,
  // the offensive line -- and the engine models all of them as one job. The
  // finer name is kept rather than flattened: it is information the seed
  // carries and the engine has no reason to destroy. A coach the engine moved
  // into or out of a coordinator's chair takes the engine's name instead.
  const existing = await db<{ coach_id: string; role: string; side_of_ball: string | null }[]>`
    select c.coach_id, c.role, st.side_of_ball
      from public.coaches c
      left join public.team_coaching_staff st
        on st.save_id = c.save_id and st.coach_id = c.coach_id
     where c.save_id = ${saveId}`;
  const heldRole = new Map(existing.map((r) => [r.coach_id, r.role]));
  const heldSide = new Map(existing.map((r) => [r.coach_id, r.side_of_ball]));
  const namedRole = (c: CareerCoach): string => {
    if (c.role === null) return heldRole.get(c.id) ?? 'Position Coach';
    if (c.role !== 'POSITION_COACH') return ROLE_COLUMN[c.role];
    const held = heldRole.get(c.id);
    return held === undefined || (Object.values(ROLE_COLUMN) as string[]).includes(held)
      ? 'Position Coach' : held;
  };

  await db`
    insert into public.coaches (
      save_id, coach_id, display_name, team_id, role, age, years_experience,
      coaching_tree, prior_head_coach, contract_years_remaining, hot_seat_rating,
      overall_rating, data_class)
    select ${saveId}, u.coach_id, u.name, u.team_id, u.role, u.age, u.experience,
           u.tree, u.prior_head, null, u.hot_seat, u.overall, ${ENGINE_DATA_CLASS}
      from unnest(
        ${col((c) => c.id)}::text[], ${col((c) => c.name)}::text[],
        ${col((c) => c.teamId)}::text[],
        ${col(namedRole)}::text[],
        ${col((c) => Math.round(c.age))}::int[], ${col((c) => Math.round(c.experience))}::int[],
        ${col((c) => TREE_COLUMN[c.tree])}::text[],
        ${col((c) => (c.seasonsAsHeadCoach > 0 ? 'true' : 'false'))}::text[]::boolean[],
        ${col((c) => Math.round(c.hotSeat))}::int[],
        ${col((c) => Math.round(c.ability))}::int[]
      ) as u(coach_id, name, team_id, role, age, experience, tree, prior_head, hot_seat, overall)
    on conflict (save_id, coach_id) do update
      set display_name = excluded.display_name, team_id = excluded.team_id,
          role = excluded.role, age = excluded.age,
          years_experience = excluded.years_experience,
          coaching_tree = excluded.coaching_tree,
          prior_head_coach = excluded.prior_head_coach,
          hot_seat_rating = excluded.hot_seat_rating,
          overall_rating = excluded.overall_rating, data_class = excluded.data_class`;

  await db`
    insert into public.coach_attributes (
      save_id, coach_id, play_calling, game_management, player_development,
      talent_evaluation, leadership, aggressiveness, clock_management, data_class)
    select ${saveId}, u.coach_id, u.play_calling, u.game_management, u.development,
           u.evaluation, u.leadership, u.aggressiveness, u.clock_management,
           ${ENGINE_DATA_CLASS}
      from unnest(
        ${col((c) => c.id)}::text[],
        ${col((c) => Math.round(c.playCalling))}::int[],
        ${col((c) => Math.round(c.gameManagement))}::int[],
        ${col((c) => Math.round(c.development))}::int[],
        ${col((c) => Math.round(c.evaluation))}::int[],
        ${col((c) => Math.round(c.leadership))}::int[],
        ${col((c) => Math.round(c.aggressiveness))}::int[],
        ${col((c) => Math.round(c.clockManagement))}::int[]
      ) as u(coach_id, play_calling, game_management, development, evaluation,
             leadership, aggressiveness, clock_management)
    on conflict (save_id, coach_id) do update
      set play_calling = excluded.play_calling, game_management = excluded.game_management,
          player_development = excluded.player_development,
          talent_evaluation = excluded.talent_evaluation, leadership = excluded.leadership,
          aggressiveness = excluded.aggressiveness,
          clock_management = excluded.clock_management, data_class = excluded.data_class`;

  // A staff row exists only for a coach who has a job. Deleted first, because
  // a coach who was fired has no row to update -- he has one to lose.
  await db`delete from public.team_coaching_staff where save_id = ${saveId}`;
  const hired = coaches.filter((c) => c.teamId !== null && c.role !== null);
  if (hired.length === 0) return;
  const hcol = <T>(f: (c: CareerCoach) => T): T[] => hired.map(f);
  await db`
    insert into public.team_coaching_staff (
      save_id, coach_id, team_id, role, side_of_ball, years_with_team,
      play_calling_duty, data_class)
    select ${saveId}, u.coach_id, u.team_id, u.role, u.side, u.years, u.calls,
           ${ENGINE_DATA_CLASS}
      from unnest(
        ${hcol((c) => c.id)}::text[], ${hcol((c) => c.teamId)}::text[],
        ${hcol(namedRole)}::text[],
        ${hcol((c) => (c.role === 'POSITION_COACH'
          ? heldSide.get(c.id) ?? SIDE_OF_BALL[c.role]
          : SIDE_OF_BALL[c.role as CoachRole]))}::text[],
        ${hcol((c) => Math.round(c.yearsWithTeam))}::int[],
        ${hcol((c) => (c.role === 'OFFENSIVE_COORDINATOR' ? 'true' : 'false'))}::text[]::boolean[]
      ) as u(coach_id, team_id, role, side, years, calls)`;
}
