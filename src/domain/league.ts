// Generated from legacy/seed/schema_supabase.sql — the authoritative schema.
// Column names, order and nullability mirror the SQL exactly. Do not rename to
// camelCase and do not add fields the schema does not have.

/** Table `league_conferences` — 4 columns, primary key `conference_id`. */
export interface LeagueConferences {
  conference_id: string;
  name: string | null;
  league_id: string | null;
  data_class: string | null;
}

/** Table `league_divisions` — 5 columns, primary key `division_id`. */
export interface LeagueDivisions {
  division_id: string;
  conference_id: string | null;
  name: string | null;
  region: string | null;
  data_class: string | null;
}
// FK: conference_id -> league_conferences.conference_id

/** Table `colleges` — 9 columns, primary key (save_id, college_id).
 *  `pro_pipeline_rate` was renamed from the seed's `nfl_pipeline_rate`; see
 *  docs/IP-POLICY.md and migration 0002. */
export interface Colleges {
  college_id: string;
  name: string | null;
  abbreviation: string | null;
  conference: string | null;
  conference_abbr: string | null;
  division_tier: number | null;
  talent_level: number | null;
  pro_pipeline_rate: number | null;
  data_class: string | null;
}
