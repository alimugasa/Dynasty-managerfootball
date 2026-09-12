"""Offseason + progression engines. Every outcome here has a stated cause."""
import collections
import numpy as np
from world import World, POSITION_GROUPS, PEAK_AGE, DECLINE_RATE, Rules

POS_SLOTS = {"QB": 3, "RB": 4, "FB": 1, "WR": 6, "TE": 3, "OT": 4, "OG": 4, "C": 2,
             "EDGE": 5, "DT": 5, "LB": 5, "CB": 6, "S": 4, "K": 1, "P": 1, "LS": 1}
STARTERS = {"QB": 1, "RB": 1, "FB": 0, "WR": 3, "TE": 1, "OT": 2, "OG": 2, "C": 1,
            "EDGE": 2, "DT": 2, "LB": 2, "CB": 3, "S": 2, "K": 1, "P": 1, "LS": 1}
POS_VALUE = {"QB": 1.00, "EDGE": 0.80, "OT": 0.72, "CB": 0.68, "WR": 0.62, "DT": 0.55,
             "OG": 0.42, "C": 0.40, "S": 0.40, "TE": 0.38, "LB": 0.35, "RB": 0.28,
             "FB": 0.15, "K": 0.12, "P": 0.10, "LS": 0.08}
MAX_AAV_MULT = {"QB": 0.205, "EDGE": 0.136, "WR": 0.119, "OT": 0.099, "DT": 0.096,
                "CB": 0.089, "OG": 0.073, "LB": 0.073, "S": 0.070, "TE": 0.066,
                "C": 0.060, "RB": 0.053, "FB": 0.010, "K": 0.022, "P": 0.014, "LS": 0.007}
POS_CEIL = {"QB": 99, "EDGE": 98, "WR": 98, "OT": 97, "CB": 97, "DT": 96, "LB": 95,
            "TE": 95, "S": 95, "RB": 94, "OG": 94, "C": 92, "FB": 80,
            "K": 87, "P": 85, "LS": 76}
INJURIES = [("Hamstring", 1, 4, .18), ("Ankle sprain", 1, 3, .16), ("High ankle sprain", 3, 6, .07),
            ("Concussion", 1, 3, .09), ("Shoulder", 2, 6, .09), ("Knee (MCL)", 3, 7, .07),
            ("Knee (ACL)", 30, 40, .028), ("Achilles", 30, 44, .016), ("Groin", 2, 5, .07),
            ("Back", 1, 4, .06), ("Hand/wrist", 2, 6, .05), ("Quad/calf", 1, 4, .07),
            ("Ribs", 1, 3, .04), ("Pectoral", 8, 18, .012)]


def coach_edge(self, tid):
    hc = next((c for c in self.coaches.values()
               if c["team"] == tid and c["role"] == "Head Coach" and not c["retired"]), None)
    return (hc["ovr"] - 65) * 0.055 if hc else -0.4
World.coach_edge = coach_edge


def team_dev_factor(w, tid):
    staff = [c for c in w.coaches.values() if c["team"] == tid and not c["retired"]]
    if not staff:
        return 0.85
    return 0.72 + (np.mean([c["ovr"] for c in staff]) / 100.0) * 0.60


# ---------------------------------------------------------------- DEVELOPMENT
def develop(w):
    for p in w.players.values():
        if p["retired"]:
            continue
        peak = PEAK_AGE[p["grp"]]
        dev = team_dev_factor(w, p["team"]) if p["team"] in w.teams else 0.80
        snaps = 1.0 if p["status"] == "ACTIVE" else 0.45
        if p["age"] <= peak:
            gap = max(0, p["true_potential"] - p["ovr"])
            growth = (gap * 0.17 * p["dev_rate"] * dev * (0.55 + 0.45 * snaps)
                      * (0.7 + 0.6 * p["work_ethic"] / 100.0))
            growth *= float(np.clip(w.rng.normal(1.0, 0.42), 0.0, 2.4))
            p["ovr"] = min(POS_CEIL[p["pos"]], p["ovr"] + growth)
        else:
            yrs = p["age"] - peak
            drop = DECLINE_RATE[p["grp"]] * (0.42 + 0.16 * yrs)
            drop *= float(np.clip(w.rng.normal(1.0, 0.40), 0.15, 2.3))
            drop *= 1.0 + max(0, (p["games_missed_career"] - 12)) * 0.012
            p["ovr"] = max(30.0, p["ovr"] - drop)
        # experience sharpens the mental side even as athleticism goes
        if p["exp"] >= 2:
            cap_m = {"QB": 7.0, "OL": 5.0, "S": 4.0, "LB": 4.0, "TE": 3.5}.get(p["grp"], 2.5)
            p["mental"] = min(cap_m, p["mental"] + 0.55 * (p["iq"] / 100.0))
        # reputation lags ability, which is how veterans get overpaid
        p["reputation"] += (p["ovr"] - p["reputation"]) * 0.34
        p["reputation"] += p["career"]["pro_bowls"] * 0.22
        p["age"] += 1
        p["exp"] += 1


