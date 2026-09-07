import sys, collections, numpy as np
sys.path.insert(0,'/home/claude/dmp/engine')
import run as R
w,_ = R.main(int(sys.argv[1]))
print("\n--- diagnostics ---")
act=[p for p in w.players.values() if not p["retired"] and p["team"] in w.teams]
ret=[p for p in w.players.values() if p["retired"]]
ra=collections.Counter(p["age"] for p in ret)
print(f"retired total {len(ret)}, mean retire age {np.mean([p['age'] for p in ret]):.1f}")
print("retire-age histogram:", {a:ra[a] for a in sorted(ra) if ra[a]>3})
cl=[p["career"]["seasons"] for p in ret if p["career"]["seasons"]>0]
print(f"career length mean {np.mean(cl):.2f} median {np.median(cl):.0f} max {max(cl)}")
ages=collections.Counter(p["age"] for p in act)
print("active age histogram:", {a:ages[a] for a in sorted(ages)})
