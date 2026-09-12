"""Season engine: scheduling, game simulation, standings, tiebreakers, playoffs, awards."""
import random, collections
import numpy as np
from world import POSITION_IMPACT

def _rec_po(w, store, recorder, g, week):
    """Postseason games record into the PLAYOFFS bucket, never the regular season."""
    if store is None or recorder is None:
        return
    w._ur_cache = {}
    gid = f"P{w.season}W{week}{g['home']}{g['away']}"
    recorder(w, store, g["home"], g["away"], g["hbox"], g["h_td"], g["abox"],
             week, "PLAYOFFS", gid)
    recorder(w, store, g["away"], g["home"], g["abox"], g["a_td"], g["hbox"],
             week, "PLAYOFFS", gid)


AC = ["AC-E", "AC-N", "AC-S", "AC-W"]
NC = ["NC-E", "NC-N", "NC-S", "NC-W"]

# ---------------------------------------------------------------- SCHEDULE
def build_schedule(w):
    """NFL rotation formula. The rotation index advances each season and persists."""
    rot = w.schedule_rotation
    divt = collections.defaultdict(list)
    for t in w.teams.values():
        divt[t["div"]].append(t["team_id"])

    # intra-conference partner: a perfect matching that rotates yearly
    def intra_partner(divs, d, k):
        i = divs.index(d)
        offs = [1, 2, 3]
        o = offs[k % 3]
        return divs[(i + o) % 4]
    pairs = []
    for a, b in [(AC, NC), (NC, AC)]:
        pass
    intra_map = {}
    for divs in (AC, NC):
        k = rot % 3
        used = set()
        for d in divs:
            if d in used: continue
            p = intra_partner(divs, d, k)
            if p in used:
                p = next(x for x in divs if x not in used and x != d)
            intra_map[d] = p; intra_map[p] = d
            used.update({d, p})
    inter_map = {}
    for i, d in enumerate(AC):
        o = NC[(i + rot) % 4]
        inter_map[d] = o; inter_map[o] = d

    games = []
    # 6 divisional (home and away)
    for d, tl in divt.items():
        for i in range(len(tl)):
            for j in range(i + 1, len(tl)):
                games.append((tl[i], tl[j])); games.append((tl[j], tl[i]))
    # 4 intra-conference rotation
    seen = set()
    for d, o in intra_map.items():
        if (o, d) in seen: continue
        seen.add((d, o))
        for i, a in enumerate(divt[d]):
            for j, b in enumerate(divt[o]):
                games.append((a, b) if (i + j) % 2 == 0 else (b, a))
    # 4 inter-conference rotation
    seen = set()
    for d in AC:
        o = inter_map[d]
        if (o, d) in seen: continue
        seen.add((d, o))
        for i, a in enumerate(divt[d]):
            for j, b in enumerate(divt[o]):
                games.append((a, b) if (i + j) % 2 == 0 else (b, a))
    # 2 same-conference games vs same prior finish in the two remaining divisions
    for divs in (AC, NC):
        for d in divs:
            others = [x for x in divs if x != d and x != intra_map[d]]
            for od in others:
                if d > od: continue
                for a in divt[d]:
                    ra = w.prior_finish.get(a, 2)
                    b = min(divt[od], key=lambda x: abs(w.prior_finish.get(x, 2) - ra))
                    games.append((a, b) if ra % 2 == 0 else (b, a))
    # 17th game, cross-conference vs same prior finish
    for i, d in enumerate(AC):
        od = NC[(i + rot + 1) % 4]
        for a in divt[d]:
            ra = w.prior_finish.get(a, 2)
            b = min(divt[od], key=lambda x: abs(w.prior_finish.get(x, 2) - ra))
            games.append((a, b) if ra % 2 else (b, a))

    # trim/repair to exactly 17 per club
    cnt = collections.Counter()
    for a, b in games:
        cnt[a] += 1; cnt[b] += 1
    while any(v > 17 for v in cnt.values()):
        over = {t for t, v in cnt.items() if v > 17}
        for i, (a, b) in enumerate(games):
            if a in over and b in over:
                games.pop(i); cnt[a] -= 1; cnt[b] -= 1
                break
        else:
            for i, (a, b) in enumerate(games):
                if a in over or b in over:
                    games.pop(i); cnt[a] -= 1; cnt[b] -= 1
                    break
    under = [t for t, v in cnt.items() if v < 17]
    while len(under) >= 2:
        a, b = under[0], under[1]
        games.append((a, b)); cnt[a] += 1; cnt[b] += 1
        under = [t for t, v in cnt.items() if v < 17]

    # home/away balance
    hc = collections.Counter(a for a, _ in games)
    for _ in range(3000):
        hi = [t for t in w.teams if hc[t] > 9]
        lo = [t for t in w.teams if hc[t] < 8]
        if not hi or not lo: break
        for i, (a, b) in enumerate(games):
            if a in hi and b in lo:
                games[i] = (b, a); hc[a] -= 1; hc[b] += 1
                break
        else: break

    # weeks via min-conflicts; the unused week becomes each club's bye
    WEEKS = list(range(1, 19))
    r = random.Random(w.py.random())
    wk = [r.choice(WEEKS) for _ in games]
    load = collections.Counter()
    for (a, b), k in zip(games, wk):
        load[(a, k)] += 1; load[(b, k)] += 1
    for _ in range(300000):
        bad = [i for i, ((a, b), k) in enumerate(zip(games, wk))
               if load[(a, k)] > 1 or load[(b, k)] > 1]
        if not bad: break
        i = r.choice(bad); a, b = games[i]; cur = wk[i]
        load[(a, cur)] -= 1; load[(b, cur)] -= 1
        best, bc = [], 999
        for k in WEEKS:
            c = load[(a, k)] + load[(b, k)] + (3 if k in (1, 2, 3, 4, 15, 16, 17, 18) else 0)
            if c < bc: bc, best = c, [k]
            elif c == bc: best.append(k)
        k = r.choice(best); wk[i] = k
        load[(a, k)] += 1; load[(b, k)] += 1
    return [{"week": k, "home": a, "away": b, "played": False}
            for (a, b), k in zip(games, wk)]


