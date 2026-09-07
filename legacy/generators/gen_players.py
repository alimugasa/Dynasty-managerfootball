"""Player universe: identity, ratings, contracts, morale, rosters, depth charts."""
import csv, os, math, random
import numpy as np
from ref_data import TEAMS, CAP_2026, SEASON, COLLEGE_PLACES, COLLEGE_SUFFIX, COLLEGE_CONFS
from names import FIRST, LAST

OUT = "/home/claude/dmp/build"
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(20260825)
pyrng = random.Random(20260825)

# pos: (group, n_on_90, n_active, n_starters, pos_value, variance_mult)
POS = {
    "QB":   ("Quarterback",    4, 2, 1, 1.00, 1.55),
    "RB":   ("Backfield",      5, 3, 1, 0.28, 1.10),
    "FB":   ("Backfield",      1, 1, 1, 0.15, 0.80),
    "WR":   ("Receiver",      11, 6, 3, 0.62, 1.25),
    "TE":   ("Receiver",       6, 3, 1, 0.38, 1.10),
    "OT":   ("O-Line",         6, 4, 2, 0.72, 1.05),
    "OG":   ("O-Line",         6, 4, 2, 0.42, 0.95),
    "C":    ("O-Line",         3, 2, 1, 0.40, 0.95),
    "EDGE": ("Front Seven",    9, 5, 2, 0.80, 1.30),
    "DT":   ("Front Seven",    8, 5, 2, 0.55, 1.10),
    "LB":   ("Front Seven",    8, 5, 2, 0.35, 1.05),
    "CB":   ("Secondary",     11, 6, 3, 0.68, 1.20),
    "S":    ("Secondary",      7, 4, 2, 0.40, 1.05),
    "K":    ("Specialist",     2, 1, 1, 0.12, 0.85),
    "P":    ("Specialist",     2, 1, 1, 0.10, 0.80),
    "LS":   ("Specialist",     1, 1, 1, 0.08, 0.60),
}
assert sum(v[1] for v in POS.values()) == 90
assert sum(v[2] for v in POS.values()) == 53

# ---------------------------------------------------------------- colleges
def build_colleges():
    seen, rows = set(), []
    i = 0
    for place in COLLEGE_PLACES:
        for suf in COLLEGE_SUFFIX:
            name = f"{place} {suf}"
            if name in seen:
                continue
            seen.add(name)
            i += 1
            conf, cabbr, ctier = COLLEGE_CONFS[i % len(COLLEGE_CONFS)]
            # talent tiers: P5-equivalents get high talent
            if ctier == 1:
                talent = int(np.clip(rng.normal(7.6, 1.0), 4, 10))
            elif ctier == 2:
                talent = int(np.clip(rng.normal(5.4, 1.1), 2, 9))
            else:
                talent = int(np.clip(rng.normal(3.4, 1.0), 1, 7))
            pipeline = round(float(np.clip(talent / 10 * 0.85 + rng.normal(0, .05), .05, .95)), 3)
            abbr = "".join(w[0] for w in place.split())[:3].upper() + suf[0].upper()
            rows.append({
                "college_id": f"COL{i:04d}", "name": name, "abbreviation": abbr,
                "conference": conf, "conference_abbr": cabbr, "division_tier": ctier,
                "talent_level": talent, "nfl_pipeline_rate": pipeline,
                "data_class": "GENERATED",
            })
            if len(rows) >= 260:
                return rows
    return rows

COLLEGES = build_colleges()
# weight college selection by talent so elite programs produce more pros
_cw = np.array([c["talent_level"] ** 2.1 for c in COLLEGES], dtype=float)
_cw /= _cw.sum()

# ---------------------------------------------------------------- names
used_names = set()
def make_name():
    for _ in range(400):
        n = f"{pyrng.choice(FIRST)} {pyrng.choice(LAST)}"
        if n not in used_names:
            used_names.add(n)
            return n
    n = f"{pyrng.choice(FIRST)} {pyrng.choice(LAST)}-{pyrng.choice(LAST)}"
    used_names.add(n)
    return n

