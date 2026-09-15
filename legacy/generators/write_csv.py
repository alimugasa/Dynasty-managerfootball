"""Emit all import-ready CSVs (UTF-8, comma-delimited, quoted where needed)."""
import csv, json, os
from ref_data import TEAMS, STADIUMS, DIVISIONS, CONFERENCES, CAP_2026, SEASON

OUT = "/mnt/user-data/outputs/dynasty_manager_pro"
os.makedirs(OUT, exist_ok=True)
B = "/home/claude/dmp/build"
S1 = json.load(open(f"{B}/_stage1.json"))
S2 = json.load(open(f"{B}/_stage2.json"))

def write(name, rows, cols=None):
    if not rows:
        print(f"  !! {name} EMPTY"); return 0
    cols = cols or list(rows[0].keys())
    with open(f"{OUT}/{name}", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols, quoting=csv.QUOTE_MINIMAL,
                           extrasaction="ignore", restval="")
        w.writeheader()
        w.writerows(rows)
    print(f"  {name:<32} {len(rows):>6} rows")
    return len(rows)

counts = {}
print("Writing CSVs ->", OUT)

counts["league_conferences.csv"] = write("league_conferences.csv", [
    {"conference_id": c, "name": n, "league_id": "DMP", "data_class": "GENERATED"}
    for c, n in CONFERENCES])

counts["league_divisions.csv"] = write("league_divisions.csv", [
    {"division_id": d, "conference_id": c, "name": f"{c} {n}", "region": n,
     "data_class": "GENERATED"} for d, c, n in DIVISIONS])

counts["teams.csv"] = write("teams.csv", [
    {"team_id": t, "metro_area": m, "nickname": nk, "division_id": d,
     "conference_id": d.split("-")[0], "primary_color": c1, "secondary_color": c2,
     "founded_year": fy, "market_size": mk,
     "stadium_id": f"STD_{t}", "owner_id": next(o["owner_id"] for o in S2["owners"] if o["team_id"] == t),
     "data_class": "GENERATED"}
    for (t, m, nk, d, c1, c2, fy, mk) in TEAMS])

counts["stadiums.csv"] = write("stadiums.csv", [
    {"stadium_id": f"STD_{t}", "team_id": t, "name": n, "capacity": cap, "roof_type": roof,
     "surface": surf, "opened_year": yr, "city": city, "state": st, "data_class": "GENERATED"}
    for (t, n, cap, roof, surf, yr, city, st) in STADIUMS])

counts["owners.csv"] = write("owners.csv", S2["owners"])
counts["colleges.csv"] = write("colleges.csv", S1["colleges"])

PCOLS = ["player_id", "display_name", "team_id", "position", "position_group", "jersey_number",
         "height_inches", "weight_lbs", "age", "experience_years", "college_id", "college_name",
         "draft_year", "draft_round", "draft_pick_in_round", "draft_overall_pick", "draft_status",
         "rookie_flag", "roster_status", "designation", "depth_rank", "role_tier",
         "overall_rating", "potential_rating", "data_class"]
counts["players.csv"] = write("players.csv", S2["players"], PCOLS)

