import sys, collections, numpy as np
sys.path.insert(0,'/home/claude/dmp/engine')
import run
from stats import REG
w,_ = run.main(int(sys.argv[1]))
A=w.history["awards"]; V=w.award_voting
print("\n=== award positional distribution (section 70/71) ===")
for aw in ("MVP","OPOY","DPOY","OROY","DROY","MOST_IMPROVED"):
    pos=collections.Counter(w.players[a[aw]]["pos"] for a in A if a.get(aw) in w.players)
    n=sum(pos.values())
    print(f"  {aw:<14} {dict(pos.most_common())}")
    if aw=="MVP" and n: print(f"                 QB share {pos.get('QB',0)/n:.0%}")
print("\n=== MVP vote splits ===")
for s in sorted({r['season'] for r in V if r['award_type']=='MVP'})[:6]:
    rs=[r for r in V if r['award_type']=='MVP' and r['season']==s]
    rs.sort(key=lambda r:-r['votes'])
    print(f"  {s}: " + ", ".join(f"{w.players[r['player_id']]['name'].split()[-1]}"
          f"({r['position']}) {r['votes']}" for r in rs[:4]))
print("\n=== grade leader vs MVP (section 27/77) ===")
G=[g for g in w.store.grade_rows if g["competition_type"]==REG and g["qualified"]]
for a in A[:6]:
    s=a["season"]; gs=[x for x in G if x["season"]==s]
    if not gs or not a.get("MVP"): continue
    top=max(gs,key=lambda x:x["overall_grade"])
    mv=[x for x in gs if x["player_id"]==a["MVP"]]
    print(f"  {s}: top grade {w.players[top['player_id']]['name'].split()[-1]}"
          f" ({top['position']}) {top['overall_grade']}"
          f" | MVP {w.players[a['MVP']]['name'].split()[-1]} "
          f"{mv[0]['overall_grade'] if mv else 'n/a'}")