# ---------------------------------------------------------------- ratings
def sample_overall(tier, pv, var_mult, team_talent):
    """Talent model: mass in the 60s-70s, compressed elite tail above the knee.

    Calibrated so ~7% of projected starters reach 90+, ~0.5% of the league
    reaches 95+, and a handful of genuine superstars separate at 97+.
    """
    if tier == "STARTER":
        b = 66.0 + rng.gamma(2.7, 4.3) * (var_mult ** 0.40) + 5.0 * pv + 3.0 * team_talent
    elif tier == "ROTATIONAL":
        b = rng.normal(68.5 + 2.2 * pv + 1.5 * team_talent, 5.0)
    elif tier == "DEPTH":
        b = rng.normal(63.0 + 1.4 * pv + 1.0 * team_talent, 4.4)
    else:  # CAMP
        b = rng.normal(56.5 + 0.8 * pv, 4.5)
    KNEE, SLOPE = 87.5, 0.46           # diminishing returns at the top
    if b > KNEE:
        b = KNEE + (b - KNEE) * SLOPE
    return int(np.clip(round(b), 38, 99))


# A great kicker is not the equal of a great quarterback. Ceilings keep low-leverage
# positions out of the league-wide elite tier.
POS_CEILING = {"QB": 99, "EDGE": 98, "WR": 98, "OT": 97, "CB": 97, "DT": 96, "LB": 95,
               "TE": 95, "S": 95, "RB": 94, "OG": 94, "C": 92, "FB": 80,
               "K": 87, "P": 85, "LS": 76}


UNIV = ["speed", "acceleration", "agility", "strength", "stamina", "durability",
        "awareness", "football_iq", "work_ethic", "consistency"]

ATHLETIC_OFFSET = {  # position -> {attr: offset from overall}
    "QB":   {"speed": -5, "acceleration": -4, "agility": -3, "strength": -5},
    "RB":   {"speed": 7, "acceleration": 8, "agility": 8, "strength": 0},
    "FB":   {"speed": -8, "acceleration": -5, "agility": -6, "strength": 9},
    "WR":   {"speed": 9, "acceleration": 9, "agility": 7, "strength": -7},
    "TE":   {"speed": -1, "acceleration": 0, "agility": -1, "strength": 5},
    "OT":   {"speed": -17, "acceleration": -13, "agility": -9, "strength": 13},
    "OG":   {"speed": -19, "acceleration": -14, "agility": -12, "strength": 15},
    "C":    {"speed": -18, "acceleration": -13, "agility": -10, "strength": 12},
    "EDGE": {"speed": 1, "acceleration": 4, "agility": 3, "strength": 8},
    "DT":   {"speed": -13, "acceleration": -8, "agility": -8, "strength": 16},
    "LB":   {"speed": 2, "acceleration": 3, "agility": 3, "strength": 4},
    "CB":   {"speed": 10, "acceleration": 10, "agility": 9, "strength": -9},
    "S":    {"speed": 5, "acceleration": 5, "agility": 5, "strength": -3},
    "K":    {"speed": -22, "acceleration": -20, "agility": -18, "strength": -12},
    "P":    {"speed": -22, "acceleration": -20, "agility": -18, "strength": -12},
    "LS":   {"speed": -18, "acceleration": -16, "agility": -14, "strength": 2},
}

