"""History layer: per-game recording, season/career aggregation, voting, records."""
import collections, math
import numpy as np
import stats as ST
from stats import REG, PO, ROUNDS, MIN_SNAPS, SNAPS_PER_GAME

SKILL = {"WR", "TE", "RB", "FB"}
OL = {"OT", "OG", "C"}
FRONT = {"EDGE", "DT"}
COVER = {"CB", "S"}


# ---------------------------------------------------------------- RECORDING
def record_game(w, store, tid, opp, box, tds, opp_box, week, comp, game_id):
    """One row per participating player, tagged REGULAR_SEASON or PLAYOFFS."""
    import season as SN
    U = SN.unit_ratings(w, tid)
    byp = U["byp"]
    rnd = ROUNDS.get(week, "")
    opp_str = 0.0
    forms = w.forms

    def emit(p, line, gz, comps):
        line["player_id"] = p["pid"]; line["game_id"] = game_id
        line["season"] = w.season; line["week"] = week; line["team_id"] = tid
        line["opponent_id"] = opp; line["competition_type"] = comp
        line["playoff_round"] = rnd; line["position"] = p["pos"]
        store.add_game(dict(line))
        g = {"player_id": p["pid"], "game_id": game_id, "season": w.season,
             "week": week, "team_id": tid, "competition_type": comp,
             "playoff_round": rnd, "position": p["pos"],
             "snaps": line.get("snaps", 0), "overall_grade": round(ST.z_to_grade(gz), 1)}
        for c, cz in comps.items():
            g[c] = round(ST.z_to_grade(cz), 1)
        store.add_game_grade(g)
        # accumulate season aggregates keyed by (player, team, competition)
        key = (p["pid"], tid, comp)
        agg = w.season_agg.setdefault(key, {"line": collections.defaultdict(float),
                                            "gz": [], "snaps": [], "comps": collections.defaultdict(list)})
        # identity fields are constants, not quantities: summing them produced
        # season == 2026*16 == 32416 in the first export
        IDENTITY = ("season", "week", "player_id", "game_id", "team_id",
                    "opponent_id", "competition_type", "playoff_round", "position")
        for k, v in line.items():
            if isinstance(v, (int, float)) and k not in IDENTITY:
                agg["line"][k] += v
        agg["gz"].append(gz); agg["snaps"].append(line.get("snaps", 0))
        for c, cz in comps.items():
            agg["comps"][c].append(cz)

    def comps_for(p, gz):
        out = {}
        for c in ST.POS_COMPONENTS[p["pos"]]:
            out[c] = gz * 0.72 + float(w.rng.normal(0, 0.62))
        return out

    def gz_of(p):
        f = forms.get(p["pid"])
        if f is None:
            f = forms[p["pid"]] = ST.season_form(w, p)
        return ST.snap_grade_z(w, p, f, opp_str)

    def snaps_of(p, mult=1.0):
        return int(max(1, w.rng.normal(SNAPS_PER_GAME[p["pos"]] * mult, 4)))

    qbs = byp.get("QB", [])
    if qbs:
        p = qbs[0]; gz = gz_of(p)
        line = ST.gen_qb(w, p, box, tds, gz, snaps_of(p))
        rtd = tds - line["pass_td"]
        emit(p, line, gz, comps_for(p, gz))
    else:
        rtd = tds

    rbs = byp.get("RB", [])[:3]
    shares = [0.58, 0.29, 0.13][:len(rbs)]
    if rbs:
        shares = [s / sum(shares) for s in shares]
        for i, (p, sh) in enumerate(zip(rbs, shares)):
            gz = gz_of(p)
            line = ST.gen_skill(w, p, sh, box, rtd, gz, snaps_of(p, 0.4 + sh), True)
            if i == 0:
                line["rush_td"] = int(w.rng.binomial(max(rtd, 0), 0.72))
            emit(p, line, gz, comps_for(p, gz))

    tgt = byp.get("WR", [])[:4] + byp.get("TE", [])[:2]
    tw = [0.235, 0.185, 0.125, 0.055, 0.145, 0.045][:len(tgt)]
    if tgt:
        tw = [x / sum(tw) for x in tw]
        rec_td = max(0, tds - rtd - 0)
        for i, (p, sh) in enumerate(zip(tgt, tw)):
            gz = gz_of(p)
            line = ST.gen_skill(w, p, sh, box, rec_td, gz, snaps_of(p), False)
            if i < 3 and rec_td > 0 and w.rng.random() < 0.42:
                line["rec_td"] = 1; rec_td -= 1
            emit(p, line, gz, comps_for(p, gz))

    ols = (byp.get("OT", [])[:2] + byp.get("OG", [])[:2] + byp.get("C", [])[:1])
    for p in ols:
        gz = gz_of(p)
        line = ST.gen_ol(w, p, gz, snaps_of(p), box["sacks_taken"], 1.0 / max(len(ols), 1))
        emit(p, line, gz, comps_for(p, gz))

    front = byp.get("EDGE", [])[:4] + byp.get("DT", [])[:3]
    sk = opp_box["sacks_taken"]
    if front:
        wts = np.array([.26, .20, .10, .06, .16, .12, .10][:len(front)])
        wts = wts / wts.sum()
        alloc = w.rng.multinomial(int(sk), wts) if sk else [0] * len(front)
        for p, a in zip(front, alloc):
            gz = gz_of(p)
            emit(p, ST.gen_front(w, p, gz, snaps_of(p), float(a)), gz, comps_for(p, gz))

    lbs = byp.get("LB", [])[:3]
    dbs = byp.get("CB", [])[:4] + byp.get("S", [])[:3]
    picks_left = opp_box["ints"]
    for p in lbs:
        gz = gz_of(p)
        pk = 1 if (picks_left > 0 and w.rng.random() < 0.18) else 0
        picks_left -= pk
        emit(p, ST.gen_lb(w, p, gz, snaps_of(p), max(0, int(w.rng.normal(6.2, 2.2))), pk),
             gz, comps_for(p, gz))
    for p in dbs:
        gz = gz_of(p)
        pk = 1 if (picks_left > 0 and w.rng.random() < 0.42) else 0
        picks_left -= pk
        emit(p, ST.gen_cover(w, p, gz, snaps_of(p), pk, max(0, int(w.rng.normal(4.4, 1.9)))),
             gz, comps_for(p, gz))
    for p in byp.get("K", [])[:1]:
        gz = gz_of(p); emit(p, ST.gen_k(w, p, gz, 0), gz, comps_for(p, gz))
    for p in byp.get("P", [])[:1]:
        gz = gz_of(p); emit(p, ST.gen_p(w, p, gz), gz, comps_for(p, gz))


