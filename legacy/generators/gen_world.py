"""Coaches, schemes, depth charts, schedule, draft, free agency, finances, goals."""
import csv, os, json, math, random, datetime as dt
import numpy as np
from ref_data import (TEAMS, STADIUMS, DIVISIONS, CONFERENCES, CAP_2026, SEASON,
                      OWNER_FIRST, OWNER_LAST, OWNER_ARCHETYPES)
from names import FIRST, LAST, COACH_FIRST
from gen_players import (POS, HT_WT, UNIV, POS_ATTRS, ALL_POS_ATTRS, ATHLETIC_OFFSET,
                         MAX_AAV, vet_min, make_name)

OUT = "/home/claude/dmp/build"
rng = np.random.default_rng(99026)
pyrng = random.Random(99026)
S = json.load(open(f"{OUT}/_stage1.json"))
players, attrs, contracts, morale = S["players"], S["attrs"], S["contracts"], S["morale"]
rosters, injuries, traits = S["rosters"], S["injuries"], S["traits"]
COLLEGES, team_talent = S["colleges"], S["team_talent"]
TEAM_IDS = [t[0] for t in TEAMS]
DIV_OF = {t[0]: t[3] for t in TEAMS}
CONF_OF = {t[0]: t[3].split("-")[0] for t in TEAMS}
by_team = {}
for p in players:
    by_team.setdefault(p["team_id"], []).append(p)

# ================================================================ 1. OWNERS
owners = []
for i, (tid, metro, nick, div, c1, c2, founded, mkt) in enumerate(TEAMS):
    label, patience, spending, meddling, winnow = OWNER_ARCHETYPES[i % len(OWNER_ARCHETYPES)]
    owners.append({
        "owner_id": f"OWN{i+1:02d}", "team_id": tid,
        "owner_name": f"{OWNER_FIRST[i]} {OWNER_LAST[i]}",
        "ownership_type": str(rng.choice(["Individual", "Family Trust", "Investment Group"],
                                         p=[.5, .3, .2])),
        "archetype": label,
        "tenure_years": int(rng.integers(1, 34)),
        "patience": int(np.clip(patience + rng.normal(0, 7), 1, 100)),
        "spending_willingness": int(np.clip(spending + rng.normal(0, 7), 1, 100)),
        "meddling": int(np.clip(meddling + rng.normal(0, 8), 1, 100)),
        "win_now_bias": round(float(np.clip(winnow + rng.normal(0, .07), .05, .98)), 2),
        "market_size": mkt, "franchise_value_musd": int(np.clip(rng.normal(4200 + mkt * 380, 500), 2200, 9200)),
        "data_class": "GENERATED",
    })

# ================================================================ 2. SCHEMES
OFF_SCHEMES = [("Wide Zone Play-Action", "run", .58), ("Air Raid Spread", "pass", .30),
               ("Gap-Scheme Power", "run", .62), ("West Coast Timing", "pass", .40),
               ("Vertical Spread", "pass", .34), ("Pistol RPO", "balanced", .50),
               ("Condensed Pro Style", "balanced", .52), ("Shanahan Outside Zone", "run", .56)]
DEF_SCHEMES = [("4-3 Over Cover 3", "4-3"), ("3-4 Two-Gap", "3-4"), ("Nickel Quarters", "4-3"),
               ("Multiple Amoeba Front", "3-4"), ("4-2-5 Cover 2 Match", "4-3"),
               ("3-3-5 Odd Stack", "3-4"), ("Blitz-Heavy Man Pressure", "3-4"),
               ("Wide-9 Attack Front", "4-3")]

schemes = []
for i, tid in enumerate(TEAM_IDS):
    o = OFF_SCHEMES[int(rng.integers(0, len(OFF_SCHEMES)))]
    d = DEF_SCHEMES[int(rng.integers(0, len(DEF_SCHEMES)))]
    schemes.append({
        "team_id": tid, "offensive_scheme": o[0], "offensive_identity": o[1],
        "run_pass_balance": round(float(np.clip(o[2] + rng.normal(0, .04), .2, .75)), 2),
        "tempo": str(rng.choice(["Huddle", "Mixed", "Up-Tempo"], p=[.3, .5, .2])),
        "defensive_scheme": d[0], "base_front": d[1],
        "coverage_tendency": str(rng.choice(["Zone-Heavy", "Man-Heavy", "Balanced"], p=[.42, .28, .30])),
        "blitz_rate": round(float(np.clip(rng.normal(.26, .07), .10, .48)), 2),
        "fourth_down_aggression": int(np.clip(rng.normal(52, 18), 5, 99)),
        "data_class": "MODELED",
    })
