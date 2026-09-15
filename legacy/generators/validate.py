"""Referential integrity + sanity validation. Emits database_validation_report.md."""
import csv, os, collections, datetime

D = "/mnt/user-data/outputs/dynasty_manager_pro"
def load(n):
    with open(f"{D}/{n}", encoding="utf-8") as f:
        return list(csv.DictReader(f))

T = {f[:-4]: load(f) for f in sorted(os.listdir(D)) if f.endswith(".csv")}
FAIL, WARN, PASS = [], [], []
def check(cond, msg, hard=True):
    (PASS if cond else (FAIL if hard else WARN)).append(msg)

team_ids = {r["team_id"] for r in T["teams"]}
player_ids = {r["player_id"] for r in T["players"]}
coach_ids = {r["coach_id"] for r in T["coaches"]}
college_ids = {r["college_id"] for r in T["colleges"]}
div_ids = {r["division_id"] for r in T["league_divisions"]}
conf_ids = {r["conference_id"] for r in T["league_conferences"]}

# ---- uniqueness
for tbl, key in [("players", "player_id"), ("coaches", "coach_id"), ("teams", "team_id"),
                 ("colleges", "college_id"), ("player_contracts", "contract_id"),
                 ("season_schedule", "game_id"), ("draft_picks", "pick_id"),
                 ("stadiums", "stadium_id"), ("owners", "owner_id"),
                 ("draft_classes", "prospect_id")]:
    vals = [r[key] for r in T[tbl]]
    dup = [k for k, v in collections.Counter(vals).items() if v > 1]
    check(not dup, f"{tbl}.{key} unique ({len(vals)} rows, {len(dup)} dupes)")

names = [r["display_name"] for r in T["players"]]
dupn = [k for k, v in collections.Counter(names).items() if v > 1]
check(not dupn, f"players.display_name unique ({len(dupn)} collisions)", hard=False)

# ---- foreign keys
fks = [
    ("teams", "division_id", div_ids), ("league_divisions", "conference_id", conf_ids),
    ("players", "college_id", college_ids),
    ("player_attributes", "player_id", player_ids),
    ("player_contracts", "player_id", player_ids),
    ("player_morale", "player_id", player_ids),
    ("player_traits", "player_id", player_ids),
    ("player_injuries", "player_id", player_ids),
    ("team_rosters", "player_id", player_ids), ("team_rosters", "team_id", team_ids),
    ("team_depth_charts", "player_id", player_ids), ("team_depth_charts", "team_id", team_ids),
    ("team_coaching_staff", "coach_id", coach_ids), ("team_coaching_staff", "team_id", team_ids),
    ("coach_attributes", "coach_id", coach_ids),
    ("team_schemes", "team_id", team_ids), ("franchise_finances", "team_id", team_ids),
    ("salary_cap", "team_id", team_ids), ("owner_goals", "team_id", team_ids),
    ("team_needs", "team_id", team_ids), ("stadiums", "team_id", team_ids),
    ("owners", "team_id", team_ids), ("free_agents", "player_id", player_ids),
    ("draft_picks", "original_team_id", team_ids),
    ("draft_picks", "current_owner_team_id", team_ids),
    ("draft_classes", "college_id", college_ids),
    ("season_schedule", "home_team_id", team_ids),
    ("season_schedule", "away_team_id", team_ids),
    ("team_bye_weeks", "team_id", team_ids),
]
for tbl, col, valid in fks:
    bad = [r[col] for r in T[tbl] if r[col] and r[col] not in valid]
    check(not bad, f"FK {tbl}.{col} -> valid ({len(bad)} orphans)")

# players.team_id: valid team or the FA sentinel
bad = [r["team_id"] for r in T["players"] if r["team_id"] not in team_ids | {"FA"}]
check(not bad, f"FK players.team_id -> teams|FA ({len(bad)} orphans)")

# ---- no full franchise names used where an abbreviation belongs
nicks = {r["nickname"].lower() for r in T["teams"]}
offenders = []
for tbl in ("team_rosters", "team_depth_charts", "season_schedule", "player_contracts"):
    for r in T[tbl]:
        for k, v in r.items():
            if k.endswith("team_id") and v.lower() in nicks:
                offenders.append((tbl, k))
