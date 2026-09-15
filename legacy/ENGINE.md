# Simulation Engine — Status Report

~1,570 lines across `world.py`, `season.py`, `offseason.py`, `run.py`, plus the
calibration harness. Built in the priority order from section 82: data model,
calendar/season loop, game engine, transaction and cap engine, draft and scouting,
development, injuries, coaching, free agency, playoffs, validation.

Run it:

```bash
cd engine
python3 run.py 14          # simulate 14 seasons + validation table
python3 calibrate.py       # population-dynamics harness (no games, ~40x faster)
python3 diag.py 14         # validation + age/retirement/career diagnostics
```

Roughly 18 seconds per simulated season with games; 0.5 seconds per season in the
population harness.

---

## The talent-drift bug, and how it was found

The first 30-season run showed league mean overall falling steadily:

```
2026  73.4      2031  72.2      2036  70.1
2028  73.6      2033  71.3      2038  69.6
```

About −0.29/season. Extrapolated to 2056 that lands near 66 and keeps going — the
exact multi-decade failure mode section 77 warns about, in the deflation direction.

Game simulation does not move ratings, so the population loop alone reproduces the
drift and runs ~40x faster (`calibrate.py`). That made a parameter sweep practical.
The harness matched the full run closely (73.7→69.9 vs 73.4→69.6 at the same point),
confirming it isolated the right subsystem.

The sweep showed the drift was **not** instability. Every parameter setting converged
and held; they just converged to different levels:

| class μ | potential scale | equilibrium | drift/season |
|---|---|---|---|
| 56.0 | 5.2 | 70.09 | +0.016 |
| 57.8 | 6.15 | **73.37** | **+0.001** |
| 58.0 | 6.3 | 74.07 | +0.048 |
| 60.0 | 6.9 | 78.75 | +0.034 |
| 62.0 | 6.2 | 78.14 | +0.005 |

So the real defect was a **discontinuity between initial conditions and steady state**.
The starting database was calibrated against real NFL rating distributions and sits at
73.4; draft intake settled the league at 70.1. A player would have experienced that as
twelve straight years of the league quietly getting worse before it flattened.

Fixed by calibrating intake to the database rather than the reverse — the starting
distribution is anchored to real football, so it is the thing worth preserving.
Verified across two seeds (73.37 / 73.16, drift ±0.002).

**50-season confirmation** (2026→2075, `long50.log`): mean stays between 72.99 and
74.63. Range of 1.65 points over half a century.

---

## Current validation: 17/17

From a 14-season run:

| metric | value | NFL range |
|---|---:|---|
| points / team / game | 23.22 | 20.5–25.5 |
| pass yards / team | 249.6 | 195–265 |
| pass attempts / team | 33.4 | 29–37 |
| completion % | 67.4 | 60–70 |
| rush yards / team | 115.9 | 95–140 |
| yards / carry | 4.25 | 3.9–4.8 |
| sacks / team / game | 2.02 | 1.9–3.0 |
| interceptions / team | 0.61 | 0.5–1.1 |
| league mean overall | 73.51 | 63–74 |
| mean age | 26.3 | 24.5–28.5 |
| mean career length | 5.60 | 2.5–6.5 |
| distinct champions in 14 yrs | 7 | ≥4 |
| coach firings / season | 7.6 | 2–9 |

Retirement ages spread 25→41 with a mode at 25 (fringe players washing out) and a long
tail — no cliff at a fixed age. Career length median 5, max 18.

Two other bugs the tests caught: career length initially read 2.26 because existing
players loaded with `career.seasons = 0` despite years of experience behind them (the
metric was measuring the wrong thing), and 8-season runs would not complete because
`cap_space` rescanned all ~1,700 players on every call inside the free-agency bid loop.
Fixed with a roster index behind a single `set_team()` mutation point so the index
cannot drift out of sync.

---

## Causality

No system uses a flat probability where football logic belongs.

**Coach firing** — expectation is derived from roster talent (`(top-24 talent − 66) ×
0.72 + 8.5`), then compared to actual wins. Shortfall, tenure, and owner patience
combine. First-year coaches get a 0.28 multiplier; 11-win seasons get 0.15. A 5-12
first-year coach usually survives; a fourth-year coach with no playoff appearances
usually does not.

**Free agency** — players score each bid on money, contender status, starting
opportunity, loyalty, and prestige, weighted by one of seven personality types.
A `CHAMPIONSHIP` player weights money at 0.28 and contention at 0.42; `MAX_MONEY`
weights money at 0.72. The top bidder loses regularly.

**Draft** — no team reads true ratings. Each club scouts through a noise term whose
width is set by its own scouting department (σ from 11.5 down to 5.5), then blends
estimate, potential, positional value, and need weighted by owner win-now bias, plus
a disagreement term. 32 clubs build 32 different boards, so reaches and steals emerge.

**Development** — position-specific peak ages and decline rates. Athletic ability
falls after peak while a separate `mental` term keeps accruing, so a 34-year-old
quarterback loses less than a 30-year-old corner. Reputation lags ability by design,
which is the mechanism that makes veterans get overpaid in free agency.

---

## Not built

Trades and the trade deadline, waivers with priority order, practice squads and
elevations, franchise tags, fifth-year options, compensatory picks, the news engine,
playoff odds, weekly power rankings, GM/front-office records, and the multi-year
college pipeline (prospects generate three years out and develop, but no college
seasons are simulated). Statistics are season-level; there are no game logs.

These are real gaps. The engine stops where it could still be validated.

## Next

The highest-value additions, in order: the trade engine (it is the largest missing
causal loop — strategic state already exists on every club but nothing consumes it),
then waivers and practice squads to complete the transaction cycle, then game logs so
the record book and Hall of Fame have real inputs. Each should get a stability re-run
before the next is added.