SCHEME_OF = {s["team_id"]: s for s in schemes}

# ================================================================ 3. COACHES
COACH_ROLES = ["Head Coach", "Offensive Coordinator", "Defensive Coordinator",
               "Special Teams Coordinator", "Assistant Head Coach", "Quarterbacks Coach",
               "Running Backs Coach", "Wide Receivers Coach", "Tight Ends Coach",
               "Offensive Line Coach", "Defensive Line Coach", "Outside Linebackers Coach",
               "Linebackers Coach", "Defensive Backs Coach", "Strength & Conditioning"]
COACH_ATTR = ["play_calling", "game_management", "player_development", "talent_evaluation",
              "leadership", "adaptability", "aggressiveness", "discipline", "motivation",
              "staff_management", "scheme_innovation", "clock_management"]

coaches, staff, coach_attrs = [], [], []
cid = 0
def new_coach(role, tid, level_bias):
    global cid
    cid += 1
    c_id = f"CCH{cid:04d}"
    name = f"{pyrng.choice(COACH_FIRST)} {pyrng.choice(LAST)}"
    exp = int(np.clip(rng.gamma(3.2, 3.4) + (6 if role == "Head Coach" else 0), 1, 42))
    age = int(np.clip(30 + exp * 0.85 + rng.normal(4, 4), 28, 74))
    tree = str(rng.choice(["Offensive", "Defensive", "Special Teams", "Front Office"],
                          p=[.42, .42, .10, .06]))
    base = np.clip(rng.normal(58 + level_bias + min(exp, 25) * 0.55, 9), 25, 96)
    coaches.append({
        "coach_id": c_id, "display_name": name, "team_id": tid, "role": role,
        "age": age, "years_experience": exp, "coaching_tree": tree,
        "prior_head_coach": 1 if (role != "Head Coach" and exp > 14 and rng.random() < .18) else 0,
        "contract_years_remaining": int(rng.integers(1, 5)),
        "hot_seat_rating": int(np.clip(rng.normal(35, 18), 1, 99)),
        "overall_rating": int(base), "data_class": "GENERATED",
    })
    row = {"coach_id": c_id}
    for a in COACH_ATTR:
        row[a] = int(np.clip(rng.normal(base, 9), 15, 99))
    # role-consistent shaping
    if role == "Head Coach":
        for a in ("leadership", "staff_management", "game_management", "clock_management"):
            row[a] = int(np.clip(row[a] + 8, 15, 99))
    if "Coordinator" in role:
        row["play_calling"] = int(np.clip(row["play_calling"] + 9, 15, 99))
        row["scheme_innovation"] = int(np.clip(row["scheme_innovation"] + 6, 15, 99))
    if role not in ("Head Coach",) and "Coordinator" not in role:
        row["player_development"] = int(np.clip(row["player_development"] + 7, 15, 99))
        row["play_calling"] = int(np.clip(row["play_calling"] - 12, 15, 99))
    row["data_class"] = "MODELED"
    coach_attrs.append(row)
    return c_id

for tid in TEAM_IDS:
    tt = team_talent[tid]
    for role in COACH_ROLES:
        bias = (12 + tt * 5) if role == "Head Coach" else (6 + tt * 3) if "Coordinator" in role else tt * 2
        c_id = new_coach(role, tid, bias)
        staff.append({
            "team_id": tid, "coach_id": c_id, "role": role,
            "side_of_ball": ("Offense" if role in ("Offensive Coordinator", "Quarterbacks Coach",
                             "Running Backs Coach", "Wide Receivers Coach", "Tight Ends Coach",
                             "Offensive Line Coach") else
                             "Defense" if role in ("Defensive Coordinator", "Defensive Line Coach",
                             "Linebackers Coach", "Outside Linebackers Coach", "Defensive Backs Coach")
                             else "Special Teams" if "Special" in role else "Staff"),
            "years_with_team": int(rng.integers(1, 9)),
            "play_calling_duty": 1 if role in ("Offensive Coordinator", "Defensive Coordinator") else 0,
            "data_class": "GENERATED",
        })