# ---------------------------------------------------------------- UNIT RATINGS
def unit_ratings(w, tid):
    c = getattr(w, "_ur_cache", None)
    if c is not None and tid in c:
        return c[tid]
    ros = [p for p in w.roster(tid) if p["injury_weeks"] <= 0]
    byp = collections.defaultdict(list)
    for p in ros:
        byp[p["pos"]].append(p)
    for k in byp:
        byp[k].sort(key=lambda p: -(p["ovr"] + p["mental"]))

    def top(pos, n):
        g = byp.get(pos, [])
        if not g:
            return [45.0] * n
        v = [min(99, p["ovr"] + p["mental"]) for p in g[:n]]
        return v + [max(40.0, v[-1] - 12)] * (n - len(v))

    qb = top("QB", 1)[0]
    ol = np.mean(top("OT", 2) + top("OG", 2) + top("C", 1))
    wr = np.mean(top("WR", 3) + top("TE", 1))
    rb = np.mean(top("RB", 2))
    edge = np.mean(top("EDGE", 2)); dt = np.mean(top("DT", 2))
    lb = np.mean(top("LB", 3)); cb = np.mean(top("CB", 3)); s = np.mean(top("S", 2))
    res = {
        "pass_off": 0.52 * qb + 0.26 * ol + 0.22 * wr,
        "run_off": 0.34 * rb + 0.58 * ol + 0.08 * wr,
        "pass_def": 0.34 * edge + 0.16 * dt + 0.34 * cb + 0.16 * s,
        "run_def": 0.30 * dt + 0.26 * edge + 0.30 * lb + 0.14 * s,
        "kick": top("K", 1)[0], "byp": byp,
    }
    if c is not None:
        c[tid] = res
    return res


def weather(w, tid, week):
    t = w.teams[tid]
    if t.get("roof") in ("dome", "retractable"):
        return {"wind": 0.0, "cold": 0.0, "precip": 0.0}
    cold_state = t.get("state") in ("NY", "NJ", "MA", "WI", "MN", "MI", "OH", "PA", "IL", "MD", "CO")
    late = week >= 13
    wind = float(np.clip(w.rng.normal(7, 5), 0, 32))
    cold = 1.0 if (cold_state and late and w.rng.random() < 0.55) else 0.0
    precip = 1.0 if w.rng.random() < (0.20 if late else 0.11) else 0.0
    return {"wind": wind, "cold": cold, "precip": precip}