check(not offenders, f"team_id columns use abbreviations only ({len(offenders)} violations)")
check(all(len(t) <= 3 for t in team_ids), "all team_id values are <=3 char abbreviations")

# ---- one team per player, one roster row per player
rc = collections.Counter(r["player_id"] for r in T["team_rosters"])
check(all(v == 1 for v in rc.values()),
      f"no player on two rosters ({sum(1 for v in rc.values() if v > 1)} dupes)")
ct = {r["player_id"]: r["team_id"] for r in T["player_contracts"]}
pt = {r["player_id"]: r["team_id"] for r in T["players"]}
mism = [p for p, t in ct.items() if pt.get(p) != t]
check(not mism, f"contract team matches roster team ({len(mism)} mismatches)")

# every rostered / depth-chart player exists and every active player has attributes
attr_ids = {r["player_id"] for r in T["player_attributes"]}
check(attr_ids == player_ids, f"every player has an attributes row "
      f"({len(player_ids - attr_ids)} missing)")
mor_ids = {r["player_id"] for r in T["player_morale"]}
check(mor_ids == player_ids, f"every player has a morale row ({len(player_ids - mor_ids)} missing)")

# ---- ranges
def numeric_range(tbl, cols, lo, hi, label):
    bad = 0
    for r in T[tbl]:
        for c in cols:
            v = r.get(c, "")
            if v == "" or v is None: continue
            try: x = float(v)
            except ValueError: bad += 1; continue
            if not (lo <= x <= hi): bad += 1
    check(bad == 0, f"{label} within {lo}-{hi} ({bad} out of range)")

rating_cols = [c for c in T["player_attributes"][0] if c not in ("player_id", "position", "data_class")]
numeric_range("player_attributes", rating_cols, 0, 100, "player attribute ratings")
numeric_range("players", ["overall_rating", "potential_rating"], 0, 100, "player overall/potential")
numeric_range("coach_attributes", [c for c in T["coach_attributes"][0]
                                   if c not in ("coach_id", "data_class")], 0, 100, "coach ratings")
numeric_range("players", ["age"], 20, 45, "player ages")
numeric_range("player_morale", ["morale"], 0, 100, "morale")

bad = [r for r in T["players"] if int(r["potential_rating"]) < int(r["overall_rating"])]
check(not bad, f"potential >= overall ({len(bad)} violations)")

bad = [r for r in T["player_contracts"] if int(r["end_year"]) < int(r["start_year"])]
check(not bad, f"contract end_year >= start_year ({len(bad)} violations)")

# ---- roster composition
per_team = collections.Counter(r["team_id"] for r in T["team_rosters"])
check(set(per_team.values()) == {90}, f"90 players per club (found {sorted(set(per_team.values()))})")
act = collections.Counter(r["team_id"] for r in T["team_rosters"] if r["roster_status"] == "ACTIVE")
check(set(act.values()) == {53}, f"53 active per club (found {sorted(set(act.values()))})")

# ---- schedule integrity
gp, hm = collections.Counter(), collections.Counter()
for g in T["season_schedule"]:
    gp[g["home_team_id"]] += 1; gp[g["away_team_id"]] += 1; hm[g["home_team_id"]] += 1
check(set(gp.values()) == {17}, f"17 games per club (found {sorted(set(gp.values()))})")
check(set(hm.values()) <= {8, 9}, f"8-9 home games per club (found {sorted(set(hm.values()))})")
check(len(T["season_schedule"]) == 272, f"272 total games (found {len(T['season_schedule'])})")
seen = collections.defaultdict(set)
clash = 0
for g in T["season_schedule"]:
    w = g["week"]
    for t in (g["home_team_id"], g["away_team_id"]):
        if t in seen[w]: clash += 1
        seen[w].add(t)
check(clash == 0, f"no club plays twice in a week ({clash} clashes)")
byes = {r["team_id"]: int(r["bye_week"]) for r in T["team_bye_weeks"]}
check(len(byes) == 32, "every club has exactly one bye")
check(all(5 <= w <= 14 for w in byes.values()),
      f"byes fall in weeks 5-14 ({sum(1 for w in byes.values() if not 5 <= w <= 14)} outside)")
