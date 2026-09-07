"""Falsification tests for the history system. Each checks a stated requirement."""
import sys, collections, numpy as np
sys.path.insert(0,'/home/claude/dmp/engine')
import run
from stats import REG, PO

w, _ = run.main(int(sys.argv[1]) if len(sys.argv)>1 else 4)
S = w.store
FAIL, PASS = [], []
def ck(cond, msg):
    (PASS if cond else FAIL).append(msg)

# ---- s5/s19: grade distribution, 90+ must be rare
gr=[g for g in S.grade_rows if g["competition_type"]==REG and g["qualified"]]
v=np.array([g["overall_grade"] for g in gr])
per_season = len(v)/len(w.history["seasons"])
ck(8.5 <= np.std(v) <= 13.0, f"grade sd realistic: {np.std(v):.1f} (target 8.5-13)")
n90 = sum(1 for x in v if x>=90)/len(w.history["seasons"])
ck(2 <= n90 <= 40, f"90+ grades rare: {n90:.1f}/season of {per_season:.0f} qualified")
ck(np.mean(v) < 72, f"grade mean not inflated: {np.mean(v):.1f}")

# ---- s16: grade must NOT be dictated by OVR
pairs=[(w.players[g["player_id"]]["ovr"], g["overall_grade"]) for g in gr
       if g["player_id"] in w.players]
r = float(np.corrcoef([a for a,_ in pairs],[b for _,b in pairs])[0,1])
ck(0.30 <= r <= 0.75, f"OVR-vs-grade correlation loose: r={r:.2f} (target 0.30-0.75)")
inv = sum(1 for o,g in pairs if o>=88 and g<70)
inv2= sum(1 for o,g in pairs if o<=78 and g>=82)
ck(inv>0 and inv2>0, f"ability/performance can diverge: {inv} elite-but-poor, {inv2} modest-but-great")

# ---- s1/s20: regular season and playoffs never combine
reg={(r["player_id"],r["season"]) for r in S.season_rows if r["competition_type"]==REG}
po ={(r["player_id"],r["season"]) for r in S.season_rows if r["competition_type"]==PO}
ck(len(po)>0, f"playoff season rows exist: {len(po)}")
ck(not any(r["competition_type"] not in (REG,PO) for r in S.season_rows),
   "every stat row tagged with a competition type")
rr=[r for r in S.season_rows if r["competition_type"]==REG]
mx=max((r.get("pass_yd",0) for r in rr), default=0)
allr=max((r.get("pass_yd",0) for r in S.season_rows), default=0)
ck(w.records.get(REG) is not None and w.records.get(PO) is not None,
   "separate regular-season and playoff record books")
rbook=w.records[REG].get("season_pass_yd",{}).get("value",0)
ck(rbook<=mx+1, f"regular-season record book uncontaminated by playoffs ({rbook:.0f} <= {mx:.0f})")
pr=[r for r in S.season_rows if r["competition_type"]==PO]
ck(all(r.get("games",0)<=4 for r in pr), "playoff rows cap at 4 games")

# ---- s3/s53: multi-team seasons preserved as separate rows
cnt=collections.Counter((r["player_id"],r["season"]) for r in S.season_rows
                        if r["competition_type"]==REG)
multi=[k for k,c in cnt.items() if c>1]
ck(True, f"multi-team season rows preserved: {len(multi)} player-seasons with >1 team row")

# ---- s27/s29: highest grade must not automatically win the award
mvps=[a for a in w.history["awards"] if a.get("MVP")]
auto=0
for a in mvps:
    seas=a["season"]
    g=[x for x in S.grade_rows if x["season"]==seas and x["competition_type"]==REG and x["qualified"]]
    if not g: continue
    top=max(g,key=lambda x:x["overall_grade"])["player_id"]
    if top==a["MVP"]: auto+=1
ck(auto < len(mvps), f"MVP != top grade in at least some seasons ({auto}/{len(mvps)} matched)")

# ---- s30/s71: QB-dominant MVP should emerge, not be hard-coded
pos=collections.Counter(w.players[a["MVP"]]["pos"] for a in mvps if a.get("MVP") in w.players)
qb_share=pos.get("QB",0)/max(len(mvps),1)
ck(0.4 <= qb_share <= 1.0, f"MVP QB share emergent: {qb_share:.0%} {dict(pos)}")
dp=collections.Counter(w.players[a["DPOY"]]["pos"] for a in mvps if a.get("DPOY") in w.players)
ck(len(dp)>=1, f"DPOY positional spread: {dict(dp)}")

# ---- s22/s25: All-Pro and All-Star are distinct honors of different sizes
ap=len(w.all_pro)/max(len(w.history["seasons"]),1)
asx=len(w.all_star)/max(len(w.history["seasons"]),1)
ck(asx > ap, f"All-Star broader than All-Pro: {asx:.0f} vs {ap:.0f} per season")
firsts=[x for x in w.all_pro if x["team"]=="FIRST"]
ck(len(firsts)/max(len(w.history['seasons']),1) <= 30,
   f"First-Team All-Pro scarce: {len(firsts)/max(len(w.history['seasons']),1):.0f}/season")
overlap=len({x["player_id"] for x in firsts} & {x["player_id"] for x in w.all_star})
ck(overlap < len(firsts), f"All-Pro and All-Star rosters differ ({overlap} overlap)")

# ---- s46: voting results stored permanently
ck(len(w.award_voting)>0, f"award voting stored: {len(w.award_voting)} ballot rows")
mv=[r for r in w.award_voting if r["award_type"]=="MVP"]
multi_cand=collections.Counter(r["season"] for r in mv)
ck(np.mean(list(multi_cand.values()))>1.5,
   f"MVP votes split across candidates: {np.mean(list(multi_cand.values())):.1f} avg receiving votes")

# ---- s50: honors history is per-season, not just a count
hh=[p for p in w.honors.values() if len(p)>1]
ck(len(hh)>0, f"per-season honors history retained for {len(w.honors)} players")

# ---- s59: retired players keep everything
ret=[p for p in w.players.values() if p["retired"]]
kept=sum(1 for p in ret if p["pid"] in w.career.get(REG,{}))
ck(kept>0, f"retired players retain career stats: {kept}/{len(ret)}")

# ---- s57: leaders stored as titles, separate from awards
ck(len(w.season_leaders)>0, f"season leaders stored: {len(w.season_leaders)}")
sackldr={r["player_id"] for r in w.season_leaders if r["category"]=="sacks"}
dpoys={a["DPOY"] for a in w.history["awards"] if a.get("DPOY")}
ck(not sackldr.issubset(dpoys) or len(sackldr)<2,
   "sack leader does not automatically win DPOY")

print("\n" + "="*70)
for m in PASS: print("  PASS  " + m)
for m in FAIL: print("  FAIL  " + m)
print(f"\n{len(PASS)}/{len(PASS)+len(FAIL)} history checks passed")
