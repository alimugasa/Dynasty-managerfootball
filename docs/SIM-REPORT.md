# Simulation Distribution Report

A read-only harness that simulates many seasons of the real 32-club league and
compares the resulting distributions against target ranges. It never edits a
constant and never writes to the engine.

```bash
npm run report:sim                                  # 1000 seasons, default targets
npm run report:sim -- --seasons 200                 # quicker pass
npm run report:sim -- --targets my-ranges.json      # your ranges
npm run report:sim -- --out docs/sim-report.txt     # keep a copy
npm run report:sim -- --serial                      # one thread, for debugging
```

| Option | Default | Meaning |
|---|---|---|
| `--seasons N` | 1000 | Seasons to simulate |
| `--workers N` | min(cores, 4) | Worker threads |
| `--seed N` | 20260907 | Base seed |
| `--targets FILE` | built-in | JSON overriding any subset of ranges |
| `--out FILE` | none | Also write the report to a file |
| `--serial` | off | Single thread |

The process exits non-zero when any metric falls outside its range, so it can
gate a build. The full report still prints either way.

## Supplying your own ranges

`scripts/sim-report/targets.ts` holds the ranges, their labels, and the engine
constants that move each one. The shipped values are placeholders drawn from
real-world professional football: treat a clean run as "not obviously wrong",
not as "calibrated".

To override without editing the file, pass a JSON object keyed by metric:

```json
{
  "points.mean":        { "low": 21.0, "high": 24.0 },
  "leader.passYards":   { "low": 4600, "high": 5300 },
  "wins.sd":            { "low": 2.8,  "high": 3.2  }
}
```

Only `low` and `high` are read; labels and tuning hints stay. An unknown metric
key is an error rather than a silent no-op, so a typo cannot quietly disable a
check.

## What it measures

Per team-game: points, total yards, passing and rushing yards, attempts and
carries, injuries. Per team-season: wins. Per season: the league leader in
passing, rushing and receiving yards, passing touchdowns and sacks, plus the best
single game in passing and rushing.

At 1000 seasons that is 272,000 games and 544,000 team-games, so percentiles are
computed from the full sorted sample rather than interpolated from histogram
bins. A reported 95th percentile is an actual observation.

## Determinism

Season *n* always uses seed `base + n`. The work is sharded across threads by
season index, so the report does not depend on `--workers` and two runs with the
same seed are byte-identical. That is asserted directly: running `--serial` and
`--workers 4` over the same seasons produces the same numbers.

## Two things the harness supplies that the engine does not

**Injury carry-over.** The engine treats each game as independent; persisting
absences is the season loop's job, and that layer does not exist yet. This
harness supplies a minimal version — a player with three weeks remaining misses
the next three games and his backup starts. Without it, injury rate and win
totals would both describe a league where nobody is ever missing.

**Active rosters.** The seed carries about 93 players per club, which is an
offseason roster. Each group is sorted by rating and cut to a realistic game-day
allocation, 51 players in total. Depth beyond that never takes a snap.

Both are the harness's own model, not the engine's, and both are the first things
to re-examine if an injury or win-total metric looks wrong.

## Reading the output

Each section prints a metric table, then percentile summaries, then a histogram.
The tail lists every out-of-range metric worst-first, with the engine constants
that move it and in which direction.

The suggestions name constants; they do not rank them by confidence. A metric can
sit outside its range because a constant is wrong, because the target is wrong,
or because a different metric upstream is wrong and this one is downstream of it.
Scoring, for instance, is downstream of yardage, which is downstream of
completion rate. Fix causes before symptoms and re-run rather than tuning each
flagged line in isolation.