# ---------------------------------------------------------------- RETIREMENT
def retirements(w):
    n = 0
    for p in w.players.values():
        if p["retired"]:
            continue
        peak = PEAK_AGE[p["grp"]]
        past = p["age"] - peak
        if p["age"] < 25:
            continue
        pr = 0.0
        if past > 0:
            pr += 0.016 * (past ** 1.85)
        if p["ovr"] < 62:
            pr += 0.11 + (62 - p["ovr"]) * 0.020
        if p["team"] == "FA":
            pr += 0.30
        pr += max(0, p["games_missed_career"] - 20) * 0.005
        if p["career"]["rings"] > 0 and p["age"] > peak + 3:
            pr += 0.05
        if p["ovr"] > 84:
            pr *= 0.32                       # stars keep playing
        if p["age"] >= 40:
            pr = max(pr, 0.55)
        if w.rng.random() < min(pr, 0.96):
            p["retired"] = True
            w.set_team(p, "RET")
            n += 1
            if p["career"]["pro_bowls"] >= 3 or p["career"]["mvps"]:
                w.log("RETIREMENT", f"{p['name']} ({p['pos']}) retires after {p['exp']} seasons")
            w.txn("RETIREMENT", p["pid"], p["team"], "RET")
    return n


def hall_of_fame(w):
    """Eligibility five years after retirement; production-driven, not rating-driven."""
    inducted = []
    for p in w.players.values():
        if not p["retired"] or p["hof"] or p.get("hof_checked"):
            continue
        c = p["career"]
        if c["seasons"] < 8:
            p["hof_checked"] = True; continue
        score = (c["all_pros"] * 12 + c["pro_bowls"] * 4 + c["mvps"] * 30
                 + c["rings"] * 8 + c["seasons"] * 1.2
                 + c["pass_yd"] / 4500 + c["pass_td"] / 30
                 + c["rush_yd"] / 3200 + c["rec_yd"] / 3200
                 + c["sacks"] / 9 + c["picks"] / 6)
        if score > 78 and w.rng.random() < 0.72:
            p["hof"] = True
            inducted.append(p)
            w.history["hof"].append({"season": w.season, "name": p["name"],
                                     "pos": p["pos"], "score": round(score, 1)})
        p["hof_checked"] = True
    return inducted


# ---------------------------------------------------------------- INJURIES
def weekly_injuries(w):
    for p in w.players.values():
        if p["retired"] or p["team"] not in w.teams:
            continue
        if p["injury_weeks"] > 0:
            p["injury_weeks"] -= 1
            p["games_missed_career"] += 1
            continue
        if p["status"] != "ACTIVE":
            continue
        base = 0.030 * (1.0 + (70 - p["durability"]) / 115.0)
        base *= 1.0 + max(0, p["age"] - 30) * 0.045
        if w.rng.random() < base:
            names = [i[0] for i in INJURIES]
            wts = np.array([i[3] for i in INJURIES]); wts = wts / wts.sum()
            idx = int(w.rng.choice(len(INJURIES), p=wts))
            nm, lo, hi, _ = INJURIES[idx]
            p["injury_weeks"] = int(w.rng.integers(lo, hi + 1))
            p["injury_type"] = nm
            p["durability"] = max(20, p["durability"] - (6 if p["injury_weeks"] > 12 else 1))


# ---------------------------------------------------------------- PROSPECTS
# Draft-class quality. Calibrated against multi-decade league-mean stability,
# NOT hand-picked: see calibrate.py. Intake must replace outgoing talent exactly,
# or the league drifts over decades.
CLASS_SIZE = 300
# Calibrated 2026-08: equilibrium league mean 73.2 +/- 0.2 with drift < 0.01/season
# across seeds, matching the starting database's 53-man active mean of 73.4.
# Earlier values (56.0 / 5.2) settled the league at 70.1, producing a visible
# 12-year decline from the initial roster before flattening.
CLASS_OVR_MU = 57.8
CLASS_OVR_SD = 9.0
CLASS_POT_SHAPE = 2.0
CLASS_POT_SCALE = 6.15


