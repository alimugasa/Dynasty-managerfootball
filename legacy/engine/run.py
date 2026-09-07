"""Run the league forward and validate that it stays sane for decades."""
import sys, os, json, collections
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from world import World, Rules, PEAK_AGE
import season as SN
import offseason as OS
import stats as ST
import history as H
from stats import StatStore, REG, PO

BLANK = {"games": 0, "pass_att": 0, "pass_cmp": 0, "pass_yd": 0, "pass_td": 0, "int": 0,
         "rush_att": 0, "rush_yd": 0, "rush_td": 0, "rec": 0, "rec_yd": 0, "rec_td": 0,
         "sacks": 0.0, "tackles": 0, "picks": 0}


def reset_season_stats(w):
    for p in w.players.values():
        p["season"] = dict(BLANK)


def preseason_expectations(w):
    """Frozen before Week 1 so Coach of the Year cannot be judged with hindsight."""
    exp = {}
    for tid in w.teams:
        ros = sorted([p["ovr"] + p["mental"] for p in w.roster(tid)], reverse=True)[:24]
        talent = float(np.mean(ros)) if ros else 65.0
        exp[tid] = float(np.clip((talent - 66) * 0.72 + 8.5, 3.0, 13.0))
    return exp


def run_season(w, collect=None, store=None):
    w.rules = Rules(w.season)
    reset_season_stats(w)
    sched = SN.build_schedule(w)
    rec = {t: SN.new_record() for t in w.teams}
    w.forms = {}
    w.season_agg = {}
    w.season_records_broken = {}
    w.late_surge = {}
    expect = preseason_expectations(w)
    w.expectations[w.season] = dict(expect)
    gid = 0

    w.reindex()
    for week in range(1, w.rules.weeks + 1):
        OS.weekly_injuries(w)
        w._ur_cache = {}                     # health changed, so ratings must refresh
        for g in [x for x in sched if x["week"] == week]:
            r = SN.sim_game(w, g["home"], g["away"], week)
            SN.apply_result(w, rec, r)
            SN.allocate_stats(w, g["home"], r["hbox"], r["h_td"], r["abox"])
            SN.allocate_stats(w, g["away"], r["abox"], r["a_td"], r["hbox"])
            if store is not None:
                gid += 1
                game_id = f"G{w.season}W{week:02d}{gid:04d}"
                H.record_game(w, store, g["home"], g["away"], r["hbox"], r["h_td"],
                              r["abox"], week, REG, game_id)
                H.record_game(w, store, g["away"], g["home"], r["abox"], r["a_td"],
                              r["hbox"], week, REG, game_id)
            if collect is not None:
                collect["games"].append((r["home_pts"], r["away_pts"],
                                         r["hbox"], r["abox"]))
            g["played"] = True

    # regular season is closed out BEFORE the playoffs so postseason production
    # can never leak into regular-season totals, grades, records or awards
    reg_rows = reg_grades = None
    merged = pct = None
    if store is not None:
        reg_rows, reg_grades = H.finalize_season_stats(w, store)
        H.accumulate_career(w, reg_rows)
        merged, pct = H.percentile_tables(w, reg_rows, reg_grades)
        H.update_records(w, merged, REG)
        awards_pkg = H.run_awards(w, store, rec, expect, merged, pct)
        w.history["awards"].append({"season": w.season, **awards_pkg["awards"]})
        w.award_voting += awards_pkg["voting"]
        w.all_pro += [{"season": w.season, "team": "FIRST", "position": p, "player_id": i}
                      for p, i in awards_pkg["all_pro_first"]]
        w.all_pro += [{"season": w.season, "team": "SECOND", "position": p, "player_id": i}
                      for p, i in awards_pkg["all_pro_second"]]
        w.all_star += [{"season": w.season, "conference": c, "position": p, "player_id": i}
                       for c, p, i in awards_pkg["all_star"]]
        w.season_agg = {}          # playoffs aggregate into a separate bucket

    champ, runner, bracket = SN.run_playoffs(w, rec, store, H.record_game)
    w.teams[champ]["titles"] += 1
    for tid, seeds in bracket.items():
        for t in seeds:
            w.teams[t]["playoff_apps"] += 1
    for p in w.roster(champ):
        p["career"]["rings"] += 1

    if store is not None:
        po_rows, po_grades = H.finalize_season_stats(w, store)
        H.accumulate_career(w, po_rows)
        po_merged, _ = H.percentile_tables(w, po_rows, po_grades)
        H.update_records(w, po_merged, PO)
        store.flush_games(w.season)
    awards = SN.season_awards(w, rec)
    for p in w.players.values():
        if p["retired"]:
            continue
        s = p["season"]
        if s["games"] or s["pass_att"] or s["rush_att"] or s["rec"]:
            c = p["career"]
            c["seasons"] += 1
            for k in ("pass_yd", "pass_td", "int", "rush_yd", "rush_td",
                      "rec", "rec_yd", "rec_td", "tackles", "picks"):
                c[k] += s[k]
            c["sacks"] += s["sacks"]

    # division finish order feeds next year's schedule rotation
    for d in set(t["div"] for t in w.teams.values()):
        tl = [t for t in w.teams if w.teams[t]["div"] == d]
        tl.sort(key=lambda t: SN.tiebreak_key(w, rec, t, tl), reverse=True)
        for i, t in enumerate(tl):
            w.prior_finish[t] = i + 1

    hist = {"season": w.season, "champion": champ, "runner_up": runner,
            "mvp": awards.get("mvp", {}).get("name", ""),
            "mvp_pos": awards.get("mvp", {}).get("pos", ""),
            "dpoy": awards.get("dpoy", {}).get("name", ""),
            "oroy": (awards.get("oroy") or {}).get("name", ""),
            "best_record": max(rec, key=lambda t: rec[t]["w"]),
            "best_wins": max(r["w"] for r in rec.values())}
    w.history["seasons"].append(hist)

    # ---- offseason, in calendar order
    OS.coaching_carousel(w, rec)
    OS.update_prestige(w, rec, champ)
    OS.develop(w)
    n_ret = OS.retirements(w)
    OS.hall_of_fame(w)
    w.reindex()
    OS.expire_contracts(w)
    OS.develop_prospects(w)
    order = sorted(w.teams, key=lambda t: rec[t]["w"])
    OS.run_draft(w, order)
    w.reindex()
    OS.free_agency(w)
    w.reindex()
    OS.enforce_cap_and_roster(w)
    w.schedule_rotation += 1
    w.season += 1
    w.prospect_pipeline.pop(w.season - 1, None)
    OS.generate_class(w, w.season + 2)
    return rec, hist, n_ret