def finalize_season_stats(w, store):
    """Collapse per-game aggregates into permanent season rows. Never overwrites."""
    rows, grows = [], []
    for (pid, tid, comp), agg in w.season_agg.items():
        p = w.players.get(pid)
        if not p:
            continue
        snaps = sum(agg["snaps"])
        wts = np.array(agg["snaps"], dtype=float)
        wts = wts / wts.sum() if wts.sum() else np.ones(len(agg["gz"])) / max(len(agg["gz"]), 1)
        zbar = float(np.dot(wts, agg["gz"]))
        row = {"player_id": pid, "season": w.season, "team_id": tid,
               "competition_type": comp, "position": p["pos"], "snaps": snaps}
        row.update({k: (round(v, 2) if isinstance(v, float) else v)
                    for k, v in agg["line"].items()})
        rows.append(row)
        g = {"player_id": pid, "season": w.season, "team_id": tid,
             "competition_type": comp, "position": p["pos"], "snaps": snaps,
             "games": len(agg["gz"]),
             "overall_grade": round(ST.z_to_grade(zbar), 1),
             "qualified": int(snaps >= MIN_SNAPS.get(p["pos"], 300)
                              and comp == REG)}
        for c, lst in agg["comps"].items():
            g[c] = round(ST.z_to_grade(float(np.average(lst, weights=wts[:len(lst)]
                                                        if len(lst) == len(wts) else None))), 1)
        grows.append(g)
    store.season_rows += rows
    store.grade_rows += grows
    return rows, grows


