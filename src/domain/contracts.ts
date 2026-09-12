// Generated from legacy/seed/schema_supabase.sql — the authoritative schema.
// Column names, order and nullability mirror the SQL exactly. Do not rename to
// camelCase and do not add fields the schema does not have.

/** Table `player_contracts` — 20 columns, primary key `contract_id`. */
export interface PlayerContracts {
  contract_id: string;
  player_id: string | null;
  team_id: string | null;
  contract_type: string | null;
  start_year: number | null;
  end_year: number | null;
  years_total: number | null;
  years_remaining: number | null;
  total_value: number | null;
  average_annual_value: number | null;
  base_salary_2026: number | null;
  signing_bonus_total: number | null;
  bonus_proration_2026: number | null;
  roster_bonus_2026: number | null;
  guaranteed_money: number | null;
  cap_hit_2026: number | null;
  dead_cap_if_cut_2026: number | null;
  no_trade_clause: number | null;
  contract_status: string | null;
  data_class: string | null;
}
// FK: player_id -> players.player_id; team_id -> teams.team_id

/** Table `franchise_finances` — 15 columns. */
export interface FranchiseFinances {
  team_id: string | null;
  season: number | null;
  salary_cap: number | null;
  top51_cap_spend: number | null;
  cap_space: number | null;
  dead_cap: number | null;
  cash_spend: number | null;
  local_revenue: number | null;
  national_revenue: number | null;
  total_revenue: number | null;
  operating_expenses: number | null;
  operating_income: number | null;
  stadium_capacity: number | null;
  market_size: number | null;
  data_class: string | null;
}
// FK: team_id -> teams.team_id

/** Table `salary_cap` — 9 columns. */
export interface SalaryCap {
  team_id: string | null;
  season: number | null;
  cap_limit: number | null;
  committed: number | null;
  dead_money: number | null;
  available: number | null;
  contracts_counted: number | null;
  rollover_from_2025: number | null;
  data_class: string | null;
}
// FK: team_id -> teams.team_id