# free-agent coaching market for in-sim hiring
for _ in range(46):
    new_coach(str(rng.choice(["Head Coach", "Offensive Coordinator", "Defensive Coordinator",
                              "Quarterbacks Coach", "Defensive Backs Coach"])), "", -4)

# ================================================================ 4. DEPTH CHARTS
SLOTS_OFF = [("QB", "QB", 3), ("RB", "RB", 3), ("FB", "FB", 1), ("WR_X", "WR", 3),
             ("WR_Z", "WR", 3), ("WR_SLOT", "WR", 2), ("TE_Y", "TE", 2), ("TE_F", "TE", 2),
             ("LT", "OT", 2), ("LG", "OG", 2), ("C", "C", 2), ("RG", "OG", 2), ("RT", "OT", 2)]
SLOTS_43 = [("LDE", "EDGE", 2), ("RDE", "EDGE", 2), ("DT_3T", "DT", 2), ("DT_1T", "DT", 2),
            ("SAM", "LB", 2), ("MIKE", "LB", 2), ("WILL", "LB", 2)]
SLOTS_34 = [("LDE", "DT", 2), ("NT", "DT", 2), ("RDE", "DT", 2), ("LOLB", "EDGE", 2),
            ("ROLB", "EDGE", 2), ("ILB_MIKE", "LB", 2), ("ILB_WILL", "LB", 2)]
SLOTS_DB = [("CB_1", "CB", 2), ("CB_2", "CB", 2), ("NICKEL", "CB", 2), ("FS", "S", 2), ("SS", "S", 2)]
SLOTS_ST = [("K", "K", 1), ("P", "P", 1), ("LS", "LS", 1), ("KR", "WR", 2),
            ("PR", "WR", 2), ("GUNNER", "S", 2)]

depth = []
for tid in TEAM_IDS:
    pool = {}
    for p in sorted(by_team[tid], key=lambda x: -x["overall_rating"]):
        if p["roster_status"] != "ACTIVE":
            continue
        pool.setdefault(p["position"], []).append(p)
    front = SCHEME_OF[tid]["base_front"]
    slot_defs = SLOTS_OFF + (SLOTS_34 if front == "3-4" else SLOTS_43) + SLOTS_DB + SLOTS_ST
    assigned_starter = set()
    for slot, pos, n in slot_defs:
        cands = [p for p in pool.get(pos, [])]
        if not cands:
            continue
        # avoid handing one player two starting jobs on the same side
        fresh = [p for p in cands if p["player_id"] not in assigned_starter]
        order = (fresh + [c for c in cands if c not in fresh])[:n]
        for i, p in enumerate(order):
            if i == 0:
                assigned_starter.add(p["player_id"])
            depth.append({
                "team_id": tid, "unit": ("Offense" if (slot, pos, n) in SLOTS_OFF else
                                         "Special Teams" if (slot, pos, n) in SLOTS_ST else "Defense"),
                "slot": slot, "slot_position": pos, "depth_order": i + 1,
                "player_id": p["player_id"], "player_position": p["position"],
                "is_starter": 1 if i == 0 else 0, "data_class": "MODELED",
            })

# ================================================================ 5. SCHEDULE
div_teams = {d[0]: [t[0] for t in TEAMS if t[3] == d[0]] for d in DIVISIONS}
# prior-season finish order drives the rank-based matchups
prior_rank = {}
for d, tl in div_teams.items():
    for r, tid in enumerate(sorted(tl, key=lambda x: -team_talent[x]), start=1):
        prior_rank[tid] = r

AC = ["AC-E", "AC-N", "AC-S", "AC-W"]
NC = ["NC-E", "NC-N", "NC-S", "NC-W"]
# intra-conference rotation must be a perfect MATCHING (each division has exactly
# one partner), otherwise every division picks up two rotations and teams get 21 games.
rot_intra = {AC[0]: AC[1], AC[1]: AC[0], AC[2]: AC[3], AC[3]: AC[2],
             NC[0]: NC[1], NC[1]: NC[0], NC[2]: NC[3], NC[3]: NC[2]}
rot_inter = {AC[i]: NC[i] for i in range(4)} | {NC[i]: AC[i] for i in range(4)}
# the remaining two same-conference divisions supply the rank-based games
extra_intra = {d: [x for x in (AC if d in AC else NC) if x != d and x != rot_intra[d]]
               for d in AC + NC}
extra_inter = {AC[i]: NC[(i + 1) % 4] for i in range(4)} | {NC[i]: AC[(i + 1) % 4] for i in range(4)}

