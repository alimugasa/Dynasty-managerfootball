"""Calibrate draft-class quality so league talent holds flat over decades.

Game simulation does not move ratings, so the population loop alone reproduces
the drift and runs ~40x faster. That makes a parameter sweep feasible.
"""
import sys, numpy as np
sys.path.insert(0, '/home/claude/dmp/engine')
from world import World
import offseason as OS


def population_run(years, mu, sd, shape, scale, seed=11, trace=False):
    OS.CLASS_OVR_MU, OS.CLASS_OVR_SD = mu, sd
    OS.CLASS_POT_SHAPE, OS.CLASS_POT_SCALE = shape, scale
    w = World(seed)
    for p in w.players.values():
        p["season"] = {}
    for y in (2026, 2027, 2028):
        OS.generate_class(w, y)
    w.reindex()
    means = []
    for i in range(years):
        from world import Rules
        w.rules = Rules(w.season)
        OS.develop(w)
        OS.retirements(w)
        w.reindex()
        OS.expire_contracts(w)
        OS.develop_prospects(w)
        w.reindex()
        OS.run_draft(w, sorted(w.teams))
        w.reindex()
        OS.free_agency(w)
        w.reindex()
        OS.enforce_cap_and_roster(w)
        w.season += 1
        w.prospect_pipeline.pop(w.season - 1, None)
        OS.generate_class(w, w.season + 2)
        act = [p for p in w.players.values() if not p["retired"] and p["team"] in w.teams]
        m = float(np.mean([p["ovr"] for p in act]))
        means.append(m)
        if trace:
            print(f"  {w.season-1}  mean {m:5.2f}  active {len(act)}")
    # slope over the back half, once the initial hand-built cohort has washed out
    tail = means[len(means)//2:]
    slope = float(np.polyfit(range(len(tail)), tail, 1)[0])
    return means, slope


if __name__ == "__main__":
    print("baseline (current parameters), 16 seasons:")
    m, s = population_run(16, 56.0, 9.0, 2.0, 5.2, trace=True)
    print(f"  final {m[-1]:.2f}  drift {s:+.3f}/season")