def generate_class(w, draft_year):
    """Prospects are created three years out and develop before declaring."""
    from names_pool import rand_name
    out = []
    for i in range(CLASS_SIZE):
        pos = w.py.choices(list(POS_SLOTS), weights=[POS_SLOTS[p] for p in POS_SLOTS])[0]
        true_ovr = float(np.clip(w.rng.normal(CLASS_OVR_MU, CLASS_OVR_SD), 32, 88))
        pot = float(np.clip(true_ovr + w.rng.gamma(CLASS_POT_SHAPE, CLASS_POT_SCALE),
                            true_ovr, POS_CEIL[pos]))
        out.append({
            "pid": w.new_pid(pos), "name": rand_name(w.py), "pos": pos,
            "grp": POSITION_GROUPS[pos], "age": 20,
            "true_ovr": true_ovr, "true_potential": pot,
            "dev_rate": float(np.clip(w.rng.normal(1.0, 0.33), 0.2, 2.2)),
            "work_ethic": int(np.clip(w.rng.normal(70, 14), 25, 99)),
            "durability": int(np.clip(w.rng.normal(72, 14), 25, 99)),
            "iq": int(np.clip(w.rng.normal(70, 13), 25, 99)),
            "draft_year": draft_year, "college": f"College {w.py.randint(1, 260)}",
            "declared": False,
        })
    w.prospect_pipeline[draft_year] = out


def develop_prospects(w):
    for yr, cls in w.prospect_pipeline.items():
        for p in cls:
            gap = max(0, p["true_potential"] - p["true_ovr"])
            p["true_ovr"] += gap * 0.22 * p["dev_rate"] * float(np.clip(w.rng.normal(1, .5), 0, 2.5))
            p["age"] += 1


def scout(w, tid, prospect):
    """Teams never see true ability. Error scales with the club's scouting department."""
    q = w.teams[tid]["scouting"]
    sigma = 11.5 - (q / 100.0) * 6.0
    est = prospect["true_ovr"] + w.rng.normal(0, sigma)
    pot_est = prospect["true_potential"] + w.rng.normal(0, sigma * 1.35)
    return est, pot_est


# ---------------------------------------------------------------- DRAFT
def team_needs(w, tid):
    ros = w.roster(tid, active_only=False)
    byp = collections.defaultdict(list)
    for p in ros:
        byp[p["pos"]].append(p["ovr"] + p["mental"])
    need = {}
    for pos, n_start in STARTERS.items():
        vals = sorted(byp.get(pos, []), reverse=True)[:max(n_start, 1)]
        avg = np.mean(vals) if vals else 40.0
        need[pos] = float(np.clip((76 - avg) / 22.0, 0.0, 1.0))
    return need


def run_draft(w, order):
    cls = w.prospect_pipeline.get(w.season, [])
    if not cls:
        generate_class(w, w.season); cls = w.prospect_pipeline[w.season]
    pool = list(cls)
    boards = {}
    for tid in order:
        needs = team_needs(w, tid)
        b = []
        for pr in pool:
            est, pot = scout(w, tid, pr)
            score = (est * 0.55 + pot * 0.45) * (0.72 + 0.55 * POS_VALUE[pr["pos"]])
            score += needs[pr["pos"]] * 13.0 * (0.5 + w.teams[tid]["win_now"])
            score += w.rng.normal(0, 3.2)      # front offices disagree
            b.append((score, pr))
        b.sort(key=lambda x: -x[0])
        boards[tid] = b
    picked = set()
    results = []
    for rnd in range(1, w.rules.draft_rounds + 1):
        for i, tid in enumerate(order):
            board = [(s, pr) for s, pr in boards[tid] if pr["pid"] not in picked]
            if not board:
                continue
            score, pr = board[0]
            picked.add(pr["pid"])
            ov = (rnd - 1) * 32 + i + 1
            sign_rookie(w, tid, pr, rnd, ov)
            results.append((w.season, rnd, ov, tid, pr["name"], pr["pos"]))
    # undrafted
    for pr in pool:
        if pr["pid"] in picked:
            continue
        if w.rng.random() < 0.35:
            tid = w.py.choice(list(w.teams))
            sign_rookie(w, tid, pr, 0, 0)
    return results