games = set()
def add(a, b):
    games.add(tuple(sorted((a, b))) + (len([g for g in games if set(g[:2]) == {a, b}]),))

pairs = []                                   # (teamA, teamB) unordered, may repeat for div
for d, tl in div_teams.items():              # divisional home-and-home
    for i in range(len(tl)):
        for j in range(i + 1, len(tl)):
            pairs.append((tl[i], tl[j])); pairs.append((tl[j], tl[i]))
done_rot = set()
for d in AC + NC:                            # intra-conf division rotation (4 games)
    o = rot_intra[d]
    if (o, d) in done_rot: continue
    done_rot.add((d, o))
    for i, a in enumerate(div_teams[d]):
        for j, b in enumerate(div_teams[o]):
            pairs.append((a, b) if (i + j) % 2 == 0 else (b, a))
done_int = set()
for d in AC:                                 # inter-conference rotation (4 games)
    o = rot_inter[d]
    done_int.add((d, o))
    for i, a in enumerate(div_teams[d]):
        for j, b in enumerate(div_teams[o]):
            pairs.append((a, b) if (i + j) % 2 == 0 else (b, a))
for d in AC + NC:                            # 2 intra-conf rank games
    for od in extra_intra[d]:
        if d > od: continue
        for a in div_teams[d]:
            b = next(x for x in div_teams[od] if prior_rank[x] == prior_rank[a])
            pairs.append((a, b) if prior_rank[a] % 2 == 0 else (b, a))
for d in AC:                                 # 17th game, inter-conference rank matchup
    od = extra_inter[d]
    for a in div_teams[d]:
        b = next(x for x in div_teams[od] if prior_rank[x] == prior_rank[a])
        pairs.append((a, b) if prior_rank[a] % 2 else (b, a))

cnt = {t: 0 for t in TEAM_IDS}
for a, b in pairs:
    cnt[a] += 1; cnt[b] += 1
assert all(v == 17 for v in cnt.values()), sorted(set(cnt.values()))
assert len(pairs) == 272, len(pairs)

# balance home games to 8 or 9
home_ct = {t: 0 for t in TEAM_IDS}
for a, b in pairs: home_ct[a] += 1
for _ in range(4000):
    hi = [t for t in TEAM_IDS if home_ct[t] > 9]
    lo = [t for t in TEAM_IDS if home_ct[t] < 8]
    if not hi or not lo: break
    for i, (a, b) in enumerate(pairs):
        if a in hi and b in lo:
            pairs[i] = (b, a); home_ct[a] -= 1; home_ct[b] += 1
            break
    else:
        break

# Assign weeks. Each team plays 17 games across 18 weeks, so its bye is simply the
# one week it has no game -- an edge-colouring problem. Greedy placement paints itself
# into a corner, so we use min-conflicts local search with a soft penalty pushing every
# bye into the legal weeks 5-14 window.
WEEKS = list(range(1, 19))
BYE_OK = set(range(5, 15))

def solve_weeks(pairs, seed, want_bye):
    r = random.Random(seed)
    PEN = 5          # cost of scheduling a game in a team's intended bye week
    wk = [r.choice(WEEKS) for _ in pairs]
    load = {(t, w): 0 for t in TEAM_IDS for w in WEEKS}
    for (a, b), w in zip(pairs, wk):
        load[(a, w)] += 1; load[(b, w)] += 1

    def clashes(i, w):
        a, b = pairs[i]
        return max(0, load[(a, w)] - 1) + max(0, load[(b, w)] - 1)

    for it in range(400_000):
        bad = [i for i in range(len(pairs)) if clashes(i, wk[i]) > 0]
        if not bad:
            break
        i = r.choice(bad)
        a, b = pairs[i]; cur = wk[i]
        load[(a, cur)] -= 1; load[(b, cur)] -= 1
        best, bestc = [], 999
        for w in WEEKS:
            c = load[(a, w)] + load[(b, w)]
            c += PEN * ((want_bye[a] == w) + (want_bye[b] == w))
            if c < bestc:
                bestc, best = c, [w]
            elif c == bestc:
                best.append(w)
            # tiny nudge so free weeks (byes) drift into the legal window
        w = r.choice(best) if r.random() > 0.06 else r.choice(WEEKS)
        wk[i] = w; load[(a, w)] += 1; load[(b, w)] += 1
    else:
        return None
    byes = {}
    for t in TEAM_IDS:
        free = [w for w in WEEKS if load[(t, w)] == 0]
        if len(free) != 1:
            return None
        byes[t] = free[0]
    return wk, byes

