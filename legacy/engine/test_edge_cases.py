"""Section 73 edge cases, exercised directly rather than waiting for them to occur."""
import sys, collections
sys.path.insert(0,'/home/claude/dmp/engine')
from stats import StatStore, REG, PO
import history as H
from world import World
import numpy as np

w = World(7); w.reindex()
w.honors, w.prev_perf, w.career, w.records = {}, {}, {}, {}
w.season_leaders, w.record_history = [], []
store = StatStore("/home/claude/dmp/edgeout")
FAIL, PASS = [], []
def ck(c,m): (PASS if c else FAIL).append(m)

pid = next(iter(w.players))
p = w.players[pid]

# --- traded midseason: two team rows, one season, totals preserved
for team, wk, yd in [("PIT",1,300),("PIT",2,250),("DAL",3,400),("DAL",4,375)]:
    w.season_agg = getattr(w,"season_agg",{})
    key=(pid,team,REG)
    a=w.season_agg.setdefault(key,{"line":collections.defaultdict(float),"gz":[],
                                   "snaps":[],"comps":collections.defaultdict(list)})
    a["line"]["pass_yd"]+=yd; a["line"]["games"]+=1
    a["gz"].append(0.5); a["snaps"].append(60)
w.season=2031
rows,_=H.finalize_season_stats(w,store)
mine=[r for r in rows if r["player_id"]==pid]
teams={r["team_id"] for r in mine}
ck(teams=={"PIT","DAL"}, f"traded player keeps both franchise rows: {sorted(teams)}")
ck(sum(r["pass_yd"] for r in mine)==1325, "season total across teams correct (1325)")
ck(all(r["season"]==2031 for r in mine), "both rows tagged to the same season")

# --- traded twice
w.season_agg={}
for team in ("PIT","DAL","LV"):
    a=w.season_agg.setdefault((pid,team,REG),{"line":collections.defaultdict(float),
        "gz":[],"snaps":[],"comps":collections.defaultdict(list)})
    a["line"]["rec"]+=10; a["line"]["games"]+=1; a["gz"].append(0.2); a["snaps"].append(40)
w.season=2032
rows2,_=H.finalize_season_stats(w,store)
ck(len({r["team_id"] for r in rows2 if r["player_id"]==pid})==3,
   "player traded twice keeps three franchise rows")

# --- prior season not overwritten
old=[r for r in store.season_rows if r["player_id"]==pid and r["season"]==2031]
ck(len(old)==2 and sum(r["pass_yd"] for r in old)==1325,
   "2031 rows survive unchanged after 2032 is written")

# --- playoff-only player: zero regular-season snaps, postseason production
pid2 = list(w.players)[5]
w.season_agg={}
a=w.season_agg.setdefault((pid2,"KC",PO),{"line":collections.defaultdict(float),
    "gz":[],"snaps":[],"comps":collections.defaultdict(list)})
a["line"]["rec_yd"]+=210; a["line"]["games"]+=3
a["gz"].append(1.4); a["snaps"].append(120)
w.season=2033
rows3,_=H.finalize_season_stats(w,store)
mine3=[r for r in rows3 if r["player_id"]==pid2]
ck(len(mine3)==1 and mine3[0]["competition_type"]==PO,
   "playoff-only season produces a PLAYOFFS row and no regular-season row")
H.accumulate_career(w, rows3)
ck(pid2 not in w.career.get(REG,{}), "playoff-only player has no regular-season career line")
ck(w.career[PO][pid2]["rec_yd"]==210, "playoff career totals recorded separately")

# --- retirement preserves everything
H.accumulate_career(w, store.season_rows)
before=dict(w.career[REG][pid])
w.players[pid]["retired"]=True; w.set_team(w.players[pid],"RET")
ck(w.career[REG][pid]==before, "retired player's career record is untouched by retirement")
ck(w.players[pid]["pid"] in w.players, "retired player is not deleted from the league")

# --- honors history is per-season and additive
for yr,hn in [(2029,"ALL_STAR"),(2030,"FIRST_TEAM_ALL_PRO"),(2030,"MVP")]:
    w.season=yr; H.add_honor(w,pid,hn)
hs=w.honors[pid]
ck(len(hs)==3 and {h["season"] for h in hs}=={2029,2030},
   f"honors stored per season, expandable: {[(h['season'],h['honor']) for h in hs]}")
ck(sum(1 for h in hs if h["season"]==2030)==2,
   "two honors in one season both retained, not collapsed")

print("="*66)
for m in PASS: print("  PASS  "+m)
for m in FAIL: print("  FAIL  "+m)
print(f"\n{len(PASS)}/{len(PASS)+len(FAIL)} edge-case checks passed")