# ---------------------------------------------------------------- GAME SIM
def sim_game(w, home, away, week, neutral=False, playoff=False):
    H, A = unit_ratings(w, home), unit_ratings(w, away)
    wx = weather(w, home, week) if not neutral else {"wind": 0, "cold": 0, "precip": 0}
    hfa = 0.0 if neutral else 1.9

    def team_box(off, deff, is_home, coach_edge):
        pdiff = off["pass_off"] - deff["pass_def"] + (hfa if is_home else 0) + coach_edge
        rdiff = off["run_off"] - deff["run_def"] + (hfa * 0.5 if is_home else 0)
        wind_pen = wx["wind"] / 100.0 + wx["precip"] * 0.25 + wx["cold"] * 0.15
        plays = int(np.clip(w.rng.normal(63, 5), 48, 80))
        run_share = 0.42 + wx["precip"] * 0.05 + wx["cold"] * 0.03
        dropbacks = int(plays * (1 - run_share))
        rushes = plays - dropbacks
        sack_rate = float(np.clip(0.068 - 0.0022 * pdiff, 0.015, 0.16))
        sacks_taken = int(w.rng.binomial(dropbacks, sack_rate))
        att = max(dropbacks - sacks_taken, 8)
        comp_pct = float(np.clip(0.648 + 0.0068 * pdiff - wind_pen * 0.09, 0.35, 0.80))
        comps = int(w.rng.binomial(att, comp_pct))
        ypa = float(np.clip(7.05 + 0.105 * pdiff - wind_pen * 1.1, 3.4, 12.0))
        pass_yd = int(max(0, w.rng.normal(att * ypa, 42)))
        int_rate = float(np.clip(0.0245 - 0.0013 * pdiff + wind_pen * 0.004, 0.004, 0.075))
        ints = int(w.rng.binomial(att, int_rate))
        ypc = float(np.clip(4.32 + 0.058 * rdiff, 2.5, 6.4))
        rush_yd = int(max(0, w.rng.normal(rushes * ypc, 26)))
        return dict(plays=plays, att=att, comps=comps, pass_yd=pass_yd, ints=ints,
                    sacks_taken=sacks_taken, rushes=rushes, rush_yd=rush_yd,
                    pdiff=pdiff, rdiff=rdiff)

    hc_h = (w.coach_edge(home) if hasattr(w, "coach_edge") else 0.0)
    hc_a = (w.coach_edge(away) if hasattr(w, "coach_edge") else 0.0)
    hb = team_box(H, A, True, hc_h)
    ab = team_box(A, H, False, hc_a)

    def points(box, opp_box):
        drives = int(np.clip(w.rng.normal(11.2, 1.1), 8, 15))
        eff = (box["pdiff"] * 0.62 + box["rdiff"] * 0.38)
        p_td = float(np.clip(0.212 + 0.0165 * eff, 0.03, 0.58))
        p_fg = float(np.clip(0.168 + 0.0025 * eff, 0.05, 0.30))
        tds = int(w.rng.binomial(drives, p_td))
        fgs = int(w.rng.binomial(max(drives - tds, 0), p_fg))
        # turnovers suppress scoring
        tds = max(0, tds - int(box["ints"] * 0.35))
        return tds, fgs, 6 * tds + int(w.rng.binomial(tds, 0.94)) + 3 * fgs

    h_td, h_fg, h_pts = points(hb, ab)
    a_td, a_fg, a_pts = points(ab, hb)
    if h_pts == a_pts:                       # overtime
        h_pts += 3 if w.rng.random() < 0.52 else 0
        if h_pts == a_pts:
            a_pts += 3
    return {"home": home, "away": away, "home_pts": int(h_pts), "away_pts": int(a_pts),
            "hbox": hb, "abox": ab, "h_td": h_td, "a_td": a_td, "week": week,
            "playoff": playoff}


