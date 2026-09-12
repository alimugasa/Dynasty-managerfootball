"""Write the permanent historical database to CSV."""
import sys, os, csv, collections
sys.path.insert(0,'/home/claude/dmp/engine')
import run
from stats import REG, PO

OUT="/mnt/user-data/outputs/dynasty_manager_pro/history"
os.makedirs(OUT, exist_ok=True)
w,_ = run.main(int(sys.argv[1]) if len(sys.argv)>1 else 6)
S=w.store

def wr(name, rows, cols=None):
    if not rows:
        print(f"  {name:<28} EMPTY"); return
    cols = cols or sorted({k for r in rows for k in r})
    with open(f"{OUT}/{name}.csv","w",newline="",encoding="utf-8") as f:
        d=csv.DictWriter(f,fieldnames=cols,restval="",extrasaction="ignore")
        d.writeheader(); d.writerows(rows)
    print(f"  {name:<28} {len(rows):>7} rows")

wr("player_season_stats", S.season_rows)
wr("player_season_grades", S.grade_rows)

career=[]
for comp, d in w.career.items():
    for pid, c in d.items():
        p=w.players.get(pid)
        if not p: continue
        row={"player_id":pid,"display_name":p["name"],"position":p["pos"],
             "competition_type":comp,"retired":int(p["retired"])}
        row.update({k:(round(v,2) if isinstance(v,float) else v) for k,v in c.items()})
        career.append(row)
wr("player_career_stats", career)

hist=[]
for pid,rows in collections.defaultdict(list, {}).items(): pass
seen=set()
for r in S.season_rows:
    k=(r["player_id"],r["season"],r["team_id"])
    if k in seen: continue
    seen.add(k)
    hist.append({"player_id":r["player_id"],"season":r["season"],
                 "team_id":r["team_id"],"position":r["position"]})
wr("player_team_history", hist)

wr("player_honors", [{"player_id":pid,**h} for pid,hs in w.honors.items() for h in hs])
wr("award_voting", w.award_voting)
wr("season_awards", [{"season":a["season"], "award_type":k, "player_id":v}
                     for a in w.history["awards"] for k,v in a.items() if k!="season"])
wr("all_pro_selections", w.all_pro)
wr("all_star_selections", w.all_star)
wr("season_leaders", w.season_leaders)
wr("record_history", w.record_history)
wr("league_records", [{"competition_type":c,"record":k,**v}
                      for c,b in w.records.items() for k,v in b.items()])
wr("coach_season_history", [{"season":m["season"],"team_id":m["team"],
                             "event":m["type"],"coach":m.get("coach",""),
                             "wins":m.get("wins",""),"expected_wins":m.get("expected",""),
                             "mentor":m.get("mentor","")} for m in w.history["coach_moves"]])
wr("preseason_expectations", [{"season":s,"team_id":t,"expected_wins":round(v,1)}
                              for s,d in w.expectations.items() for t,v in d.items()])
for f in ("player_game_stats","player_game_grades"):
    src=f"/home/claude/dmp/histout/{f}.csv"
    if os.path.exists(src):
        n=sum(1 for _ in open(src))-1
        __import__("shutil").copy(src, f"{OUT}/{f}.csv")
        print(f"  {f:<28} {n:>7} rows (streamed)")
print(f"\nseasons simulated: {len(w.history['seasons'])}")