def sign_rookie(w, tid, pr, rnd, ov_pick):
    cap = w.rules.salary_cap
    if rnd == 1:
        aav = int(w.rules.rookie_pool_r1_top * np.exp(-0.037 * max(ov_pick, 1)) + cap * 0.005)
        yrs = 5
    elif rnd == 0:
        aav, yrs = w.rules.vet_min, 3
    else:
        aav = int(max(w.rules.vet_min, cap * (0.0074 - 0.0009 * rnd)))
        yrs = 4
    _new = {
        "pid": pr["pid"], "name": pr["name"], "team": tid, "pos": pr["pos"],
        "grp": pr["grp"], "age": 22, "exp": 0, "college": pr["college"],
        "draft_year": w.season, "draft_round": rnd, "draft_pick": ov_pick,
        "ovr": pr["true_ovr"], "true_potential": pr["true_potential"],
        "dev_rate": pr["dev_rate"], "work_ethic": pr["work_ethic"],
        "durability": pr["durability"], "iq": pr["iq"], "mental": 0.0,
        "personality": w.py.choice(["MAX_MONEY", "CHAMPIONSHIP", "LOYALTY", "ROLE",
                                    "LOCATION", "COACH_RELATIONSHIP", "LONG_TERM_SECURITY"]),
        "status": "ACTIVE", "injury_weeks": 0, "injury_type": "",
        "games_missed_career": 0, "retired": False, "hof": False,
        "aav": aav, "cap_hit": aav, "years_left": yrs, "guaranteed": int(aav * yrs * 0.6),
        "career": {"seasons": 0, "games": 0, "pass_yd": 0, "pass_td": 0, "int": 0,
                   "rush_yd": 0, "rush_td": 0, "rec": 0, "rec_yd": 0, "rec_td": 0,
                   "sacks": 0.0, "tackles": 0, "picks": 0, "pro_bowls": 0,
                   "all_pros": 0, "mvps": 0, "rings": 0},
        "morale": 70.0, "reputation": pr["true_ovr"],
    }
    w.players[pr["pid"]] = _new
    if hasattr(w, "_idx"):
        w._idx.setdefault(tid, []).append(_new)
    w.txn("DRAFT" if rnd else "UDFA", pr["pid"], "", tid, f"R{rnd} P{ov_pick}")


# ---------------------------------------------------------------- CONTRACTS / FA
def market_aav(w, p):
    cap = w.rules.salary_cap
    perceived = p["reputation"] * 0.62 + (p["ovr"] + p["mental"]) * 0.38
    q = max(perceived - 58, 0) / 40.0
    aav = cap * MAX_AAV_MULT[p["pos"]] * (q ** 2.5)
    if p["age"] > PEAK_AGE[p["grp"]] + 2:
        aav *= 0.80
    return int(max(aav, w.rules.vet_min))


def expire_contracts(w):
    for p in w.players.values():
        if p["retired"] or p["team"] not in w.teams:
            continue
        p["years_left"] -= 1
        if p["years_left"] <= 0:
            p["prev_team"] = p["team"]
            w.set_team(p, "FA")
            p["status"] = "FREE_AGENT"
            w.txn("CONTRACT_EXPIRED", p["pid"], p["prev_team"], "FA")


