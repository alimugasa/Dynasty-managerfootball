// Generated from legacy/seed/schema_supabase.sql — the authoritative schema.
// Column names, order and nullability mirror the SQL exactly. Do not rename to
// camelCase and do not add fields the schema does not have.

/** Table `draft_picks` — 9 columns, primary key `pick_id`. */
export interface DraftPicks {
  pick_id: string;
  draft_year: number | null;
  round: number | null;
  pick_in_round: number | null;
  overall_pick: number | null;
  original_team_id: string | null;
  current_owner_team_id: string | null;
  compensatory: number | null;
  data_class: string | null;
}
// FK: original_team_id -> teams.team_id; current_owner_team_id -> teams.team_id

/** Table `draft_classes` — 19 columns, primary key `prospect_id`. */
export interface DraftClasses {
  prospect_id: string;
  draft_year: number | null;
  display_name: string | null;
  position: string | null;
  position_group: string | null;
  college_id: string | null;
  college_name: string | null;
  age: number | null;
  height_inches: number | null;
  weight_lbs: number | null;
  scout_grade: number | null;
  projected_round: string | null;
  floor_rating: number | null;
  ceiling_rating: number | null;
  bust_risk: number | null;
  forty_yard: number | null;
  scouting_confidence: string | null;
  prospect_class: string | null;
  data_class: string | null;
}
// FK: college_id -> colleges.college_id

/** Table `free_agents` — 12 columns. */
export interface FreeAgents {
  player_id: string | null;
  display_name: string | null;
  position: string | null;
  age: number | null;
  experience_years: number | null;
  overall_rating: number | null;
  previous_team_id: string | null;
  market_asking_aav: number | null;
  expected_years: number | null;
  interest_level: number | null;
  fa_type: string | null;
  data_class: string | null;
}
// FK: player_id -> players.player_id
