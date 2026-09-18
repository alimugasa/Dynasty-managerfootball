// Generated from legacy/seed/schema_supabase.sql — the authoritative schema.
// Column names, order and nullability mirror the SQL exactly. Do not rename to
// camelCase and do not add fields the schema does not have.

/** Table `players` — primary key (save_id, player_id). */
export interface Players {
  player_id: string;
  display_name: string | null;
  team_id: string | null;
  position: string | null;
  position_group: string | null;
  jersey_number: number | null;
  height_inches: number | null;
  weight_lbs: number | null;
  age: number | null;
  experience_years: number | null;
  college_id: string | null;
  college_name: string | null;
  draft_year: number | null;
  draft_round: number | null;
  draft_pick_in_round: number | null;
  draft_overall_pick: number | null;
  draft_status: string | null;
  rookie_flag: number | null;
  role_tier: string | null;
  overall_rating: number | null;
  potential_rating: number | null;
  /** Null while active. Retirement is a state, not a deletion. */
  retired_season: number | null;
  data_class: string | null;
}
// FK: college_id -> colleges.college_id
// roster_status, designation and depth_rank moved to `team_rosters`, which is
// their single authority. See migration 0004.

/** Table `player_traits` — 3 columns. */
export interface PlayerTraits {
  player_id: string | null;
  trait: string | null;
  data_class: string | null;
}
// FK: player_id -> players.player_id

/** Table `player_morale` — 10 columns, primary key `player_id`. */
export interface PlayerMorale {
  player_id: string;
  team_id: string | null;
  morale: number | null;
  playing_time_satisfaction: number | null;
  contract_satisfaction: number | null;
  coach_trust: number | null;
  locker_room_influence: number | null;
  trade_request: number | null;
  holdout_risk: number | null;
  data_class: string | null;
}
// FK: player_id -> players.player_id

/** Table `player_injuries` — 7 columns. */
export interface PlayerInjuries {
  player_id: string | null;
  team_id: string | null;
  designation: string | null;
  injury_type: string | null;
  weeks_out_estimate: number | null;
  season_ending: number | null;
  data_class: string | null;
}
// FK: player_id -> players.player_id; team_id -> teams.team_id