def free_agency(w):
    """Players weigh money against fit. Highest bidder does not automatically win."""
    fas = sorted(w.free_agents(), key=lambda p: -(p["reputation"]))
    signed = 0
    need_cache, space_cache = {}, {}
    for n, p in enumerate(fas):
        if n % 25 == 0:                      # refresh as rosters fill up
            need_cache = {t: team_needs(w, t) for t in w.teams}
            space_cache = {t: w.cap_space(t) for t in w.teams}
        bids = []
        ask = market_aav(w, p)
        for tid, t in w.teams.items():
            space = space_cache[tid]
            if space < w.rules.vet_min * 2:
                continue
            need = need_cache[tid][p["pos"]]
            roster_at_pos = len([x for x in w.roster(tid, False) if x["pos"] == p["pos"]])
            if roster_at_pos >= POS_SLOTS[p["pos"]] + 1 and need < 0.25:
                continue
            willing = ask * (0.62 + 0.75 * need) * (0.75 + t["owner_spending"] / 200.0)
            willing *= float(np.clip(w.rng.normal(1.0, 0.13), 0.6, 1.5))
            if willing > space * 0.55:
                willing = space * 0.55
            if willing < w.rules.vet_min:
                continue
            bids.append((tid, int(willing), need))
        if not bids:
            continue
        best_money = max(b[1] for b in bids)
        scored = []
        for tid, money, need in bids:
            t = w.teams[tid]
            money_s = money / max(best_money, 1)
            contend = np.mean(t["wins_history"][-3:]) / 17 if t["wins_history"] else 0.5
            start_s = need
            loyal = 1.0 if tid == p.get("prev_team") else 0.0
            prestige = t["prestige"] / 100.0
            wts = {
                "MAX_MONEY":          (0.72, 0.06, 0.08, 0.04, 0.10),
                "CHAMPIONSHIP":       (0.28, 0.42, 0.10, 0.04, 0.16),
                "LOYALTY":            (0.34, 0.10, 0.10, 0.36, 0.10),
                "ROLE":               (0.30, 0.10, 0.46, 0.04, 0.10),
                "LOCATION":           (0.38, 0.14, 0.12, 0.10, 0.26),
                "COACH_RELATIONSHIP": (0.32, 0.16, 0.16, 0.18, 0.18),
                "LONG_TERM_SECURITY": (0.52, 0.14, 0.16, 0.08, 0.10),
            }[p["personality"]]
            s = (wts[0] * money_s + wts[1] * contend + wts[2] * start_s
                 + wts[3] * loyal + wts[4] * prestige)
            s += w.rng.normal(0, 0.05)
            scored.append((s, tid, money))
        scored.sort(reverse=True)
        _, tid, money = scored[0]
        yrs = int(np.clip(w.rng.integers(1, 5) + (1 if p["age"] < 27 else 0), 1, 5))
        w.set_team(p, tid); p["status"] = "ACTIVE"
        p["aav"] = money; p["cap_hit"] = money; p["years_left"] = yrs
        p["guaranteed"] = int(money * yrs * 0.45)
        w.txn("FA_SIGNING", p["pid"], "FA", tid, f"${money/1e6:.1f}M x{yrs}")
        space_cache[tid] -= money
        signed += 1
    return signed


def enforce_cap_and_roster(w):
    """Clubs must reach compliance. Cuts are by value, not at random."""
    for tid in w.teams:
        ros = sorted(w.roster(tid, active_only=False),
                     key=lambda p: -(p["ovr"] + p["mental"]))
        # trim to the roster limit, worst first
        while len(ros) > w.rules.roster_limit:
            cut = ros.pop()
            w.set_team(cut, "FA"); cut["status"] = "FREE_AGENT"; cut["years_left"] = 0
            w.txn("RELEASE", cut["pid"], tid, "FA", "roster limit")
        guard = 0
        while w.cap_space(tid) < 0 and guard < 40:
            guard += 1
            ros = sorted(w.roster(tid, active_only=False),
                         key=lambda p: p["cap_hit"] / max(p["ovr"] + p["mental"], 1))
            if not ros:
                break
            cut = ros[-1]
            w.set_team(cut, "FA"); cut["status"] = "FREE_AGENT"; cut["years_left"] = 0
            w.txn("RELEASE", cut["pid"], tid, "FA", "cap compliance")
        # fill holes at minimum salary from the leftover pool
        for pos, need_n in POS_SLOTS.items():
            have = len([p for p in w.roster(tid, False) if p["pos"] == pos])
            while have < STARTERS[pos] + 1 and len(w.roster(tid, False)) < w.rules.roster_limit:
                cands = [p for p in w.free_agents() if p["pos"] == pos]
                if not cands:
                    break
                pick = max(cands, key=lambda p: p["ovr"])
                w.set_team(pick, tid); pick["status"] = "ACTIVE"
                pick["aav"] = pick["cap_hit"] = w.rules.vet_min
                pick["years_left"] = 1
                w.txn("SIGNING", pick["pid"], "FA", tid, "depth")
                have += 1