# Pre-assign intended byes with an EVEN count per week (a week with b byes hosts
# (32-b)/2 games, so odd counts are structurally impossible).
bye_plan, _order = {}, list(TEAM_IDS)
best_sol, best_score = None, -1
for seed in range(80):
    r0 = random.Random(7000 + seed)
    r0.shuffle(_order)
    counts = [4, 4, 4, 4, 4, 4, 2, 2, 2, 2]      # sums to 32 across weeks 5-14
    r0.shuffle(counts)
    slots = []
    for w, c in zip(range(5, 15), counts):
        slots += [w] * c
    want = {t: w for t, w in zip(_order, slots)}
    sol = solve_weeks(pairs, 4000 + seed, want)
    if not sol:
        continue
    score = sum(w in BYE_OK for w in sol[1].values())
    if score > best_score:
        best_score, best_sol = score, sol
    if score == 32:
        break
sol = best_sol
assert sol, "week assignment failed"
wk, bye_weeks = sol
placed = [(a, b, w) for (a, b), w in zip(pairs, wk)]
sched = []
out_of_window = [t for t, w in bye_weeks.items() if w not in BYE_OK]
print(f"  byes outside weeks 5-14: {len(out_of_window)}")

WK1 = dt.date(2026, 9, 10)
gid = 0
for a, b, w in sorted(placed, key=lambda x: x[2]):
    gid += 1
    base = WK1 + dt.timedelta(days=7 * (w - 1))
    roll = rng.random()
    if roll < .06:   day, kick = base, "20:15"                       # Thursday
    elif roll < .12: day, kick = base + dt.timedelta(days=4), "20:20" # Monday
    elif roll < .22: day, kick = base + dt.timedelta(days=3), "20:20" # Sunday night
    elif roll < .55: day, kick = base + dt.timedelta(days=3), "13:00"
    else:            day, kick = base + dt.timedelta(days=3), "16:05"
    st = next(s for s in STADIUMS if s[0] == a)
    sched.append({
        "game_id": f"G{SEASON}W{w:02d}{gid:03d}", "season": SEASON, "week": w,
        "game_date": day.isoformat(), "kickoff_local": kick,
        "home_team_id": a, "away_team_id": b, "venue": st[1], "venue_city": st[6],
        "roof": st[3], "surface": st[4],
        "divisional_game": 1 if DIV_OF[a] == DIV_OF[b] else 0,
        "conference_game": 1 if CONF_OF[a] == CONF_OF[b] else 0,
        "primetime": 1 if kick in ("20:15", "20:20") else 0,
        "status": "SCHEDULED", "home_score": "", "away_score": "", "data_class": "GENERATED",
    })
byes = [{"season": SEASON, "team_id": t, "bye_week": w} for t, w in bye_weeks.items()]

