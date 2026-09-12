import sys, numpy as np
sys.path.insert(0,'/home/claude/dmp/engine')
from calibrate import population_run
m, s = population_run(50, 57.8, 9.0, 2.0, 6.15, seed=41)
print("50-season population test")
for i in range(0, 50, 5):
    print(f"  {2026+i}  mean {m[i]:5.2f}")
print(f"  final {m[-1]:.2f}   drift(back half) {s:+.4f}/season")
print(f"  min {min(m):.2f}  max {max(m):.2f}  range {max(m)-min(m):.2f}")