# ---------------------------------------------------------------- STAT ALLOCATION
def allocate_stats(w, tid, box, tds, opp_box):
    U = unit_ratings(w, tid)
    byp = U["byp"]
    def grp(pos, n): return byp.get(pos, [])[:n]

    qbs = grp("QB", 2)
    if qbs:
        q = qbs[0]
        st = q["season"]
        st["pass_att"] += box["att"]; st["pass_cmp"] += box["comps"]
        st["pass_yd"] += box["pass_yd"]; st["int"] += box["ints"]
        ptd = int(w.rng.binomial(tds, 0.62))
        st["pass_td"] += ptd; st["games"] += 1
        rtd = tds - ptd
    else:
        rtd = tds

    rbs = grp("RB", 3) or grp("FB", 1)
    shares = [0.58, 0.29, 0.13][:len(rbs)]
    if rbs:
        shares = [s / sum(shares) for s in shares]
        for p, sh in zip(rbs, shares):
            car = int(box["rushes"] * sh)
            p["season"]["rush_att"] += car
            p["season"]["rush_yd"] += int(box["rush_yd"] * sh)
            p["season"]["games"] += 1
        r_scorer = rbs[0]
        r_scorer["season"]["rush_td"] += int(w.rng.binomial(rtd, 0.72))

    tgts = grp("WR", 4) + grp("TE", 2) + grp("RB", 2)
    tw = [0.235, 0.185, 0.125, 0.055, 0.145, 0.045, 0.135, 0.075][:len(tgts)]
    if tgts:
        tw = [x / sum(tw) for x in tw]
        rem_td = max(0, tds - int(w.rng.binomial(tds, 0.38)))
        for i, (p, sh) in enumerate(zip(tgts, tw)):
            rec = int(box["comps"] * sh)
            p["season"]["rec"] += rec
            p["season"]["rec_yd"] += int(box["pass_yd"] * sh)
            if i < 3 and rem_td > 0 and w.rng.random() < 0.45:
                p["season"]["rec_td"] += 1; rem_td -= 1

    # defense credited against the opponent's box
    ed = grp("EDGE", 4) + grp("DT", 3)
    sk = opp_box["sacks_taken"]
    if ed and sk:
        wts = np.array([0.26, 0.20, 0.10, 0.06, 0.16, 0.12, 0.10][:len(ed)])
        wts = wts / wts.sum()
        for p, sh in zip(ed, wts):
            p["season"]["sacks"] += float(sk) * float(sh)
    dbs = grp("CB", 4) + grp("S", 3)
    if dbs and opp_box["ints"]:
        for _ in range(opp_box["ints"]):
            w.py.choice(dbs)["season"]["picks"] += 1
    tk = grp("LB", 3) + grp("S", 2) + grp("CB", 3)
    for p in tk:
        p["season"]["tackles"] += int(w.rng.normal(6, 2.4))
    seen = set()
    for p in tgts + list(ed) + dbs + tk:
        if p["pid"] not in seen:
            seen.add(p["pid"])
            p["season"]["games"] = p["season"].get("games", 0) + 1


# ---------------------------------------------------------------- STANDINGS
def new_record():
    return {"w": 0, "l": 0, "t": 0, "pf": 0, "pa": 0,
            "div_w": 0, "div_l": 0, "conf_w": 0, "conf_l": 0,
            "beat": set(), "lost_to": set(), "opponents": []}


def apply_result(w, rec, g):
    h, a = g["home"], g["away"]
    hd, ad = w.teams[h]["div"], w.teams[a]["div"]
    hc, ac = w.teams[h]["conf"], w.teams[a]["conf"]
    rec[h]["pf"] += g["home_pts"]; rec[h]["pa"] += g["away_pts"]
    rec[a]["pf"] += g["away_pts"]; rec[a]["pa"] += g["home_pts"]
    rec[h]["opponents"].append(a); rec[a]["opponents"].append(h)
    hw = g["home_pts"] > g["away_pts"]
    win, lose = (h, a) if hw else (a, h)
    rec[win]["w"] += 1; rec[lose]["l"] += 1
    rec[win]["beat"].add(lose); rec[lose]["lost_to"].add(win)
    if hd == ad:
        rec[win]["div_w"] += 1; rec[lose]["div_l"] += 1
    if hc == ac:
        rec[win]["conf_w"] += 1; rec[lose]["conf_l"] += 1


def tiebreak_key(w, rec, tid, pool):
    """Real NFL ordering: H2H, division, common games, conference, SOV, SOS."""
    r = rec[tid]
    pct = r["w"] / max(r["w"] + r["l"], 1)
    h2h = 0.0
    others = [t for t in pool if t != tid]
    if others:
        gm = sum(1 for o in others if o in r["beat"] or o in r["lost_to"])
        wn = sum(1 for o in others if o in r["beat"])
        h2h = wn / gm if gm else 0.5
    divp = r["div_w"] / max(r["div_w"] + r["div_l"], 1)
    confp = r["conf_w"] / max(r["conf_w"] + r["conf_l"], 1)
    common = set(r["opponents"])
    for o in others:
        common &= set(rec[o]["opponents"])
    if common:
        cw = sum(1 for o in r["opponents"] if o in common and o in r["beat"])
        cg = sum(1 for o in r["opponents"] if o in common)
        commonp = cw / cg if cg else 0.5
    else:
        commonp = 0.5
    sov = np.mean([rec[o]["w"] / 17 for o in r["beat"]]) if r["beat"] else 0.0
    sos = np.mean([rec[o]["w"] / 17 for o in r["opponents"]]) if r["opponents"] else 0.0
    return (pct, h2h, divp, commonp, confp, sov, sos, r["pf"] - r["pa"])