# ================================================================ 6. FREE AGENTS
free_agents, fa_players, fa_attrs, fa_morale = [], [], [], []
POS_LIST = list(POS.keys())
for i in range(186):
    pos = str(rng.choice(POS_LIST, p=np.array([POS[p][1] for p in POS_LIST]) / 90))
    ov = int(np.clip(rng.normal(64, 7), 42, 88))
    exp = int(np.clip(rng.gamma(2.8, 2.3), 1, 16))
    age = int(np.clip(22 + exp + rng.integers(0, 3), 23, 39))
    pid = f"FA_{pos}_{i+1:03d}"
    name = make_name()
    col = COLLEGES[int(rng.integers(0, len(COLLEGES)))]
    h_m, h_s, w_m, w_s = HT_WT[pos]
    fa_players.append({
        "player_id": pid, "display_name": name, "team_id": "FA", "position": pos,
        "position_group": POS[pos][0], "jersey_number": "",
        "height_inches": int(np.clip(rng.normal(h_m, h_s), 66, 82)),
        "weight_lbs": int(np.clip(rng.normal(w_m, w_s), 155, 375)),
        "age": age, "experience_years": exp, "college_id": col["college_id"],
        "college_name": col["name"], "draft_year": SEASON - exp, "draft_round": "",
        "draft_pick_in_round": "", "draft_overall_pick": "", "draft_status": "UNKNOWN",
        "rookie_flag": 0, "roster_status": "FREE_AGENT", "designation": "NONE",
        "depth_rank": "", "role_tier": "FREE_AGENT", "overall_rating": ov,
        "potential_rating": int(np.clip(ov + max(0, 27 - age), ov, 95)), "data_class": "GENERATED",
    })
    row = {"player_id": pid, "position": pos}
    off = ATHLETIC_OFFSET[pos]
    for a in UNIV:
        row[a] = int(np.clip(ov + off.get(a, 0) + rng.normal(0, 7), 20, 99))
    for a in ALL_POS_ATTRS: row[a] = ""
    for a in POS_ATTRS[pos]: row[a] = int(np.clip(ov + rng.normal(0, 7), 20, 99))
    row["data_class"] = "MODELED"; fa_attrs.append(row)
    fa_morale.append({"player_id": pid, "team_id": "FA", "morale": int(rng.integers(30, 75)),
                      "playing_time_satisfaction": "", "contract_satisfaction": "",
                      "coach_trust": "", "locker_room_influence": int(rng.integers(10, 60)),
                      "trade_request": 0, "holdout_risk": 0, "data_class": "MODELED"})
    ask = max(MAX_AAV[pos] * ((max(ov - 58, 0) / 40) ** 2.5), vet_min(exp))
    free_agents.append({
        "player_id": pid, "display_name": name, "position": pos, "age": age,
        "experience_years": exp, "overall_rating": ov, "previous_team_id": str(rng.choice(TEAM_IDS)),
        "market_asking_aav": round(ask), "expected_years": int(rng.integers(1, 4)),
        "interest_level": int(np.clip(rng.normal(50, 20), 1, 99)),
        "fa_type": str(rng.choice(["UFA", "Street FA", "Post-June-1 Cut", "Camp Cut"],
                                  p=[.35, .30, .12, .23])),
        "data_class": "GENERATED",
    })
players += fa_players; attrs += fa_attrs; morale += fa_morale

# ================================================================ 7. DRAFT
draft_picks = []
for yr in (2027, 2028):
    order = sorted(TEAM_IDS, key=lambda t: team_talent[t])       # worst picks first
    for rd in range(1, 8):
        for i, tid in enumerate(order):
            pk = i + 1
            owner_t = tid
            if rng.random() < .12:                               # traded picks
                owner_t = str(rng.choice([x for x in TEAM_IDS if x != tid]))
            draft_picks.append({
                "pick_id": f"DP{yr}R{rd}P{pk:02d}", "draft_year": yr, "round": rd,
                "pick_in_round": pk, "overall_pick": (rd - 1) * 32 + pk,
                "original_team_id": tid, "current_owner_team_id": owner_t,
                "compensatory": 0, "data_class": "GENERATED",
            })

draft_class = []
for i in range(392):
    pos = str(rng.choice(POS_LIST, p=np.array([POS[p][1] for p in POS_LIST]) / 90))
    grade = float(np.clip(rng.normal(62, 11), 30, 96))
    col = COLLEGES[int(rng.choice(len(COLLEGES),
                                  p=np.array([c["talent_level"] ** 2.1 for c in COLLEGES]) /
                                    sum(c["talent_level"] ** 2.1 for c in COLLEGES)))]
    h_m, h_s, w_m, w_s = HT_WT[pos]
    proj = ("Round 1" if grade > 84 else "Round 2" if grade > 78 else "Round 3" if grade > 73 else
            "Round 4" if grade > 68 else "Round 5" if grade > 63 else "Round 6" if grade > 58 else
            "Round 7" if grade > 53 else "Priority UDFA")
    draft_class.append({
        "prospect_id": f"PRO2027_{i+1:03d}", "draft_year": 2027, "display_name": make_name(),
        "position": pos, "position_group": POS[pos][0], "college_id": col["college_id"],
        "college_name": col["name"], "age": int(np.clip(rng.normal(21.8, 0.9), 20, 25)),
        "height_inches": int(np.clip(rng.normal(h_m, h_s), 66, 82)),
        "weight_lbs": int(np.clip(rng.normal(w_m, w_s), 155, 375)),
        "scout_grade": round(grade, 1),
        "projected_round": proj,
        "floor_rating": int(np.clip(grade - rng.integers(4, 14), 35, 90)),
        "ceiling_rating": int(np.clip(grade + rng.integers(6, 24), 50, 99)),
        "bust_risk": int(np.clip(rng.normal(45, 18), 3, 97)),
        "forty_yard": round(float(np.clip(rng.normal(4.42 + (w_m - 200) * 0.0028, .13), 4.22, 5.45)), 2),
        "scouting_confidence": str(rng.choice(["HIGH", "MEDIUM", "LOW"], p=[.25, .5, .25])),
        "prospect_class": "FICTIONAL_GENERATED_PROSPECT",
        "data_class": "GENERATED",
    })