POS_ATTRS = {
    "QB":   ["throw_power", "short_accuracy", "medium_accuracy", "deep_accuracy", "throw_on_run",
             "play_action", "pocket_presence", "pressure_handling", "decision_making", "scrambling"],
    "RB":   ["vision", "carrying", "elusiveness", "contact_balance", "break_tackle",
             "receiving", "pass_protection"],
    "FB":   ["carrying", "contact_balance", "receiving", "pass_protection", "run_block", "lead_block"],
    "WR":   ["catching", "catch_in_traffic", "route_running", "release", "separation",
             "spectacular_catch", "run_block"],
    "TE":   ["catching", "catch_in_traffic", "route_running", "release", "separation",
             "spectacular_catch", "run_block", "pass_block"],
    "OT":   ["pass_block", "run_block", "power", "technique", "anchor", "second_level"],
    "OG":   ["pass_block", "run_block", "power", "technique", "anchor", "second_level"],
    "C":    ["pass_block", "run_block", "power", "technique", "anchor", "snap_accuracy", "line_calls"],
    "EDGE": ["pass_rush", "power_move", "finesse_move", "block_shedding", "run_defense", "pursuit", "coverage"],
    "DT":   ["pass_rush", "power_move", "finesse_move", "block_shedding", "run_defense", "pursuit"],
    "LB":   ["tackling", "man_coverage", "zone_coverage", "pursuit", "play_recognition",
             "blitzing", "block_shedding"],
    "CB":   ["man_coverage", "zone_coverage", "press", "ball_skills", "tackling", "play_recognition"],
    "S":    ["man_coverage", "zone_coverage", "press", "ball_skills", "tackling", "play_recognition", "run_support"],
    "K":    ["kick_power", "kick_accuracy", "clutch", "kickoff_power"],
    "P":    ["punt_power", "punt_accuracy", "hang_time", "directional"],
    "LS":   ["snap_accuracy", "snap_speed", "coverage"],
}
ALL_POS_ATTRS = sorted({a for v in POS_ATTRS.values() for a in v})

HT_WT = {  # position -> (mean height in, sd, mean weight, sd)
    "QB": (75, 1.6, 222, 10), "RB": (70, 1.6, 213, 12), "FB": (72, 1.3, 244, 9),
    "WR": (72, 2.0, 199, 13), "TE": (77, 1.3, 250, 11), "OT": (78, 1.2, 315, 12),
    "OG": (76, 1.2, 316, 12), "C": (75, 1.2, 303, 10), "EDGE": (76, 1.5, 262, 13),
    "DT": (75, 1.4, 308, 15), "LB": (74, 1.4, 236, 10), "CB": (71, 1.6, 193, 9),
    "S": (72, 1.4, 205, 9), "K": (73, 1.6, 197, 12), "P": (74, 1.6, 205, 12),
    "LS": (74, 1.4, 243, 10),
}

def draft_profile(tier, overall, exp):
    """Draft pedigree correlates with tier + talent but keeps realistic noise."""
    score = overall + (12 if tier == "STARTER" else 4 if tier == "ROTATIONAL" else -4)
    score += rng.normal(0, 9)
    if score > 92:   rd = 1
    elif score > 84: rd = int(rng.choice([1, 2, 2, 3]))
    elif score > 77: rd = int(rng.choice([2, 3, 3, 4, 5]))
    elif score > 70: rd = int(rng.choice([3, 4, 5, 5, 6, 7, 0]))
    else:            rd = int(rng.choice([5, 6, 7, 0, 0, 0]))
    if rd == 0:
        return 0, None, None
    pick_in_rd = int(rng.integers(1, 33))
    overall_pick = (rd - 1) * 32 + pick_in_rd
    return rd, pick_in_rd, overall_pick

VET_MIN = {0: 840_000, 1: 1_030_000, 2: 1_130_000, 3: 1_210_000,
           4: 1_330_000, 5: 1_330_000, 6: 1_330_000}
def vet_min(exp):
    return VET_MIN.get(min(exp, 7), 1_420_000) if exp < 7 else 1_420_000

ROOKIE_R1 = lambda pk: int(10_400_000 * math.exp(-0.037 * pk) + 1_600_000)
ROOKIE_SCALE = {2: 2_250_000, 3: 1_500_000, 4: 1_190_000,
                5: 1_060_000, 6: 995_000, 7: 965_000}

MAX_AAV = {"QB": 62e6, "EDGE": 41e6, "WR": 36e6, "OT": 30e6, "DT": 29e6, "CB": 27e6,
           "OG": 22e6, "LB": 22e6, "S": 21e6, "TE": 20e6, "C": 18e6, "RB": 16e6,
           "FB": 3.0e6, "K": 6.5e6, "P": 4.2e6, "LS": 2.0e6}