# ---------------------------------------------------------------- CONTEXT
def percentile_tables(w, rows, grows):
    """Era normalization: everything is judged against this season's own league."""
    bypos = collections.defaultdict(list)
    gmap = {(g["player_id"], g["team_id"]): g for g in grows if g["competition_type"] == REG}
    merged = {}
    for r in rows:
        if r["competition_type"] != REG:
            continue
        k = r["player_id"]
        m = merged.setdefault(k, {"player_id": k, "position": r["position"], "snaps": 0,
                                  "teams": [], "games": 0})
        for kk, vv in r.items():
            if isinstance(vv, (int, float)) and kk not in ("season",):
                m[kk] = m.get(kk, 0) + vv
        m["teams"].append(r["team_id"])
        g = gmap.get((r["player_id"], r["team_id"]))
        if g:
            m["grade"] = g["overall_grade"]
    for m in merged.values():
        bypos[m["position"]].append(m)
    pct = {}
    for pos, lst in bypos.items():
        for field in ("pass_yd", "pass_td", "rush_yd", "rec_yd", "rec", "sacks",
                      "int", "pressures", "grade", "run_stops", "tackles",
                      "pass_breakups", "forced_incompletions"):
            vals = np.array([m.get(field, 0) or 0 for m in lst], dtype=float)
            if vals.max() == vals.min():
                continue
            order = vals.argsort().argsort() / max(len(vals) - 1, 1)
            for m, q in zip(lst, order):
                pct[(m["player_id"], field)] = float(q)
    return merged, pct


PRODUCTION = {
    "QB": [("pass_yd", .22), ("pass_td", .30), ("int", -.18)],
    "RB": [("rush_yd", .40), ("rush_td", .22), ("rec_yd", .16)],
    "FB": [("rush_yd", .3), ("rec_yd", .3)],
    "WR": [("rec_yd", .44), ("rec", .18), ("rec_td", .22)],
    "TE": [("rec_yd", .42), ("rec", .20), ("rec_td", .22)],
    "OT": [], "OG": [], "C": [],
    "EDGE": [("sacks", .36), ("pressures", .30), ("run_stops", .12)],
    "DT": [("sacks", .28), ("pressures", .30), ("run_stops", .22)],
    "LB": [("tackles", .22), ("run_stops", .26), ("int", .14), ("sacks", .14)],
    "CB": [("int", .26), ("forced_incompletions", .26), ("pass_breakups", .20)],
    "S": [("int", .24), ("tackles", .20), ("forced_incompletions", .22)],
    "K": [], "P": [], "LS": [],
}
POS_VALUE_MVP = {"QB": 1.00, "EDGE": 0.52, "WR": 0.50, "RB": 0.46, "OT": 0.40, "CB": 0.42,
                 "DT": 0.42, "TE": 0.38, "LB": 0.38, "S": 0.36, "OG": 0.30, "C": 0.28,
                 "FB": 0.10, "K": 0.16, "P": 0.08, "LS": 0.04}


def perf_score(m, pct, grade_w=0.42):
    """Production percentile blended with grade. Weights kept low-correlation."""
    prod = 0.0
    for f, wgt in PRODUCTION.get(m["position"], []):
        q = pct.get((m["player_id"], f), 0.5)
        prod += (q if wgt > 0 else (1 - q)) * abs(wgt)
    gq = pct.get((m["player_id"], "grade"), 0.5)
    return (1 - grade_w) * prod + grade_w * gq


def narrative_score(w, m, rec, expect):
    """Derived from what actually happened, never assigned arbitrarily."""
    tid = m["teams"][-1] if m["teams"] else None
    if tid not in rec:
        return 0.0
    wins = rec[tid]["w"]
    surprise = float(np.clip((wins - expect.get(tid, 8.5)) / 5.0, -1, 1))
    n = 0.45 * max(0.0, surprise)
    if w.season_records_broken.get(m["player_id"]):
        n += 0.40
    n += 0.20 * float(np.clip(w.late_surge.get(m["player_id"], 0.0), -1, 1))
    return float(np.clip(n, 0, 1))