bad = sum(1 for g in T["season_schedule"]
          for t in (g["home_team_id"], g["away_team_id"]) if byes[t] == int(g["week"]))
check(bad == 0, f"no club plays during its bye ({bad} violations)")
check(all(g["home_team_id"] != g["away_team_id"] for g in T["season_schedule"]),
      "no club scheduled against itself")

# ---- depth charts
starters = collections.Counter((r["team_id"], r["slot"]) for r in T["team_depth_charts"]
                               if r["is_starter"] == "1")
check(all(v == 1 for v in starters.values()),
      f"exactly one starter per slot ({sum(1 for v in starters.values() if v != 1)} bad slots)")
inactive = {r["player_id"] for r in T["team_rosters"] if r["roster_status"] != "ACTIVE"}
bad = [r for r in T["team_depth_charts"] if r["player_id"] in inactive]
check(not bad, f"depth charts only use active-roster players ({len(bad)} violations)")
xteam = [r for r in T["team_depth_charts"] if pt.get(r["player_id"]) != r["team_id"]]
check(not xteam, f"depth chart players belong to that club ({len(xteam)} violations)")

# ---- coaching staff
hc = collections.Counter(r["team_id"] for r in T["team_coaching_staff"] if r["role"] == "Head Coach")
check(set(hc.values()) == {1}, f"exactly one head coach per club (found {sorted(set(hc.values()))})")
assigned = collections.Counter(r["coach_id"] for r in T["team_coaching_staff"])
check(all(v == 1 for v in assigned.values()), "no coach assigned to two clubs")

# ---- cap sanity
bad = []
for r in T["salary_cap"]:
    if float(r["available"]) < -20e6 or float(r["available"]) > 90e6:
        bad.append(r["team_id"])
check(not bad, f"cap space in a plausible band ({len(bad)} clubs outside -$20M..+$90M)")

# ---- no real people
check(all(r["contains_real_people"] == "NO" for r in T["data_provenance"]),
      "provenance declares no real individuals in any table")
check(all(r["prospect_class"] == "FICTIONAL_GENERATED_PROSPECT" for r in T["draft_classes"]),
      "all future prospects flagged as generated, never presented as real")

# ---- nulls
nullreport = []
for name, rows in T.items():
    for col in rows[0]:
        n = sum(1 for r in rows if r[col] == "")
        if n:
            nullreport.append((name, col, n, len(rows)))

status = "FAIL" if FAIL else ("PASS WITH WARNINGS" if WARN else "PASS")
L = []
L.append("# Dynasty Manager Pro - Database Validation Report\n")
L.append(f"Generated {datetime.date.today().isoformat()}  \n**Overall result: {status}**\n")
L.append(f"- Checks passed: **{len(PASS)}**\n- Warnings: **{len(WARN)}**\n- Failures: **{len(FAIL)}**\n")
L.append("\n## Table inventory\n\n| File | Rows | Columns |\n|---|---:|---:|")
for n in sorted(T):
    L.append(f"| {n}.csv | {len(T[n]):,} | {len(T[n][0])} |")
L.append(f"\n**Total rows: {sum(len(v) for v in T.values()):,}** across {len(T)} tables\n")
if FAIL:
    L.append("\n## Failures\n")
    L += [f"- {m}" for m in FAIL]
if WARN:
    L.append("\n## Warnings\n")
    L += [f"- {m}" for m in WARN]
L.append("\n## Passed checks\n")
L += [f"- {m}" for m in PASS]
L.append("\n## Intentional nulls\n")
L.append("Blank cells are deliberate: position-specific attribute columns are null for "
         "positions they do not apply to, undrafted players carry no draft round or pick, "
         "and free agents carry no jersey number or depth rank. No value was invented to "
         "fill a column.\n")
L.append("| File | Column | Blank | Of |\n|---|---|---:|---:|")
for n, c, k, tot in sorted(nullreport, key=lambda x: -x[2])[:22]:
    L.append(f"| {n}.csv | {c} | {k:,} | {tot:,} |")
open(f"{D}/database_validation_report.md", "w").write("\n".join(L))

print(f"{status}: {len(PASS)} passed, {len(WARN)} warnings, {len(FAIL)} failures")
for m in FAIL: print("  FAIL:", m)
for m in WARN: print("  WARN:", m)
