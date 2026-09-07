# Offseason Development

Location: `supabase/functions/_shared/engine/offseason/`. Pure, like the rest of
the engine: no I/O, no clock, no `Math.random`.

```bash
npm run report:drift                      # 40 seasons across 5 leagues, charted
npm run report:drift -- --seasons 80      # long-run confirmation
npm run report:sweep                      # intake calibration sweep
```

## Three numbers that must stay different

| | What it is | Moves |
|---|---|---|
| **Ability** | What the player can actually do | Only in the offseason |
| **Grade** | What he did this season | Each season, noisily |
| **Reputation** | What the market thinks he can do | Chases ability, never catches it |

A game where these are one number has no scouting, no breakouts, no bad
contracts and no reason to disagree with anyone. The measured
ability-to-grade correlation is **0.554**, against a target of 0.55.

A grade is generated from a per-season *form* draw that ability tilts but does
not determine, and deliberately **not** from the box score: an offensive lineman
accumulates no statistics and still has a season, and a quarterback on a poor
team can throw for a great deal while playing badly.

```
form = w * abilityZ + sqrt(1 - w^2) * noise
```

Ability is standardised across the graded population each season, so `w` *is*
the correlation. Writing the noise coefficient as `sqrt(1 - w^2)` rather than
`(1 - w)` keeps form at unit variance, so the grade scale does not stretch when
the weight is retuned. Standardising per season also keeps grades comparable
across eras as the league's absolute level moves.

Consequences worth stating, all covered by tests: a 90-rated player loses to a
76-rated one on grade in roughly a fifth of seasons; a player who missed most of
the year is graded more noisily, because his grade averages fewer games; and a
declining veteran's reputation stays above his ability, which is the mechanism
that makes veterans get overpaid.

## Age curves

Every group has its own peak age and decline rate. Backs peak at 25 and fall
away more than twice as fast as quarterbacks, who peak at 29. A separate mental
term keeps accruing throughout a career, capped by position, so a 34-year-old
quarterback declines far more gently than a 30-year-old corner.

Decline ramps with years past peak rather than arriving at once, and is
multiplied by wear: career games missed beyond a threshold accelerate the fall.
A body that has broken down keeps breaking down, and that is what separates a
player who aged from one who was worn out.

## Breakout and bust

Growth is the remaining gap to potential, scaled by development rate, coaching,
playing time and work ethic — then multiplied by a wide random draw floored at
zero and capped at 2.4. The same player, in the same situation, can gain nothing
one year and two and a half times the expected amount the next. Without that
term every prospect converges smoothly on his ceiling and there is no reason to
ever be wrong about anyone.

Breakout and bust are measured **against the player's own expectation**, not
against an absolute number of rating points. An absolute threshold just
re-detects headroom: a 66 with a ceiling of 92 clears four points in a routine
year, and calling that a breakout every season makes the label meaningless.

## Retirement

A hazard rate, not an age. Several pressures add: years past the positional
peak (superlinear, so the tail thins gradually), being no good, being unsigned, a
career of missed games, and having already won. Stars are damped hard because
they keep playing long after others stop, and there is a floor at 40 so the tail
terminates.

The distribution that falls out runs from 25 to 42 with a mean of 29.6 and its
mode at the young end — fringe players washing out — which is the real shape and
is not what a fixed retirement age produces.

## Draft intake, and why it decides everything

`legacy/ENGINE.md` records a 30-season run losing 0.29 rating points a season,
which a player would have experienced as twelve straight years of the sport
quietly getting worse. The cause was not instability: every parameter setting
converged. They converged to *different levels*, and the level implied by the
intake did not match the level the seed database sits at.

So intake is calibrated to the database rather than the reverse. The starting
distribution is anchored to real football, so it is the thing worth preserving.
`npm run report:sweep` runs each candidate to equilibrium and reads the level
off:

```
  class mean  potential scale   equilibrium    residual slope   gap to target
        58.5             7.00         74.17           +0.0025           -0.44
        58.9             7.00         74.55           -0.0016           -0.05
        59.0             7.10         74.84           -0.0010           +0.24
```

Two further intake defects surfaced while calibrating, both found by a test
asserting rosters stay full rather than by reading the numbers:

**Composition was sampled per prospect**, making the number of kickers in a class
a random variable. The expectation was five; classes with two turned up often
enough that clubs could not fill 32 kicking jobs. A real draft class is not a
multinomial sample either. Counts are now exact.

**Composition was weighted by roster shape**, which starves fast-ageing
positions. A club carries six corners and three quarterbacks, but corners peak at
26 and decline more than twice as fast, so the six turn over far more often. Six
separate years left clubs unable to field a full secondary. Weights are now
demand-based, and class size carries surplus at every position, because a spare
prospect nobody signs costs nothing and a shortage costs a roster spot.

## The drift result

Over 40 seasons across 5 independent leagues:

```
  mean total change      -0.25 over 40 seasons
  per-league change      -0.10, -0.04, -0.65, -0.14, -0.33
  slope, per league      -0.0036 +/- 0.0074
  verdict                FLAT - intake is calibrated
```

Confirmed at 80 seasons: total change +0.08, slope +0.0014 ± 0.0032.

**The report simulates several independent leagues, not one.** League mean
ability wanders season to season, and that wandering is autocorrelated — this
year's league is last year's minus retirements plus a class. A least-squares
slope through a single 40-season run has a wide sampling distribution: runs
ending within half a rating point of where they started still produce slopes of
-0.04, which reads as drift and is not. Averaging over independent leagues is
what separates a trend from a walk.

**There is a settling transient.** The mean rises about 1.3 points by season 8
and returns. The seed database is not at the age structure its own intake
implies, so the league adjusts before settling. Drift is measured after a
burn-in and the transient is reported separately rather than hidden — a
10-season burn-in leaves part of the descent inside the window and reports it as
drift.

## What this loop does not do

No games are simulated. That is not a shortcut: ability moves only in the
offseason, so the population loop reproduces the talent dynamics exactly, and it
is what isolated the original drift bug. Free agency, contracts, trades and
per-club draft boards are absent — they change *which* club holds a player, which
matters enormously to a season and not at all to the league's talent level.
Roster filling therefore uses a single consensus estimate with scouting noise
rather than 32 separate boards.