VOTERS = [("BALANCED", .30), ("TRADITIONAL_STATS", .16), ("ANALYTICS", .16),
          ("TEAM_SUCCESS", .14), ("POSITIONAL_VALUE", .10), ("NARRATIVE", .08),
          ("EFFICIENCY", .06)]
VOTER_W = {  # perf, grade, team, posvalue, narrative, reputation
    "BALANCED":          (.42, .18, .18, .12, .06, .04),
    "TRADITIONAL_STATS": (.58, .04, .18, .10, .06, .04),
    "ANALYTICS":         (.30, .46, .10, .10, .02, .02),
    "TEAM_SUCCESS":      (.32, .12, .42, .08, .04, .02),
    "POSITIONAL_VALUE":  (.34, .16, .14, .30, .04, .02),
    "NARRATIVE":         (.28, .10, .16, .08, .30, .08),
    "EFFICIENCY":        (.24, .40, .12, .12, .06, .06),
}


def run_ballot(w, cands, rec, expect, pct, award, n_voters=50, pos_value=True,
               rep_boost=0.0, seats=1, posv_scale=1.0):
    """Simulated voters. Disagreement comes from weighting, not from noise alone."""
    if not cands:
        return []
    scored = []
    for m in cands:
        p = w.players[m["player_id"]]
        tid = m["teams"][-1] if m["teams"] else None
        team_q = (rec[tid]["w"] / 17.0) if tid in rec else 0.5
        scored.append({
            "m": m, "perf": perf_score(m, pct),
            "grade": pct.get((m["player_id"], "grade"), 0.5),
            "team": team_q,
            "posv": POS_VALUE_MVP.get(m["position"], 0.3) if pos_value else 0.55,
            "narr": narrative_score(w, m, rec, expect),
            "rep": float(np.clip((p["reputation"] - 60) / 35.0, 0, 1)),
        })
    tally = collections.Counter()
    kinds = [k for k, _ in VOTERS]
    probs = [v for _, v in VOTERS]
    for _ in range(n_voters):
        kind = kinds[int(w.rng.choice(len(kinds), p=probs))]
        a, b, c, d, e, f = VOTER_W[kind]
        best, bs = None, -9
        for s in scored:
            v = (a * s["perf"] + b * s["grade"] + c * s["team"]
                 + d * posv_scale * s["posv"]
                 + e * s["narr"] + (f + rep_boost) * s["rep"])
            v += float(w.rng.normal(0, 0.022))     # individual taste, not chaos
            if v > bs:
                bs, best = v, s
        tally[best["m"]["player_id"]] += 1
    ranked = tally.most_common()
    return [{"player_id": pid, "votes": v, "vote_share": round(v / n_voters, 3),
             "final_rank": i + 1} for i, (pid, v) in enumerate(ranked)]


def eligible(m, min_games=10):
    return m.get("games", 0) >= min_games or m.get("snaps", 0) >= 400


# ---------------------------------------------------------------- AWARDS
ALLPRO_SLOTS = {"QB": 1, "RB": 1, "WR": 3, "TE": 1, "OT": 2, "OG": 2, "C": 1,
                "EDGE": 2, "DT": 2, "LB": 2, "CB": 2, "S": 2, "K": 1, "P": 1}
ALLSTAR_SLOTS = {"QB": 3, "RB": 3, "WR": 4, "TE": 2, "OT": 3, "OG": 3, "C": 2,
                 "EDGE": 4, "DT": 3, "LB": 4, "CB": 4, "S": 3, "K": 1, "P": 1}


