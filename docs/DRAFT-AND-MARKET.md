# The Draft and Free Agency

Location: `supabase/functions/_shared/engine/offseason/`. Pure, like the rest of
the engine.

```bash
npm run report:market                  # 20 seasons x 3 leagues, charted
npm run report:market -- --seasons 40
```

## Scouting fog

No club ever reads a prospect's true rating. It sees an estimate and a band, and
the band is the point: a well-scouted club sees a tight range and can act on it;
a poorly scouted one is guessing. Thirty-two clubs therefore build thirty-two
different boards from one class, which is where reaches and steals come from. A
draft where everyone sees the truth is a sorting exercise, not a decision.

Two independent levers set the width:

- **Department quality** — what the club *is*. Worth up to 6 rating points of
  sigma.
- **Scouting spend** — what it *chose to do this year*. Worth up to 2.5 more.

Spend is deliberately the weaker lever. Money buys coverage of a class, not a
better eye, and no club can buy its way to certainty — sigma floors at 3.

Budget is not spread evenly. A club looks hardest at positions it needs and at
prospects whose public grade puts them near where it picks. Its fog is therefore
uneven: sharply right about the position it targeted, badly wrong about the one
it ignored.

**The band is honest.** It is a real 80% interval on the club's own estimate, and
a test asserts the truth falls inside it at that rate. Measured:

| club profile | band width | mean error | truth in band |
|---|---:|---:|---:|
| weak dept, low spend | 20.9 | 6.44 | 80.0% |
| weak dept, high spend | 18.5 | 5.98 | 78.5% |
| elite dept, low spend | 10.2 | 3.15 | 82.6% |
| elite dept, high spend | 8.7 | 2.68 | 80.6% |

A range that does not contain the truth at its stated rate is decoration: it
looks like information and misleads every decision made on it.

## AI pick logic

A club scores each prospect as:

```
(estimate * 0.55 + potential * 0.45) * positional value
  + need * 13 * (0.5 + winNow)
  + (0.5 - winNow) * sigma * 0.6      <- risk posture
  + normal(0, 3.2)                    <- front offices disagree
```

The risk term is what makes the fog matter to decisions rather than only to
accuracy. A win-now club **discounts** a prospect it cannot read; a rebuilding
one is happy to gamble, because a wide range contains the outcomes it needs. Same
fog, opposite response.

Measured over 13,440 picks:

| | |
|---|---:|
| mean estimate error | 3.34 rating points |
| estimate bias on picks | **+2.41** |
| reaches (picked above true rank) | 59.7% |
| median reach | 11 places |
| picks at a top-3 need | 51.5% |
| first round at biggest need | 25.4% |
| mean need rank of pick | 4.3 of 12 (6.5 would be random) |

The bias is the **winner's curse**, and it is emergent rather than written in: a
club drafts the prospects its own noise pushed upward, so estimates on drafted
players sit above the truth even though the estimator itself is unbiased. It is
reported separately from the whole-class calibration above, because measuring
coverage on picks alone would be measuring selection, not honesty.

Clubs miss on need about half the time. A club that always addressed its biggest
hole would be trivially predictable; one that never did would be ignoring its
roster.

## Contract valuation

The market pays for **reputation** more than for ability — 0.62 against 0.38.
That is the mechanism, not a simplification: reputation lags what a player can
currently do, so declining veterans are overpaid and young risers underpaid, both
as consequences of the same lag rather than of rules written to produce them.

Value is convex (exponent 2.5) and capped per position as a share of the cap: a
quarterback commands 20.5% where a punter commands 1.4%. Cap grows 6.2% a year
off $302M.

## Competing bids

Clubs offer `ask * (0.78 + 0.75 * need) * (0.75 + spending/200) * noise`, capped
at 55% of their room. Overpayment is not a rule that fires sometimes; it is need
multiplied by owner willingness, which is occasionally a large number.

Players then score every offer on money, contention, playing time, loyalty and
prestige, weighted by one of seven personalities. Measured over 45,000 deals:

| | |
|---|---:|
| mean bids per signed player | 15.0 |
| **top bidder lost** | **53.7%** |
| mean premium over market | 1.08x |
| overpaid by 25% or more | 9.8% |
| overpaid by 50% or more | 2.3% |
| signed below market | 20.0% |

| personality | premium | mean deal |
|---|---:|---:|
| MAX_MONEY | 1.15x | 8.5M |
| LONG_TERM_SECURITY | 1.12x | 7.6M |
| CHAMPIONSHIP | 1.08x | 7.0M |
| LOYALTY | 0.99x | 6.1M |

A money-first player lands the biggest cheque; a ring-first one takes less to go
somewhere better. That ordering is not asserted anywhere in the code — it falls
out of the weights.

## Cap arithmetic, and two things it forced

Only the largest 51 hits count, which is what lets a club carry depth it could
not otherwise afford. Releasing a player leaves dead money behind.

Two corrections came out of testing rather than design:

**Cuts rank by savings, not by cap hit.** A first-round rookie is the worst
ability-per-dollar on any roster and simultaneously the worst possible cut,
because his deal is guaranteed and almost none comes off. Ranking on cap hit
released the first overall pick in the offseason he was drafted.

**Roster trims value upside.** Ranking a cut-down on present ability alone
discards young players with room to grow ahead of older players without it, which
also cost first-round picks their places. Roster value now credits remaining
upside, weighted by how much career is left to realise it.

One deliberate simplification: dead money is capped at 80% of the player's cap
hit for the season of the release. Without a ceiling, a club whose expensive
deals are all guaranteed has **no legal route back under the cap** — every
available cut leaves it further over than it started. Real clubs restructure
their way out; this engine does not model restructures, and the ceiling stands in
for them. The consequence that matters survives: a guaranteed contract frees
almost nothing and is a poor cut, while a deal near its end frees nearly all of
itself.

## Effect on the league

The full pipeline (draft, market, compliance) replaced best-available roster
filling, which moved the equilibrium and required a re-sweep of the intake. After
recalibration, over 40 seasons across 5 leagues:

```
  mean total change      +0.36 over 40 seasons
  slope, per league      -0.0000 +/- 0.0062
  verdict                FLAT - intake is calibrated
```

The settling transient grew from +1.3 to +2.2 points, peaking around season 8
before returning: market allocation concentrates talent more sharply than
best-available filling did, so the seed league's distance from its own
equilibrium shows up larger. Drift is measured after burn-in and the transient is
reported separately rather than hidden.

## Not modelled

Trades and the trade deadline, waivers with priority order, practice squads,
franchise tags, fifth-year options, compensatory picks, contract restructures,
and holdouts. Pick order is roster strength rather than the previous season's
record, since no games are simulated in this loop — that is the seam to replace
once the season loop feeds real records in.