# ---------------------------------------------------------------- COACHING
def coaching_carousel(w, rec):
    from names_pool import rand_coach_name
    moves = 0
    for tid, t in w.teams.items():
        hc = next((c for c in w.coaches.values()
                   if c["team"] == tid and c["role"] == "Head Coach" and not c["retired"]), None)
        wins = rec[tid]["w"] if tid in rec else 8
        t["wins_history"].append(wins)
        if not hc:
            continue
        hc["career_w"] += wins; hc["career_l"] += 17 - wins
        # expectation is set by roster quality, not by a flat target
        talent = np.mean(sorted([p["ovr"] + p["mental"] for p in w.roster(tid)],
                                reverse=True)[:24]) if w.roster(tid) else 65
        expected = float(np.clip((talent - 66) * 0.72 + 8.5, 3.0, 13.0))
        shortfall = expected - wins
        pr = 0.0
        if hc["tenure"] >= 2:
            pr += max(0.0, shortfall) * 0.115
        if hc["tenure"] >= 4 and max(t["wins_history"][-4:]) < 10:
            pr += 0.20
        pr *= (1.35 - t["owner_patience"] / 140.0)
        if hc["tenure"] <= 1:
            pr *= 0.28                          # first-year coaches get a pass
        if wins >= 11:
            pr *= 0.15
        pr = float(np.clip(pr, 0.0, 0.85))
        hc["age"] += 1; hc["exp"] += 1
        if hc["age"] > 66 and w.rng.random() < 0.30:
            hc["retired"] = True; hc["team"] = ""
            w.history["coach_moves"].append({"season": w.season, "team": tid,
                                             "type": "RETIRED", "coach": hc["name"]})
        elif w.rng.random() < pr:
            hc["team"] = ""; hc["tenure"] = 0
            w.history["coach_moves"].append({"season": w.season, "team": tid,
                                             "type": "FIRED", "coach": hc["name"],
                                             "wins": wins, "expected": round(expected, 1)})
            w.log("COACHING", f"{tid} fires {hc['name']} after {wins}-{17-wins} "
                              f"(expected ~{expected:.0f} wins)")
            moves += 1
        else:
            hc["tenure"] += 1
    # fill vacancies: promote coordinators first, then the unemployed pool
    for tid in w.teams:
        has = any(c["team"] == tid and c["role"] == "Head Coach" and not c["retired"]
                  for c in w.coaches.values())
        if has:
            continue
        cands = [c for c in w.coaches.values()
                 if not c["retired"] and c["team"] != tid
                 and (c["role"] in ("Offensive Coordinator", "Defensive Coordinator")
                      or c["team"] == "")]
        if not cands:
            continue
        # candidates prefer good jobs; strong ones can decline weak organizations
        job_q = w.teams[tid]["prestige"] / 100.0
        cands.sort(key=lambda c: -(c["ovr"] + w.rng.normal(0, 5)))
        chosen = None
        for c in cands[:8]:
            if c["ovr"] > 78 and job_q < 0.35 and w.rng.random() < 0.55:
                continue
            chosen = c; break
        chosen = chosen or cands[0]
        prev = chosen["team"]
        mentor = next((x for x in w.coaches.values()
                       if x["team"] == prev and x["role"] == "Head Coach"), None)
        chosen["mentor"] = mentor["cid"] if mentor else chosen["mentor"]
        chosen["role"] = "Head Coach"; chosen["team"] = tid; chosen["tenure"] = 0
        w.history["coach_moves"].append({"season": w.season, "team": tid, "type": "HIRED",
                                         "coach": chosen["name"], "from": prev,
                                         "mentor": mentor["name"] if mentor else ""})
        w.log("COACHING", f"{tid} hires {chosen['name']}"
                          + (f", previously with {prev}" if prev else ""))
    # backfill coordinator ranks so the pool never empties
    for tid in w.teams:
        for role in ("Offensive Coordinator", "Defensive Coordinator"):
            if not any(c["team"] == tid and c["role"] == role and not c["retired"]
                       for c in w.coaches.values()):
                cid = f"CN{w.season}{tid}{role[0]}{len(w.coaches)}"
                w.coaches[cid] = {
                    "cid": cid, "name": rand_coach_name(w.py), "team": tid, "role": role,
                    "age": int(w.rng.integers(34, 55)), "exp": int(w.rng.integers(6, 22)),
                    "tree": "Offensive" if role[0] == "O" else "Defensive",
                    "ovr": int(np.clip(w.rng.normal(62, 9), 35, 92)),
                    "mentor": "", "scheme_family": "", "tenure": 0,
                    "career_w": 0, "career_l": 0, "titles": 0, "retired": False}
    return moves


def update_prestige(w, rec, champ):
    for tid, t in w.teams.items():
        wins = rec[tid]["w"] if tid in rec else 8
        target = 22 + wins * 3.9 + (18 if tid == champ else 0) + t["titles"] * 2.2
        t["prestige"] += (float(np.clip(target, 5, 99)) - t["prestige"]) * 0.34
        for k in ("scouting", "development", "medical", "cap_mgmt"):
            t[k] = float(np.clip(t[k] + w.rng.normal(0, 2.6), 15, 95))
