// Generated from legacy/seed/schema_supabase.sql — the authoritative schema.
// Column names, order and nullability mirror the SQL exactly. Do not rename to
// camelCase and do not add fields the schema does not have.

/** Table `coaches` — 12 columns, primary key `coach_id`. */
export interface Coaches {
  coach_id: string;
  display_name: string | null;
  team_id: string | null;
  role: string | null;
  age: number | null;
  years_experience: number | null;
  coaching_tree: string | null;
  prior_head_coach: number | null;
  contract_years_remaining: number | null;
  hot_seat_rating: number | null;
  overall_rating: number | null;
  data_class: string | null;
}

/** Table `coach_attributes` — 14 columns, primary key `coach_id`. */
export interface CoachAttributes {
  coach_id: string;
  play_calling: number | null;
  game_management: number | null;
  player_development: number | null;
  talent_evaluation: number | null;
  leadership: number | null;
  adaptability: number | null;
  aggressiveness: number | null;
  discipline: number | null;
  motivation: number | null;
  staff_management: number | null;
  scheme_innovation: number | null;
  clock_management: number | null;
  data_class: string | null;
}
// FK: coach_id -> coaches.coach_id

/** Table `team_coaching_staff` — 7 columns. */
export interface TeamCoachingStaff {
  team_id: string | null;
  coach_id: string | null;
  role: string | null;
  side_of_ball: string | null;
  years_with_team: number | null;
  play_calling_duty: number | null;
  data_class: string | null;
}
// FK: coach_id -> coaches.coach_id; team_id -> teams.team_id

/** Table `team_schemes` — 11 columns. */
export interface TeamSchemes {
  team_id: string | null;
  offensive_scheme: string | null;
  offensive_identity: string | null;
  run_pass_balance: number | null;
  tempo: string | null;
  defensive_scheme: string | null;
  base_front: string | null;
  coverage_tendency: string | null;
  blitz_rate: number | null;
  fourth_down_aggression: number | null;
  data_class: string | null;
}
// FK: team_id -> teams.team_id
