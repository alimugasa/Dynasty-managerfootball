// Generated from legacy/seed/schema_supabase.sql — the authoritative schema.
// Column names, order and nullability mirror the SQL exactly. Do not rename to
// camelCase and do not add fields the schema does not have.

/** Table `player_attributes` — 69 columns, primary key `player_id`. */
export interface PlayerAttributes {
  player_id: string;
  position: string | null;
  speed: number | null;
  acceleration: number | null;
  agility: number | null;
  strength: number | null;
  stamina: number | null;
  durability: number | null;
  awareness: number | null;
  football_iq: number | null;
  work_ethic: number | null;
  consistency: number | null;
  anchor: number | null;
  ball_skills: number | null;
  blitzing: number | null;
  block_shedding: number | null;
  break_tackle: number | null;
  carrying: number | null;
  catch_in_traffic: number | null;
  catching: number | null;
  clutch: number | null;
  contact_balance: number | null;
  coverage: number | null;
  decision_making: number | null;
  deep_accuracy: number | null;
  directional: number | null;
  elusiveness: number | null;
  finesse_move: number | null;
  hang_time: number | null;
  kick_accuracy: number | null;
  kick_power: number | null;
  kickoff_power: number | null;
  lead_block: number | null;
  line_calls: number | null;
  man_coverage: number | null;
  medium_accuracy: number | null;
  pass_block: number | null;
  pass_protection: number | null;
  pass_rush: number | null;
  play_action: number | null;
  play_recognition: number | null;
  pocket_presence: number | null;
  power: number | null;
  power_move: number | null;
  press: number | null;
  pressure_handling: number | null;
  punt_accuracy: number | null;
  punt_power: number | null;
  pursuit: number | null;
  receiving: number | null;
  release: number | null;
  route_running: number | null;
  run_block: number | null;
  run_defense: number | null;
  run_support: number | null;
  scrambling: number | null;
  second_level: number | null;
  separation: number | null;
  short_accuracy: number | null;
  snap_accuracy: number | null;
  snap_speed: number | null;
  spectacular_catch: number | null;
  tackling: number | null;
  technique: number | null;
  throw_on_run: number | null;
  throw_power: number | null;
  vision: number | null;
  zone_coverage: number | null;
  data_class: string | null;
}
// FK: player_id -> players.player_id
