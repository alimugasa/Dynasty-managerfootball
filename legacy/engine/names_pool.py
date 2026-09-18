"""Procedural name pool for players and coaches created during simulation."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from names import FIRST, LAST, COACH_FIRST

_used = set()
def rand_name(py):
    for _ in range(300):
        n = f"{py.choice(FIRST)} {py.choice(LAST)}"
        if n not in _used:
            _used.add(n); return n
    return f"{py.choice(FIRST)} {py.choice(LAST)}-{py.choice(LAST)}"

def rand_coach_name(py):
    return f"{py.choice(COACH_FIRST)} {py.choice(LAST)}"