# ======================================= 7b. CAP NORMALIZATION
# Real front offices build rosters against a hard cap, so an unconstrained market
# model is wrong by construction. Rescale each team's non-rookie deals so top-51
# spend lands in a plausible band, holding rookie-scale and minimum deals fixed
# (those are league-mandated and cannot be renegotiated).
MONEY_FIELDS = ["total_value", "average_annual_value", "base_salary_2026",
                "signing_bonus_total", "bonus_proration_2026", "roster_bonus_2026",
                "guaranteed_money", "cap_hit_2026", "dead_cap_if_cut_2026"]
for tid in TEAM_IDS:
    tc = [c for c in contracts if c["team_id"] == tid]
    fixed = [c for c in tc if c["contract_type"] in ("ROOKIE_SCALE", "UDFA", "VETERAN_MINIMUM")]
    flex = [c for c in tc if c not in fixed]
    target = CAP_2026 * float(rng.uniform(0.84, 0.99))
    for _ in range(40):
        top51 = sum(c["cap_hit_2026"] for c in
                    sorted(tc, key=lambda c: -c["cap_hit_2026"])[:51])
        if abs(top51 - target) / target < 0.01:
            break
        fixed_hit = sum(c["cap_hit_2026"] for c in fixed
                        if c in sorted(tc, key=lambda c: -c["cap_hit_2026"])[:51])
        flex_hit = max(top51 - fixed_hit, 1.0)
        f = max(0.05, (target - fixed_hit) / flex_hit)
        f = float(np.clip(f, 0.35, 2.6))
        for c in flex:
            floor = vet_min(4)
            for k in MONEY_FIELDS:
                c[k] = round(c[k] * f)
            c["base_salary_2026"] = max(c["base_salary_2026"], round(floor * 0.9))
            c["cap_hit_2026"] = (c["base_salary_2026"] + c["bonus_proration_2026"]
                                 + c["roster_bonus_2026"])
            c["average_annual_value"] = max(c["average_annual_value"], floor)

# ================================================================ 8. FINANCES
finances, cap_rows = [], []
for tid in TEAM_IDS:
    tc = sorted([c for c in contracts if c["team_id"] == tid],
                key=lambda c: -c["cap_hit_2026"])
    top51 = sum(c["cap_hit_2026"] for c in tc[:51])
    dead = sum(c["dead_cap_if_cut_2026"] for c in tc[51:]) * 0.06
    total_cash = sum(c["base_salary_2026"] + c["roster_bonus_2026"] for c in tc[:53])
    mkt = next(t[7] for t in TEAMS if t[0] == tid)
    st_cap = next(s[2] for s in STADIUMS if s[0] == tid)
    ticket = st_cap * 9 * float(np.clip(rng.normal(118 + mkt * 9, 18), 60, 320))
    local = ticket + rng.normal(95e6 + mkt * 11e6, 18e6)
    national = 415e6
    revenue = local + national
    expenses = total_cash + rng.normal(180e6, 22e6)
    finances.append({
        "team_id": tid, "season": SEASON,
        "salary_cap": CAP_2026, "top51_cap_spend": round(top51),
        "cap_space": round(CAP_2026 - top51 - dead), "dead_cap": round(dead),
        "cash_spend": round(total_cash),
        "local_revenue": round(local), "national_revenue": round(national),
        "total_revenue": round(revenue), "operating_expenses": round(expenses),
        "operating_income": round(revenue - expenses),
        "stadium_capacity": st_cap, "market_size": mkt,
        "data_class": "MODELED",
    })
    cap_rows.append({"team_id": tid, "season": SEASON, "cap_limit": CAP_2026,
                     "committed": round(top51), "dead_money": round(dead),
                     "available": round(CAP_2026 - top51 - dead),
                     "contracts_counted": min(51, len(tc)),
                     "rollover_from_2025": round(float(rng.normal(6e6, 4e6))),
                     "data_class": "MODELED"})