acols = list(S2["attrs"][0].keys())
counts["player_attributes.csv"] = write("player_attributes.csv", S2["attrs"], acols)
counts["player_contracts.csv"] = write("player_contracts.csv", S1["contracts"])
counts["player_morale.csv"] = write("player_morale.csv", S2["morale"])
counts["player_traits.csv"] = write("player_traits.csv", S1["traits"])
counts["player_injuries.csv"] = write("player_injuries.csv", S1["injuries"])
counts["team_rosters.csv"] = write("team_rosters.csv", S1["rosters"])
counts["team_depth_charts.csv"] = write("team_depth_charts.csv", S2["depth"])
counts["coaches.csv"] = write("coaches.csv", S2["coaches"])
counts["coach_attributes.csv"] = write("coach_attributes.csv", S2["coach_attrs"])
counts["team_coaching_staff.csv"] = write("team_coaching_staff.csv", S2["staff"])
counts["team_schemes.csv"] = write("team_schemes.csv", S2["schemes"])
counts["season_schedule.csv"] = write("season_schedule.csv", S2["sched"])
counts["team_bye_weeks.csv"] = write("team_bye_weeks.csv", S2["byes"])
counts["free_agents.csv"] = write("free_agents.csv", S2["free_agents"])
counts["draft_picks.csv"] = write("draft_picks.csv", S2["draft_picks"])
counts["draft_classes.csv"] = write("draft_classes.csv", S2["draft_class"])
counts["franchise_finances.csv"] = write("franchise_finances.csv", S2["finances"])
counts["salary_cap.csv"] = write("salary_cap.csv", S2["cap_rows"])
counts["team_needs.csv"] = write("team_needs.csv", S2["team_needs"])
counts["owner_goals.csv"] = write("owner_goals.csv", S2["owner_goals"])

PROV = [
 ("league_conferences.csv", "GENERATED", "Original league structure"),
 ("league_divisions.csv", "GENERATED", "Original league structure"),
 ("teams.csv", "GENERATED", "Real metro areas; original nicknames, colors, identities"),
 ("stadiums.csv", "GENERATED", "Original venue names; capacities modeled on real stadium size bands"),
 ("owners.csv", "GENERATED", "Fictional owners; archetypes drive sim behavior"),
 ("colleges.csv", "GENERATED", "Fictional programs with talent tiers and pipeline rates"),
 ("players.csv", "GENERATED", "Fictional people; roster shape modeled on a 90-man preseason"),
 ("player_attributes.csv", "MODELED", "Derived from overall rating + positional archetype"),
 ("player_contracts.csv", "MODELED", "Market curve by position value, normalized to the cap"),
 ("player_morale.csv", "MODELED", "Derived from role tier, contract, and experience"),
 ("player_traits.csv", "MODELED", "Sampled behavioral tags"),
 ("player_injuries.csv", "MODELED", "Preseason designation distribution"),
 ("team_rosters.csv", "GENERATED", "53 active / 16 PS-eligible / 21 camp per club"),
 ("team_depth_charts.csv", "MODELED", "Scheme-aware slot assignment by rating"),
 ("coaches.csv", "GENERATED", "Fictional staff plus an unemployed hiring market"),
 ("coach_attributes.csv", "MODELED", "Role-shaped ratings"),
 ("team_coaching_staff.csv", "GENERATED", "15 roles per club"),
 ("team_schemes.csv", "MODELED", "Offensive/defensive identity and tendencies"),
 ("season_schedule.csv", "GENERATED", "17 games/team over 18 weeks via edge-colouring"),
 ("team_bye_weeks.csv", "GENERATED", "Derived from schedule solution"),
 ("free_agents.csv", "GENERATED", "Unsigned veteran pool"),
 ("draft_picks.csv", "GENERATED", "2027-2028 pick inventory with trades"),
 ("draft_classes.csv", "GENERATED", "FICTIONAL_GENERATED_PROSPECT - not real people"),
 ("franchise_finances.csv", "MODELED", "Revenue scaled by market size and venue capacity"),
 ("salary_cap.csv", "MODELED", "Top-51 accounting against a $302M cap"),
 ("team_needs.csv", "MODELED", "Computed from weakest starter slots"),
 ("owner_goals.csv", "MODELED", "Derived from franchise posture"),
]
counts["data_provenance.csv"] = write("data_provenance.csv", [
    {"file": f, "data_class": dc, "notes": n,
     "row_count": counts.get(f, 0), "contains_real_people": "NO"} for f, dc, n in PROV])

json.dump(counts, open(f"{B}/_counts.json", "w"))
print(f"\ntotal rows: {sum(counts.values()):,}")