def run_awards(w, store, rec, expect, merged, pct):
    out = {"voting": [], "honors": [], "awards": {}}
    pool = [m for m in merged.values() if eligible(m)]

    def top_pool(filt, n=12, gw=0.42, per_pos=3, posv=0.0):
        """Pool is built per position first.

        A flat top-N is biased by roster construction: there are ~290 qualified
        EDGE and ~64 QB, so an undifferentiated list fills with pass rushers
        before a quarterback appears. Taking the best few at each position and
        then ranking gives every position a fair path in.
        """
        c = [m for m in pool if filt(m)]
        byp = collections.defaultdict(list)
        for m in c:
            byp[m["position"]].append(m)
        short = []
        for ps, lst in byp.items():
            lst.sort(key=lambda m: -perf_score(m, pct, gw))
            short += lst[:per_pos]
        short.sort(key=lambda m: -(perf_score(m, pct, gw)
                                   + posv * POS_VALUE_MVP.get(m["position"], .3)))
        return short[:n]

    def award(name, cands, **kw):
        res = run_ballot(w, cands, rec, expect, pct, name, **kw)
        for r in res:
            out["voting"].append({"season": w.season, "award_type": name, **r,
                                  "team_id": w.players[r["player_id"]]["team"],
                                  "position": w.players[r["player_id"]]["pos"]})
        if res:
            wid = res[0]["player_id"]
            out["awards"][name] = wid
            add_honor(w, wid, name)
        return res

    award("MVP", top_pool(lambda m: True, 16, per_pos=2, posv=0.22), posv_scale=1.9)
    award("OPOY", top_pool(lambda m: m["position"] in
                           ("QB", "RB", "WR", "TE", "FB"), 12, per_pos=3),
          pos_value=False)
    award("DPOY", top_pool(lambda m: m["position"] in ("EDGE", "DT", "LB", "CB", "S"),
                           12, per_pos=3), pos_value=False)
    rook = [m for m in pool if w.players[m["player_id"]]["exp"] == 0]
    award("OROY", sorted([m for m in rook if m["position"] in
                          ("QB", "RB", "WR", "TE", "FB", "OT", "OG", "C")],
                         key=lambda m: -perf_score(m, pct))[:8], pos_value=False)
    award("DROY", sorted([m for m in rook if m["position"] in
                          ("EDGE", "DT", "LB", "CB", "S")],
                         key=lambda m: -perf_score(m, pct))[:8], pos_value=False)

    # most improved: change in performance versus the player's own prior season
    mip = []
    for m in pool:
        prev = w.prev_perf.get(m["player_id"])
        if prev is None:
            continue
        cur = perf_score(m, pct)
        gain = cur - prev
        if gain > 0.10 and cur > 0.55:
            mm = dict(m); mm["_gain"] = gain
            mip.append(mm)
    mip.sort(key=lambda m: -m["_gain"])
    award("MOST_IMPROVED", mip[:10], pos_value=False)

    # ---- All-Pro: grade-weighted, availability penalised
    firsts, seconds = [], []
    for pos, n in ALLPRO_SLOTS.items():
        cands = [m for m in merged.values()
                 if m["position"] == pos
                 and m.get("snaps", 0) >= MIN_SNAPS.get(pos, 300)]
        if not cands:
            continue
        ranked = []
        for m in cands:
            s = perf_score(m, pct, grade_w=0.55)
            s *= float(np.clip(m.get("games", 17) / 16.0, 0.45, 1.0))
            tid = m["teams"][-1] if m["teams"] else None
            s += 0.05 * ((rec[tid]["w"] / 17.0) if tid in rec else 0.5)
            p = w.players[m["player_id"]]
            s += 0.03 * float(np.clip((p["reputation"] - 60) / 35.0, 0, 1))
            s += float(w.rng.normal(0, 0.012))
            ranked.append((s, m))
        ranked.sort(key=lambda x: -x[0])
        for s, m in ranked[:n]:
            firsts.append((pos, m["player_id"]))
            add_honor(w, m["player_id"], "FIRST_TEAM_ALL_PRO")
        for s, m in ranked[n:n * 2]:
            seconds.append((pos, m["player_id"]))
            add_honor(w, m["player_id"], "SECOND_TEAM_ALL_PRO")

    # ---- All-Star: by conference, reputation weighted more heavily
    allstars = []
    for conf in ("AC", "NC"):
        for pos, n in ALLSTAR_SLOTS.items():
            cands = [m for m in merged.values()
                     if m["position"] == pos and m.get("snaps", 0) >= MIN_SNAPS.get(pos, 300) * 0.6
                     and (m["teams"] and w.teams.get(m["teams"][-1], {}).get("conf") == conf)]
            if not cands:
                continue
            ranked = []
            for m in cands:
                p = w.players[m["player_id"]]
                s = perf_score(m, pct, grade_w=0.34)
                s += 0.20 * float(np.clip((p["reputation"] - 58) / 35.0, 0, 1))
                s += 0.07 * len(w.honors.get(m["player_id"], []))  / 6.0
                tid = m["teams"][-1]
                s += 0.06 * ((rec[tid]["w"] / 17.0) if tid in rec else 0.5)
                s += float(w.rng.normal(0, 0.02))
                ranked.append((s, m))
            ranked.sort(key=lambda x: -x[0])
            for s, m in ranked[:n]:
                allstars.append((conf, pos, m["player_id"]))
                add_honor(w, m["player_id"], "ALL_STAR")

    out["all_pro_first"] = firsts
    out["all_pro_second"] = seconds
    out["all_star"] = allstars
    for m in merged.values():
        w.prev_perf[m["player_id"]] = perf_score(m, pct)
    return out


