import sys, time, numpy as np
sys.path.insert(0,'/home/claude/dmp/engine')
from calibrate import population_run

CANDS = [
    ("baseline",  56.0, 9.0, 2.0, 5.2),
    ("A",         58.0, 9.0, 2.0, 6.3),
    ("B",         60.0, 9.5, 2.2, 6.9),
    ("C",         62.0, 9.0, 2.0, 6.2),
]
YEARS = 26
print(f"{'set':<10}{'mu':>6}{'sd':>6}{'shape':>7}{'scale':>7}"
      f"{'equilibrium':>13}{'drift/yr':>11}")
print("-"*62)
for name, mu, sd, sh, sc in CANDS:
    t=time.time()
    m, s = population_run(YEARS, mu, sd, sh, sc)
    eq = float(np.mean(m[-6:]))
    print(f"{name:<10}{mu:>6.1f}{sd:>6.1f}{sh:>7.1f}{sc:>7.1f}"
          f"{eq:>13.2f}{s:>+11.3f}   ({time.time()-t:.0f}s)")