# ================================================================ 9. NEEDS + GOALS
team_needs, owner_goals = [], []
for tid in TEAM_IDS:
    starters = {}
    for d in depth:
        if d["team_id"] == tid and d["is_starter"] == 1:
            p = next(x for x in by_team[tid] if x["player_id"] == d["player_id"])
            starters.setdefault(d["slot_position"], []).append(p["overall_rating"])
    ranked = sorted(starters.items(), key=lambda kv: sum(kv[1]) / len(kv[1]))
    for rank, (pos, vals) in enumerate(ranked[:5], start=1):
        avg = sum(vals) / len(vals)
        team_needs.append({
            "team_id": tid, "need_rank": rank, "position": pos,
            "starter_avg_rating": round(avg, 1),
            "severity": "CRITICAL" if avg < 68 else "HIGH" if avg < 74 else "MODERATE",
            "data_class": "MODELED",
        })
    tt = team_talent[tid]
    own = next(o for o in owners if o["team_id"] == tid)
    if tt > 0.75:   tier = "contender"
    elif tt > 0.0:  tier = "fringe"
    elif tt > -0.8: tier = "retool"
    else:           tier = "rebuild"
    goalsets = {
        "contender": [("Win the conference championship", "PLAYOFF_RUN", 1, "CRITICAL"),
                      ("Finish top-2 in the division", "DIVISION_FINISH", 2, "HIGH"),
                      ("Stay under the cap without restructures", "FINANCIAL", 0, "MODERATE")],
        "fringe":    [("Reach the postseason", "PLAYOFF_BERTH", 1, "CRITICAL"),
                      ("Post a winning record", "WIN_TOTAL", 9, "HIGH"),
                      ("Extend a homegrown core player", "ROSTER", 1, "MODERATE")],
        "retool":    [("Win at least 8 games", "WIN_TOTAL", 8, "HIGH"),
                      ("Develop a starting-caliber young quarterback", "DEVELOPMENT", 1, "CRITICAL"),
                      ("Improve home attendance year over year", "BUSINESS", 3, "MODERATE")],
        "rebuild":   [("Accumulate additional premium draft capital", "DRAFT_CAPITAL", 2, "HIGH"),
                      ("Give 500+ snaps to three players under 25", "DEVELOPMENT", 3, "CRITICAL"),
                      ("Carry cap space into next league year", "FINANCIAL", 25_000_000, "MODERATE")],
    }
    for i, (desc, gtype, target, pri) in enumerate(goalsets[tier], start=1):
        owner_goals.append({
            "goal_id": f"GOAL_{tid}_{i}", "team_id": tid, "owner_id": own["owner_id"],
            "season": SEASON, "goal_type": gtype, "description": desc,
            "target_value": target, "priority": pri,
            "franchise_posture": tier,
            "patience_if_missed": own["patience"],
            "reward_points": {"CRITICAL": 500, "HIGH": 300, "MODERATE": 150}[pri],
            "status": "IN_PROGRESS", "data_class": "MODELED",
        })

json.dump({"owners": owners, "schemes": schemes, "coaches": coaches, "coach_attrs": coach_attrs,
           "staff": staff, "depth": depth, "sched": sched, "byes": byes,
           "free_agents": free_agents, "draft_picks": draft_picks, "draft_class": draft_class,
           "finances": finances, "cap_rows": cap_rows, "team_needs": team_needs,
           "owner_goals": owner_goals, "players": players, "attrs": attrs, "morale": morale},
          open(f"{OUT}/_stage2.json", "w"))

print(f"owners={len(owners)} schemes={len(schemes)} coaches={len(coaches)} staff={len(staff)}")
print(f"depth={len(depth)} schedule={len(sched)} byes={len(byes)} FA={len(free_agents)}")
print(f"draft_picks={len(draft_picks)} prospects={len(draft_class)} needs={len(team_needs)} goals={len(owner_goals)}")
gp = {t: 0 for t in TEAM_IDS}; hm = {t: 0 for t in TEAM_IDS}
for g in sched:
    gp[g["home_team_id"]] += 1; gp[g["away_team_id"]] += 1; hm[g["home_team_id"]] += 1
print(f"games/team: {sorted(set(gp.values()))}  home/team: {sorted(set(hm.values()))}")
print(f"cap space range: ${min(f['cap_space'] for f in finances)/1e6:.1f}M .. "
      f"${max(f['cap_space'] for f in finances)/1e6:.1f}M")