def seed_conference(w, rec, conf):
    divs = AC if conf == "AC" else NC
    winners, rest = [], []
    for d in divs:
        tl = [t for t in w.teams if w.teams[t]["div"] == d]
        tl.sort(key=lambda t: tiebreak_key(w, rec, t, tl), reverse=True)
        winners.append(tl[0]); rest += tl[1:]
    winners.sort(key=lambda t: tiebreak_key(w, rec, t, winners), reverse=True)
    rest.sort(key=lambda t: tiebreak_key(w, rec, t, rest), reverse=True)
    return winners + rest[:w.rules.playoff_teams_per_conf - 4]


def run_playoffs(w, rec, store=None, recorder=None):
    bracket = {}
    finalists = []
    for conf in ("AC", "NC"):
        seeds = seed_conference(w, rec, conf)
        bracket[conf] = list(seeds)
        alive = {s: seeds[s] for s in range(7)}
        # wild card: 2v7, 3v6, 4v5 (1 seed byes)
        rnd = [(1, 6), (2, 5), (3, 4)]
        survivors = [seeds[0]]
        for hi, lo in rnd:
            g = sim_game(w, seeds[hi], seeds[lo], 19, playoff=True)
            _rec_po(w, store, recorder, g, 19)
            survivors.append(g["home"] if g["home_pts"] > g["away_pts"] else g["away"])
        survivors.sort(key=lambda t: seeds.index(t))
        # divisional
        g1 = sim_game(w, survivors[0], survivors[-1], 20, playoff=True)
        g2 = sim_game(w, survivors[1], survivors[2], 20, playoff=True)
        _rec_po(w, store, recorder, g1, 20); _rec_po(w, store, recorder, g2, 20)
        f = [g1["home"] if g1["home_pts"] > g1["away_pts"] else g1["away"],
             g2["home"] if g2["home_pts"] > g2["away_pts"] else g2["away"]]
        f.sort(key=lambda t: seeds.index(t))
        gc = sim_game(w, f[0], f[1], 21, playoff=True)
        _rec_po(w, store, recorder, gc, 21)
        finalists.append(gc["home"] if gc["home_pts"] > gc["away_pts"] else gc["away"])
    sb = sim_game(w, finalists[0], finalists[1], 22, neutral=True, playoff=True)
    _rec_po(w, store, recorder, sb, 22)
    champ = sb["home"] if sb["home_pts"] > sb["away_pts"] else sb["away"]
    runner = sb["away"] if champ == sb["home"] else sb["home"]
    return champ, runner, bracket


# ---------------------------------------------------------------- AWARDS
def season_awards(w, rec):
    act = [p for p in w.players.values()
           if not p["retired"] and p["team"] in w.teams and p["season"]["games"] > 0]
    def val(p):
        s = p["season"]
        v = (s["pass_yd"] * 0.045 + s["pass_td"] * 4.2 - s["int"] * 2.6
             + s["rush_yd"] * 0.09 + s["rush_td"] * 5.0
             + s["rec_yd"] * 0.085 + s["rec_td"] * 5.0
             + s["sacks"] * 6.2 + s["picks"] * 7.0 + s["tackles"] * 0.22)
        tw = rec[p["team"]]["w"] if p["team"] in rec else 8
        return v + tw * 1.6
    if not act:
        return {}
    mvp = max(act, key=val)
    off = max([p for p in act if p["grp"] in ("QB", "RB", "WR", "TE", "OL")], key=val, default=mvp)
    dpl = [p for p in act if p["grp"] in ("EDGE", "DT", "LB", "CB", "S")]
    dpoy = max(dpl, key=val) if dpl else mvp
    rooks = [p for p in act if p["exp"] == 0]
    orook = max([p for p in rooks if p["grp"] in ("QB", "RB", "WR", "TE", "OL")],
                key=val, default=None)
    drook = max([p for p in rooks if p["grp"] in ("EDGE", "DT", "LB", "CB", "S")],
                key=val, default=None)
    # all-pro: best at each position group
    allpro = []
    for g in ("QB", "RB", "WR", "TE", "OL", "EDGE", "DT", "LB", "CB", "S"):
        pool = [p for p in act if p["grp"] == g]
        if pool:
            allpro += sorted(pool, key=val, reverse=True)[:2 if g in ("WR", "OL", "EDGE", "CB") else 1]
    for p in allpro:
        p["career"]["all_pros"] += 1
    probowl = sorted(act, key=val, reverse=True)[:88]
    for p in probowl:
        p["career"]["pro_bowls"] += 1
    mvp["career"]["mvps"] += 1
    return {"mvp": mvp, "opoy": off, "dpoy": dpoy, "oroy": orook, "droy": drook,
            "all_pro": allpro}