def market_aav(pos, overall, exp):
    if exp == 0:
        return None
    q = max(overall - 58, 0) / 40.0
    aav = MAX_AAV[pos] * (q ** 2.5)
    aav *= float(np.clip(rng.normal(1.0, 0.13), 0.6, 1.45))
    return max(aav, vet_min(exp))

# ---------------------------------------------------------------- build
players, attrs, contracts, morale, traits, rosters, depth, injuries = [], [], [], [], [], [], [], []
team_talent = {t[0]: float(v) for t, v in zip(TEAMS, rng.normal(0, 1.0, len(TEAMS)))}
pid_counter = {}

TRAITS_POOL = ["Field General", "Clutch Performer", "Ironman", "Injury Prone", "Locker Room Leader",
               "Film Junkie", "Late Bloomer", "High Motor", "Slow Starter", "Big Game Hunter",
               "Coach's Son", "Volatile", "Scheme Dependent", "Positional Versatility",
               "Special Teams Ace", "Practice Squad Grinder", "Weight Room Warrior"]

for team_id, metro, nick, div, c1, c2, founded, mkt in TEAMS:
    tt = team_talent[team_id]
    used_jerseys = set()
    for pos, (grp, n90, nact, nstart, pv, vm) in POS.items():
        ps_cut = nact + max(1, round((n90 - nact) * 0.42))
        for d in range(n90):
            if d < nstart:
                tier = "STARTER"
            elif d < nact:
                tier = "ROTATIONAL"
            elif d < ps_cut:
                tier = "DEPTH"
            else:
                tier = "CAMP"

            overall = min(sample_overall(tier, pv, vm, tt), POS_CEILING[pos])
            # experience: better players skew veteran, camp bodies skew young
            if tier == "STARTER":
                exp = int(np.clip(rng.gamma(2.6, 2.1), 0, 17))
            elif tier == "ROTATIONAL":
                exp = int(np.clip(rng.gamma(2.1, 1.9), 0, 15))
            elif tier == "DEPTH":
                exp = int(np.clip(rng.gamma(1.5, 1.6), 0, 11))
            else:
                exp = int(np.clip(rng.gamma(1.0, 1.2), 0, 6))
            age = 21 + exp + int(rng.choice([0, 1, 1, 2, 2, 3]))
            age = int(np.clip(age, 21, 40))

            # young players carry upside; older players are what they are
            upside = max(0, 28 - age) * 0.85 + rng.normal(2, 3)
            potential = int(np.clip(overall + max(0, upside), overall, 99))

            rd, pk_rd, pk_ov = draft_profile(tier, overall, exp)
            draft_year = SEASON - exp
            college = COLLEGES[int(rng.choice(len(COLLEGES), p=_cw))]

            pos_i = len(players) + 1
            pid = f"{team_id}_{pos}_{d+1:02d}"
            name = make_name()

            h_m, h_s, w_m, w_s = HT_WT[pos]
            height = int(np.clip(rng.normal(h_m, h_s), 66, 82))
            weight = int(np.clip(rng.normal(w_m + (overall - 70) * 0.12, w_s), 155, 375))

            jersey = None
            for _ in range(60):
                j = int(rng.integers(1, 100))
                if j not in used_jerseys:
                    used_jerseys.add(j); jersey = j; break

            # roster status at an August cutdown checkpoint
            if tier in ("STARTER", "ROTATIONAL"):
                status = "ACTIVE"
            elif tier == "DEPTH":
                status = "ACTIVE" if d < nact else "PRACTICE_SQUAD_CANDIDATE"
            else:
                status = "CAMP_BODY"

            durability_seed = int(np.clip(rng.normal(72, 14), 25, 99))
            inj_roll = rng.random()
            designation = "NONE"
            if inj_roll < 0.045:
                designation = str(rng.choice(["PUP", "NFI", "IR", "IR", "SUSPENDED"], p=[.3, .12, .3, .23, .05]))
            elif inj_roll < 0.11:
                designation = "DAY_TO_DAY"

            players.append({
                "player_id": pid, "display_name": name, "team_id": team_id, "position": pos,
                "position_group": grp, "jersey_number": jersey, "height_inches": height,
                "weight_lbs": weight, "age": age, "experience_years": exp,
                "college_id": college["college_id"], "college_name": college["name"],
                "draft_year": draft_year if rd else draft_year,
                "draft_round": rd if rd else "", "draft_pick_in_round": pk_rd if rd else "",
                "draft_overall_pick": pk_ov if rd else "",
                "draft_status": "DRAFTED" if rd else "UNDRAFTED",
                "rookie_flag": 1 if exp == 0 else 0,
                "roster_status": status, "designation": designation,
                "depth_rank": d + 1, "role_tier": tier,
                "overall_rating": overall, "potential_rating": potential,
                "data_class": "GENERATED",
            })

            # ---- attributes
            row = {"player_id": pid, "position": pos}
            off = ATHLETIC_OFFSET[pos]
            for a in UNIV:
                if a in off:
                    v = overall + off[a] + rng.normal(0, 6)
                elif a == "durability":
                    v = durability_seed
                elif a in ("awareness", "football_iq"):
                    v = overall + (age - 26) * 0.7 + rng.normal(0, 6)
                elif a == "stamina":
                    v = overall * 0.4 + 52 + rng.normal(0, 7)
                elif a == "work_ethic":
                    v = rng.normal(70, 13)
                else:  # consistency
                    v = overall * 0.55 + 28 + rng.normal(0, 8)
                row[a] = int(np.clip(round(v), 20, 99))
            for a in ALL_POS_ATTRS:
                row[a] = ""
            for a in POS_ATTRS[pos]:
                row[a] = int(np.clip(round(overall + rng.normal(0, 7)), 20, 99))
            row["data_class"] = "MODELED"
            attrs.append(row)

            # ---- contract
            if exp == 0 and rd:
                aav = ROOKIE_R1(pk_ov) if rd == 1 else ROOKIE_SCALE[rd]
                years, ctype = (5 if rd == 1 else 4), "ROOKIE_SCALE"
                gtd_pct = 1.0 if rd == 1 else (0.55 if rd == 2 else 0.25)
            elif exp == 0:
                aav, years, ctype, gtd_pct = 840_000, 3, "UDFA", 0.02
            else:
                aav = market_aav(pos, overall, exp)
                years = int(rng.choice([1, 1, 2, 2, 3, 3, 4, 5],
                                       p=[.24, .16, .17, .13, .11, .08, .07, .04]))
                ctype = "VETERAN" if aav > vet_min(exp) * 1.35 else "VETERAN_MINIMUM"
                gtd_pct = float(np.clip(rng.normal(0.46, 0.18), 0.0, 0.95)) if ctype == "VETERAN" else 0.05
            total = aav * years
            sb = total * float(np.clip(rng.normal(0.24, 0.08), 0.0, 0.5)) if ctype != "VETERAN_MINIMUM" else 0.0
            prorate = sb / min(years, 5)
            base = max(aav - prorate, vet_min(exp) * 0.9)
            roster_bonus = total * 0.03 if ctype == "VETERAN" and rng.random() < 0.35 else 0.0
            yrs_left = int(rng.integers(1, years + 1))
            start = SEASON - (years - yrs_left)
            contracts.append({
                "contract_id": f"CTR{pos_i:05d}", "player_id": pid, "team_id": team_id,
                "contract_type": ctype, "start_year": start, "end_year": start + years - 1,
                "years_total": years, "years_remaining": yrs_left,
                "total_value": round(total), "average_annual_value": round(aav),
                "base_salary_2026": round(base), "signing_bonus_total": round(sb),
                "bonus_proration_2026": round(prorate), "roster_bonus_2026": round(roster_bonus),
                "guaranteed_money": round(total * gtd_pct),
                "cap_hit_2026": round(base + prorate + roster_bonus),
                "dead_cap_if_cut_2026": round(prorate * min(yrs_left, 5)),
                "no_trade_clause": 1 if (aav > 20e6 and rng.random() < .3) else 0,
                "contract_status": "ACTIVE", "data_class": "MODELED",
            })

            # ---- morale
            playing_time_sat = {"STARTER": 82, "ROTATIONAL": 66, "DEPTH": 52, "CAMP": 44}[tier]
            morale.append({
                "player_id": pid, "team_id": team_id,
                "morale": int(np.clip(rng.normal(playing_time_sat, 11), 5, 100)),
                "playing_time_satisfaction": int(np.clip(rng.normal(playing_time_sat, 12), 5, 100)),
                "contract_satisfaction": int(np.clip(rng.normal(62 + (overall - 72) * -0.5, 15), 5, 100)),
                "coach_trust": int(np.clip(rng.normal(66, 14), 5, 100)),
                "locker_room_influence": int(np.clip(rng.normal(35 + exp * 3.2 + (overall - 70), 14), 1, 100)),
                "trade_request": 0, "holdout_risk": int(np.clip(rng.normal(8, 9), 0, 100)),
                "data_class": "MODELED",
            })

            # ---- traits
            n_tr = int(rng.choice([0, 1, 1, 2, 2, 3]))
            chosen = pyrng.sample(TRAITS_POOL, n_tr) if n_tr else []
            if durability_seed < 45 and "Injury Prone" not in chosen:
                chosen.append("Injury Prone")
            for t in chosen:
                traits.append({"player_id": pid, "trait": t, "data_class": "MODELED"})

            # ---- roster
            rosters.append({
                "team_id": team_id, "player_id": pid, "position": pos,
                "jersey_number": jersey, "roster_status": status, "designation": designation,
                "depth_rank": d + 1,
                "acquisition_type": ("DRAFT" if rd and exp <= 4 else
                                     "UDFA_SIGNING" if not rd and exp <= 1 else
                                     str(rng.choice(["FREE_AGENCY", "TRADE", "WAIVER_CLAIM", "RE_SIGNED"],
                                                    p=[.55, .12, .13, .20]))),
                "acquisition_year": SEASON - int(rng.integers(0, max(exp, 1) + 1)),
                "active_status": 1 if status == "ACTIVE" and designation in ("NONE", "DAY_TO_DAY") else 0,
                "data_class": "GENERATED",
            })

            if designation in ("PUP", "NFI", "IR", "DAY_TO_DAY"):
                weeks = int(rng.integers(1, 4)) if designation == "DAY_TO_DAY" else int(rng.integers(2, 17))
                injuries.append({
                    "player_id": pid, "team_id": team_id, "designation": designation,
                    "injury_type": str(rng.choice(["Hamstring", "Knee (MCL)", "Knee (ACL)", "Ankle",
                                                   "Shoulder", "Foot", "Concussion", "Back",
                                                   "Achilles", "Groin", "Hand", "Pectoral"])),
                    "weeks_out_estimate": weeks, "season_ending": 1 if weeks >= 14 else 0,
                    "data_class": "MODELED",
                })

print(f"players={len(players)} attrs={len(attrs)} contracts={len(contracts)} "
      f"morale={len(morale)} traits={len(traits)} rosters={len(rosters)} injuries={len(injuries)}")

ovr = np.array([p["overall_rating"] for p in players])
print("\nOverall rating distribution (all %d):" % len(ovr))
for lo, hi in [(95,100),(90,95),(85,90),(80,85),(75,80),(70,75),(65,70),(60,65),(0,60)]:
    n = int(((ovr >= lo) & (ovr < hi)).sum())
    print(f"  {lo:>2}-{hi-1:<3} {n:>5}  {n/len(ovr)*100:5.1f}%")
starters = np.array([p["overall_rating"] for p in players if p["role_tier"] == "STARTER"])
print(f"\nstarters n={len(starters)} mean={starters.mean():.1f} max={starters.max()} "
      f"90+={int((starters>=90).sum())}")

np.save(f"{OUT}/_ovr.npy", ovr)

import json
json.dump({"players": players, "attrs": attrs, "contracts": contracts, "morale": morale,
           "traits": traits, "rosters": rosters, "injuries": injuries,
           "colleges": COLLEGES, "team_talent": team_talent},
          open(f"{OUT}/_stage1.json", "w"))
print("\nstage1 written")
