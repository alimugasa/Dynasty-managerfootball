import sys, numpy as np
sys.path.insert(0,'/home/claude/dmp/engine')
from calibrate import population_run
print(f"{'mu':>6}{'scale':>7}{'seed':>6}{'equilibrium':>13}{'drift/yr':>11}")
print("-"*45)
for mu, sc in [(57.6, 6.05), (57.8, 6.15)]:
    for seed in (11, 27):
        m, s = population_run(30, mu, 9.0, 2.0, sc, seed=seed)
        print(f"{mu:>6.1f}{sc:>7.2f}{seed:>6}{np.mean(m[-8:]):>13.2f}{s:>+11.3f}")