def stability_report(w, collect, years):
    """Compare simulated output against real NFL ranges."""
    G = collect["games"]
    pts = [p for g in G for p in (g[0], g[1])]
    boxes = [b for g in G for b in (g[2], g[3])]
    passy = [b["pass_yd"] for b in boxes]
    rushy = [b["rush_yd"] for b in boxes]
    att = [b["att"] for b in boxes]
    cmp_pct = [b["comps"] / max(b["att"], 1) for b in boxes]
    sacks = [b["sacks_taken"] for b in boxes]
    ints = [b["ints"] for b in boxes]
    ypc = [b["rush_yd"] / max(b["rushes"], 1) for b in boxes]

    TARGETS = [
        ("points / team / game",   np.mean(pts),          20.5, 25.5),
        ("pass yards / team",      np.mean(passy),         195, 265),
        ("pass attempts / team",   np.mean(att),          29.0, 37.0),
        ("completion %",           np.mean(cmp_pct) * 100, 60.0, 70.0),
        ("rush yards / team",      np.mean(rushy),          95, 140),
        ("yards / carry",          np.mean(ypc),           3.9, 4.8),
        ("sacks / team / game",    np.mean(sacks),         1.9, 3.0),
        ("interceptions / team",   np.mean(ints),          0.5, 1.1),
    ]
    active = [p for p in w.players.values() if not p["retired"] and p["team"] in w.teams]
    ovrs = [p["ovr"] for p in active]
    ages = [p["age"] for p in active]
    qbs = [p["ovr"] for p in active if p["pos"] == "QB"]
    careers = [p["career"]["seasons"] for p in w.players.values()
               if p["retired"] and p["career"]["seasons"] > 0]
    TARGETS += [
        ("league mean overall",    float(np.mean(ovrs)),   63.0, 74.0),
        ("players rated 90+",      sum(1 for x in ovrs if x >= 90), 15, 130),
        ("mean age",               float(np.mean(ages)),   24.5, 28.5),
        ("mean QB overall",        float(np.mean(qbs)),    58.0, 78.0),
        ("mean career length",     float(np.mean(careers)) if careers else 0, 2.5, 6.5),
        ("active player count",    len(active),            1600, 1800),
    ]
    champs = collections.Counter(h["champion"] for h in w.history["seasons"])
    TARGETS.append(("distinct champions in %d yrs" % years, len(champs),
                    max(4, years // 4), 32))
    TARGETS.append(("most titles by one club", champs.most_common(1)[0][1], 1, max(4, years // 3)))
    fires = sum(1 for m in w.history["coach_moves"] if m["type"] == "FIRED")
    TARGETS.append(("coach firings / season", fires / years, 2.0, 9.0))
    return TARGETS


def main(years=30, seed=20260825):
    w = World(seed)
    w.honors, w.prev_perf, w.career, w.records = {}, {}, {}, {}
    w.award_voting, w.all_pro, w.all_star = [], [], []
    w.season_leaders, w.record_history, w.expectations = [], [], {}
    store = StatStore("/home/claude/dmp/histout")
    OS.generate_class(w, 2026); OS.generate_class(w, 2027); OS.generate_class(w, 2028)
    collect = {"games": []}
    print(f"Simulating {years} seasons from {w.season}...\n")
    print(f"{'Yr':<6}{'Champion':<10}{'Rec':<7}{'MVP':<24}{'Pos':<5}"
          f"{'Cap':<8}{'Ret':<5}{'Act':<6}{'MeanOvr'}")
    for i in range(years):
        rec, hist, nret = run_season(w, collect, store)
        act = [p for p in w.players.values() if not p["retired"] and p["team"] in w.teams]
        print(f"{hist['season']:<6}{hist['champion']:<10}"
              f"{hist['best_wins']:>2}-{17-hist['best_wins']:<4}"
              f"{hist['mvp'][:23]:<24}{hist['mvp_pos']:<5}"
              f"${w.rules.salary_cap/1e6:>6.0f}M{nret:>5}{len(act):>6}"
              f"{np.mean([p['ovr'] for p in act]):>8.1f}")
    print()
    rows = stability_report(w, collect, years)
    print(f"{'metric':<32}{'value':>10}   {'target':<16}{'status'}")
    print("-" * 74)
    npass = 0
    for name, val, lo, hi in rows:
        ok = lo <= val <= hi
        npass += ok
        print(f"{name:<32}{val:>10.2f}   [{lo:g}, {hi:g}]".ljust(62)
              + ("PASS" if ok else "*** OUT OF RANGE ***"))
    print(f"\n{npass}/{len(rows)} metrics inside historical NFL ranges")
    w.store = store
    return w, rows


if __name__ == "__main__":
    yrs = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    main(yrs)
