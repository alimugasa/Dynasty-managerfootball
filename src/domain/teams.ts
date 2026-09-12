// Generated from legacy/seed/schema_supabase.sql — the authoritative schema.
// Column names, order and nullability mirror the SQL exactly. Do not rename to
// camelCase and do not add fields the schema does not have.

/** Table `teams` — 12 columns, primary key `team_id`. */
export interface Teams {
  team_id: string;
  metro_area: string | null;
  nickname: string | null;
  division_id: string | null;
  conference_id: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  founded_year: number | null;
  market_size: number | null;
  stadium_id: string | null;
  owner_id: string | null;
  data_class: string | null;
}
// FK: division_id -> league_divisions.division_id

/** Table `stadiums` — 10 columns, primary key `stadium_id`. */
export interface Stadiums {
  stadium_id: string;
  team_id: string | null;
  name: string | null;
  capacity: number | null;
  roof_type: string | null;
  surface: string | null;
  opened_year: number | null;
  city: string | null;
  state: string | null;
  data_class: string | null;
}
// FK: team_id -> teams.team_id

/** Table `owners` — 13 columns, primary key `owner_id`. */
export interface Owners {
  owner_id: string;
  team_id: string | null;
  owner_name: string | null;
  ownership_type: string | null;
  archetype: string | null;
  tenure_years: number | null;
  patience: number | null;
  spending_willingness: number | null;
  meddling: number | null;
  win_now_bias: number | null;
  market_size: number | null;
  franchise_value_musd: number | null;
  data_class: string | null;
}
// FK: team_id -> teams.team_id
