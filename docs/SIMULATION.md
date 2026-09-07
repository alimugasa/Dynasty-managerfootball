# Simulation Engine

Location: `supabase/functions/_shared/engine/`. Tests: `tests/engine/`.

```ts
import { createRng, simulateGame } from './supabase/functions/_shared/engine/index.ts';

const result = simulateGame(homeTeam, awayTeam, createRng(seed), {
  neutralSite: false,
  allowTie: true,          // false for playoff games
  weather: { wind: 12, cold: 0.3, precipitation: 0 },
});
```

`result` carries the final score, a team box score for each side, per-player stat
lines, the injuries that occurred, and `plays` — every snap of the game in order.

## Purity

The engine performs no I/O. It does not read a database, a clock, a file or the
network, and it never calls `Math.random()`. Every random decision is drawn from
the `Rng` passed in, so `simulateGame(home, away, createRng(seed))` is a pure
function of its arguments and the same seed replays the same game exactly.

That matters beyond tidiness. A save stores a seed, not a result. A golden test
compares a seed to an expected outcome. A bug report is only reproducible if the
seed reproduces the game. All three break the moment a hidden source of
nondeterminism creeps in, and it would break quietly.

So the claim is enforced rather than asserted. `scripts/lint-arch.mjs` fails the
build on `Math.random`, `Date.now`, `new Date`, `fetch`, `crypto`, `console`,
`process`, `Deno` or a `node:` import anywhere in the engine directory, and on any
import of the engine from `src/`. The engine runs server-side inside an edge
function; keeping it out of the browser bundle is how `ARCHITECTURE.md` rule 2
stays true structurally rather than by review.

The generator is xoshiro128\*\*: 128 bits of state, period 2^128−1. Every step is
integer work through `Math.imul` and shifts, and the conversion to a float
divides by a power of two, so there is no floating-point drift between platforms.

Inputs are never mutated. `simulateGame` builds its own runtime state and leaves
the `TeamState` objects untouched, which a test verifies by deep-freezing them.

## Team strength comes from position groups

There is no team overall rating anywhere in the engine. Six unit ratings are
computed from position groups on every snap:

| Unit | Built from |
|---|---|
| `passOffense` | quarterback accuracy and decision-making, pass protection, receivers, tight end |
| `runOffense` | run blocking, back's ability to break tackles, tight end blocking |
| `passDefense` | edge and interior rush, corner and safety coverage, linebacker coverage |
| `runDefense` | interior line, linebackers, edge setting, safety tackling |
| `passProtection` | line pass blocking, back in protection, quarterback pocket presence |
| `passRush` | edge, interior, linebacker rush |

Protection and rush are separate from the broader pass units because the sack
rate keys off pressure specifically. An injured left tackle should raise the sack
rate without making the quarterback less accurate, and it does.

Within a group, depth contributes on a declining curve: a third receiver counts,
a fifth does not play. If a group is thinner than its weight list, the remaining
weight falls on the last available player — a team that loses its second corner
plays its third more, it does not play with ten men.

Because ratings are recomputed every snap, an injury changes the next play. The
backup is promoted, the unit rating moves, and the rate formulas see it
immediately.

A test pins the consequence directly: two clubs with the same mean rating but
different shapes — one balanced, one built around an elite quarterback — do not
score the same. A single overall number could not tell them apart.

## Calibration

The rate formulas are taken from the calibrated Python reference in
`legacy/engine/season.py`, which validates 17/17 against real football ranges.
That engine produces a team's whole box score in one shot from a unit-rating
differential; this one applies the same formulas per snap, so the calibration
carries over and the output gains play-level detail. Sack rate, completion
percentage, interception rate and yards per carry are all linear in the
differential and then clamped, exactly as in the reference.

Every tunable number lives in `calibration.ts`. `tests/engine/calibration.test.ts`
runs 250 fixed-seed games and asserts the aggregate against the reference
validation table, so a failure is a real regression rather than variance.

Measured over that sample, against the reference's own targets:

| Metric | Engine | Real range |
|---|---:|---|
| points per team | 22.3 | 20.5–25.5 |
| pass yards per team | 250.1 | 195–265 |
| pass attempts per team | 33.3 | 29–37 |
| completion percentage | 66.5 | 60–70 |
| rush yards per team | 110.5 | 95–140 |
| yards per carry | 4.25 | 3.9–4.8 |
| sacks per team | 2.37 | 1.9–3.0 |
| interceptions per team | 0.64 | 0.5–1.1 |
| touchdowns per team | 2.38 | 2.2–3.1 |
| field goal percentage | 84.7 | 78–90 |
| third down percentage | 38.7 | 36–44 |
| home win percentage | 57.0 | 54–58 |

One known deviation: punts run to about 5.5 per team against a real 4.3–5.2,
because drives average roughly a play shorter than real football. It is bounded
by a test rather than tuned away, since narrowing it further would mean
overfitting the offence to a metric the reference engine does not validate
against.

## Home field, fatigue, injuries

**Home field** applies only to the home team's own possessions. Applying it to
whichever side holds the ball hands it to the visitors on their drives and
cancels out over a game, which is exactly what the home win rate showed before it
was scoped. It works through three channels: a bonus to the pass and run
differentials, and a pre-snap penalty chance for the visiting offence that
replays the down five yards back. Neutral sites remove all of it.

**Fatigue** tracks snaps per player. A player absorbs a fresh window that scales
with stamina, then loses rating points per additional snap up to a cap, so a
gassed player is poor rather than worthless. Load decays whenever the unit leaves
the field, which is what makes fatigue a cost of staying on it rather than a
one-way decline. Fatigue also feeds injury risk.

**Injuries** are rolled per player per snap for everyone on the field, scaled by
durability, current fatigue and play type — contact runs and sacks carry more
risk than a dropback. Severity ranges from minor, which the player may return
from the same game, through to season-ending. A player who is sidelined is
removed from the depth chart, so his backup plays the next snap.

## Missing data

A team that cannot field a quarterback, an offensive line, a kicker or a punter
raises `MissingUnitError`. That is a data defect and it is reported as one; the
engine never substitutes a replacement-level phantom, per `ARCHITECTURE.md` rule
3.

Groups that a real team can survive losing behave the way real teams do. A club
with no tight end left plays a fourth receiver; one with no safeties plays a
third corner. The substitute is a real player from a related group, carrying an
out-of-position penalty, and the fallback is a single hop so a mutual pair cannot
recurse.

## Box score

The box score is folded out of the play events and from nothing else.
Accumulating team totals during the game loop *and* emitting events would create
two records of one truth that drift apart the first time a branch forgets to
increment one of them. `tests/engine/integrity.test.ts` checks the fold: per-player
passing, receiving and rushing yards sum to their team totals, receptions equal
completions, and the points on scoring plays sum to the final score.

That suite has already earned its place. It caught a sack taken in the end zone —
recorded with outcome `safety` — being reclassified as a completed pass, because
the box score was branching on an outcome the game loop overwrites. Plays now
carry an explicit `sack` flag.

## Not modelled

Penalties beyond the pre-snap false start, special-teams returns as live plays,
two-minute timeout management, quarterback kneel variations beyond the basic
victory formation, and per-game player stat logs. The last is deliberate: the
schema has no per-game statistics table for the same reason, since
`legacy/ENGINE.md` records that the reference engine produces season-level
statistics only. Both arrive together or not at all.
