// Domain model index.
//
// AUTHORITY: supabase/migrations/. These interfaces were generated from the
// original seed schema, which has since been superseded — every table is now
// save-scoped with a composite primary key (save_id, <natural_id>), and the
// runtime layer (results, standings, season statistics, season grades, awards,
// honours, records, transactions, news) exists in migrations 0007 and 0008.
//
// Only `players` and `colleges` have been hand-corrected here, for the two
// schema decisions that changed their shape. The remaining interfaces still
// describe the pre-save_id column sets and none of them carries `save_id`. They
// are regenerated from the live database, not edited by hand, once the Supabase
// project exists.

export * from './league';
export * from './teams';
export * from './coaches';
export * from './players';
export * from './playerAttributes';
export * from './contracts';
export * from './roster';
export * from './schedule';
export * from './draft';
export * from './meta';
export * from './news';

export * from './competition';

/** Every table declared in schema_supabase.sql. Used to prevent typo-driven
 *  duplicate tables — a name not in this union is not a real table. */
export type TableName =
  | 'coach_attributes'
  | 'coaches'
  | 'colleges'
  | 'data_provenance'
  | 'draft_classes'
  | 'draft_picks'
  | 'franchise_finances'
  | 'free_agents'
  | 'league_conferences'
  | 'league_divisions'
  | 'owner_goals'
  | 'owners'
  | 'player_attributes'
  | 'player_contracts'
  | 'player_injuries'
  | 'player_morale'
  | 'player_traits'
  | 'players'
  | 'salary_cap'
  | 'season_schedule'
  | 'stadiums'
  | 'team_bye_weeks'
  | 'team_coaching_staff'
  | 'team_depth_charts'
  | 'team_needs'
  | 'team_rosters'
  | 'team_schemes'
  | 'teams';

export const TABLE_NAMES: readonly TableName[] = [
  'coach_attributes',
  'coaches',
  'colleges',
  'data_provenance',
  'draft_classes',
  'draft_picks',
  'franchise_finances',
  'free_agents',
  'league_conferences',
  'league_divisions',
  'owner_goals',
  'owners',
  'player_attributes',
  'player_contracts',
  'player_injuries',
  'player_morale',
  'player_traits',
  'players',
  'salary_cap',
  'season_schedule',
  'stadiums',
  'team_bye_weeks',
  'team_coaching_staff',
  'team_depth_charts',
  'team_needs',
  'team_rosters',
  'team_schemes',
  'teams',
] as const;
