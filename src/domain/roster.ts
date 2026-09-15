// Generated from legacy/seed/schema_supabase.sql — the authoritative schema.
// Column names, order and nullability mirror the SQL exactly. Do not rename to
// camelCase and do not add fields the schema does not have.

/** Table `team_rosters` — 11 columns. */
export interface TeamRosters {
  team_id: string | null;
  player_id: string | null;
  position: string | null;
  jersey_number: number | null;
  roster_status: string | null;
  designation: string | null;
  depth_rank: number | null;
  acquisition_type: string | null;
  acquisition_year: number | null;
  active_status: number | null;
  data_class: string | null;
}
// FK: player_id -> players.player_id; team_id -> teams.team_id

/** Table `team_depth_charts` — 9 columns. */
export interface TeamDepthCharts {
  team_id: string | null;
  unit: string | null;
  slot: string | null;
  slot_position: string | null;
  depth_order: number | null;
  player_id: string | null;
  player_position: string | null;
  is_starter: number | null;
  data_class: string | null;
}
// FK: player_id -> players.player_id; team_id -> teams.team_id

/** Table `team_needs` — 6 columns. */
export interface TeamNeeds {
  team_id: string | null;
  need_rank: number | null;
  position: string | null;
  starter_avg_rating: number | null;
  severity: string | null;
  data_class: string | null;
}
// FK: team_id -> teams.team_id

/** Table `owner_goals` — 13 columns. */
export interface OwnerGoals {
  goal_id: string | null;
  team_id: string | null;
  owner_id: string | null;
  season: number | null;
  goal_type: string | null;
  description: string | null;
  target_value: number | null;
  priority: string | null;
  franchise_posture: string | null;
  patience_if_missed: number | null;
  reward_points: number | null;
  status: string | null;
  data_class: string | null;
}
// FK: team_id -> teams.team_id