def add_honor(w, pid, honor):
    w.honors.setdefault(pid, []).append({"season": w.season, "honor": honor})


# ---------------------------------------------------------------- RECORDS
RECORD_FIELDS = [("pass_yd", "max"), ("pass_td", "max"), ("rush_yd", "max"),
                 ("rush_td", "max"), ("rec", "max"), ("rec_yd", "max"),
                 ("rec_td", "max"), ("sacks", "max"), ("int", "max"),
                 ("tackles", "max"), ("forced_fumbles", "max")]


def update_records(w, merged, comp=REG):
    """Regular-season and playoff record books are kept entirely separate."""
    book = w.records.setdefault(comp, {})
    w.season_records_broken = {}
    for field, _ in RECORD_FIELDS:
        best_pid, best_val = None, -1
        for m in merged.values():
            v = m.get(field, 0) or 0
            if v > best_val:
                best_val, best_pid = v, m["player_id"]
        if best_pid is None:
            continue
        w.season_leaders.append({"season": w.season, "competition_type": comp,
                                 "category": field, "player_id": best_pid,
                                 "value": round(best_val, 2)})
        key = f"season_{field}"
        cur = book.get(key)
        if cur is None or best_val > cur["value"]:
            prev = cur["player_id"] if cur else ""
            prev_v = cur["value"] if cur else 0
            book[key] = {"player_id": best_pid, "value": round(best_val, 2),
                         "season": w.season}
            if cur:
                w.season_records_broken[best_pid] = True
                w.record_history.append({
                    "season": w.season, "competition_type": comp, "record": key,
                    "new_holder": best_pid, "new_value": round(best_val, 2),
                    "previous_holder": prev, "previous_value": round(prev_v, 2)})
                w.log("RECORD", f"{w.players[best_pid]['name']} breaks the single-season "
                                f"{field} record: {best_val:.0f} (old {prev_v:.0f})")
    # career records
    for field, _ in RECORD_FIELDS:
        best_pid, best_val = None, -1
        for pid, c in w.career.get(comp, {}).items():
            v = c.get(field, 0) or 0
            if v > best_val:
                best_val, best_pid = v, pid
        if best_pid is None:
            continue
        key = f"career_{field}"
        cur = book.get(key)
        if cur is None or best_val > cur["value"]:
            if cur and cur["player_id"] != best_pid:
                w.record_history.append({
                    "season": w.season, "competition_type": comp, "record": key,
                    "new_holder": best_pid, "new_value": round(best_val, 2),
                    "previous_holder": cur["player_id"],
                    "previous_value": round(cur["value"], 2)})
            book[key] = {"player_id": best_pid, "value": round(best_val, 2),
                         "season": w.season}


def accumulate_career(w, rows):
    """Career totals are derived from season rows and split by competition."""
    for r in rows:
        comp = r["competition_type"]
        c = w.career.setdefault(comp, {}).setdefault(r["player_id"], collections.defaultdict(float))
        for k, v in r.items():
            if isinstance(v, (int, float)) and k not in ("season", "week"):
                c[k] += v
        c["seasons_played"] = c.get("seasons_played", 0)
