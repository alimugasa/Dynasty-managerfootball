// Generated from legacy/seed/schema_supabase.sql — the authoritative schema.
// Column names, order and nullability mirror the SQL exactly. Do not rename to
// camelCase and do not add fields the schema does not have.

/** Table `season_schedule` — 18 columns, primary key `game_id`. */
export interface SeasonSchedule {
  game_id: string;
  season: number | null;
  week: number | null;
  game_date: string | null;
  kickoff_local: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  venue: string | null;
  venue_city: string | null;
  roof: string | null;
  surface: string | null;
  divisional_game: number | null;
  conference_game: number | null;
  primetime: number | null;
  status: string | null;
  home_score: string | null;
  away_score: string | null;
  data_class: string | null;
}
// FK: home_team_id -> teams.team_id; away_team_id -> teams.team_id

/** Table `team_bye_weeks` — 3 columns. */
export interface TeamByeWeeks {
  season: number | null;
  team_id: string | null;
  bye_week: number | null;
}
// FK: team_id -> teams.team_id
