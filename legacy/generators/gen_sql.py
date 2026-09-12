"""Emit Postgres/Supabase DDL inferred from the CSVs, with explicit FK constraints."""
import csv, os

D = "/mnt/user-data/outputs/dynasty_manager_pro"
# teams must exist before owners/stadiums, which carry FKs back to it
ORDER = ["league_conferences", "league_divisions", "teams", "owners", "stadiums", "colleges",
         "coaches", "coach_attributes", "team_coaching_staff", "team_schemes",
         "players", "player_attributes", "player_contracts", "player_morale",
         "player_traits", "player_injuries", "team_rosters", "team_depth_charts",
         "season_schedule", "team_bye_weeks", "free_agents", "draft_picks", "draft_classes",
         "franchise_finances", "salary_cap", "team_needs", "owner_goals", "data_provenance"]
PK = {"league_conferences": "conference_id", "league_divisions": "division_id",
      "teams": "team_id", "stadiums": "stadium_id", "owners": "owner_id",
      "colleges": "college_id", "players": "player_id", "coaches": "coach_id",
      "player_contracts": "contract_id", "season_schedule": "game_id",
      "draft_picks": "pick_id", "draft_classes": "prospect_id",
      "player_attributes": "player_id", "player_morale": "player_id",
      "coach_attributes": "coach_id"}
FK = {
    "league_divisions": [("conference_id", "league_conferences", "conference_id")],
    "teams": [("division_id", "league_divisions", "division_id")],
    "players": [("college_id", "colleges", "college_id")],
    "player_attributes": [("player_id", "players", "player_id")],
    "player_contracts": [("player_id", "players", "player_id"), ("team_id", "teams", "team_id")],
    "player_morale": [("player_id", "players", "player_id")],
    "player_traits": [("player_id", "players", "player_id")],
    "player_injuries": [("player_id", "players", "player_id"), ("team_id", "teams", "team_id")],
    "team_rosters": [("player_id", "players", "player_id"), ("team_id", "teams", "team_id")],
    "team_depth_charts": [("player_id", "players", "player_id"), ("team_id", "teams", "team_id")],
    "coach_attributes": [("coach_id", "coaches", "coach_id")],
    "team_coaching_staff": [("coach_id", "coaches", "coach_id"), ("team_id", "teams", "team_id")],
    "team_schemes": [("team_id", "teams", "team_id")],
    "season_schedule": [("home_team_id", "teams", "team_id"), ("away_team_id", "teams", "team_id")],
    "team_bye_weeks": [("team_id", "teams", "team_id")],
    "free_agents": [("player_id", "players", "player_id")],
    "draft_picks": [("original_team_id", "teams", "team_id"),
                    ("current_owner_team_id", "teams", "team_id")],
    "draft_classes": [("college_id", "colleges", "college_id")],
    "franchise_finances": [("team_id", "teams", "team_id")],
    "salary_cap": [("team_id", "teams", "team_id")],
    "team_needs": [("team_id", "teams", "team_id")],
    "owner_goals": [("team_id", "teams", "team_id")],
    "owners": [("team_id", "teams", "team_id")],
    "stadiums": [("team_id", "teams", "team_id")],
}
MONEY = ("_value", "salary", "bonus", "cap_hit", "cap_space", "salary_cap", "dead_cap",
         "revenue", "expenses", "income", "_spend", "money", "_aav", "available",
         "committed", "rollover", "musd", "asking")
NOT_MONEY = {"stadium_capacity", "capacity", "target_value", "spending_willingness",
             "cap_limit", "contracts_counted"}

def infer(col, vals):
    v = [x for x in vals if x != ""]
    if not v: return "text"
    if col not in NOT_MONEY and any(k in col for k in MONEY): return "bigint"
    try:
        [int(x) for x in v]
        return "integer"
    except ValueError:
        pass
    try:
        [float(x) for x in v]
        return "numeric"
    except ValueError:
        pass
    if col.endswith("_date"): return "date"
    return "text"

out = ["-- Dynasty Manager Pro - Postgres / Supabase schema",
       "-- Run this file, then import the CSVs in the order the tables appear below.",
       "-- All identifiers are original; no real person appears in this database.", ""]
for t in ORDER:
    rows = list(csv.DictReader(open(f"{D}/{t}.csv", encoding="utf-8")))
    cols = list(rows[0].keys())
    defs = []
    for c in cols:
        typ = infer(c, [r[c] for r in rows])
        pk = " primary key" if PK.get(t) == c else ""
        defs.append(f'  "{c}" {typ}{pk}')
    for col, rt, rc in FK.get(t, []):
        defs.append(f'  , constraint fk_{t}_{col} foreign key ("{col}") references "{rt}"("{rc}")')
    body = ",\n".join(d for d in defs if not d.startswith("  , "))
    cons = "\n".join(d for d in defs if d.startswith("  , "))
    out.append(f'create table if not exists "{t}" (\n{body}' + (f"\n{cons}" if cons else "") + "\n);\n")

out.append("-- Indexes for the queries a franchise sim actually runs")
for tbl, col in [("team_rosters", "team_id"), ("team_depth_charts", "team_id"),
                 ("player_contracts", "team_id"), ("players", "team_id"),
                 ("players", "position"), ("season_schedule", "week"),
                 ("season_schedule", "home_team_id"), ("team_coaching_staff", "team_id"),
                 ("player_traits", "player_id"), ("draft_picks", "current_owner_team_id")]:
    out.append(f'create index if not exists idx_{tbl}_{col} on "{tbl}" ("{col}");')

out += ["", "-- Standings view, refreshed as results are written back to season_schedule",
        """create or replace view v_standings as
select t.team_id, t.metro_area, t.nickname, t.division_id, t.conference_id,
       count(*) filter (where g.status = 'FINAL') as games_played,
       count(*) filter (where g.status = 'FINAL' and
             ((g.home_team_id = t.team_id and g.home_score > g.away_score) or
              (g.away_team_id = t.team_id and g.away_score > g.home_score))) as wins,
       count(*) filter (where g.status = 'FINAL' and
             ((g.home_team_id = t.team_id and g.home_score < g.away_score) or
              (g.away_team_id = t.team_id and g.away_score < g.home_score))) as losses
from teams t
left join season_schedule g
       on t.team_id in (g.home_team_id, g.away_team_id)
group by t.team_id, t.metro_area, t.nickname, t.division_id, t.conference_id;"""]

open(f"{D}/schema_supabase.sql", "w", encoding="utf-8").write("\n".join(out))
print(f"schema_supabase.sql written ({len(ORDER)} tables)")
print("import order:", " -> ".join(ORDER[:6]), "-> ...")
