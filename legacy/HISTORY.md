# History, Grading & Awards System

Built on top of the simulation engine. ~1,050 lines across `stats.py`, `history.py`,
plus the validation suites.

```bash
cd engine
python3 validate_history.py 5    # 23 falsification tests on the history system
python3 test_edge_cases.py       # 12 section-73 edge cases, exercised directly
python3 award_dist.py 8          # award positional distributions and vote splits
python3 export_history.py 6      # write the permanent database to history/
```

---

## The separation that everything else depends on

Section 76 names six things that must never become one variable. They are separate
objects here, and the tests exist to prove it:

| concept | where it lives | how it's produced |
|---|---|---|
| **ability** | `players.ovr` | development engine |
| **statistics** | `player_game_stats` | generated from grade + luck |
| **performance grade** | `player_season_grades` | process model, only partly ability-driven |
| **reputation** | `players.reputation` | lags ability, boosted by honors |
| **narrative** | computed per season | derived from real events only |
| **voting** | `award_voting` | 50 simulated voters, 7 archetypes |

**Measured result: OVR-to-grade correlation is r = 0.57.** Not 1.0, not 0. Over four
seasons the tests found 46 player-seasons where an 88+ OVR player graded below 70,
and 45 where a sub-78 OVR player graded 82+. Both directions are possible, which is
exactly what section 16 asks for.

The mechanism: each player draws a `season_form` once per year, weighted 52% ability
and 48% independent variance. Per-game performance is form plus fresh noise. Then
*statistics are generated from the grade*, not the reverse — so a quarterback can
grade well and have modest numbers, or post big numbers on mediocre process.

---

## Regular season and playoffs never combine

Every stat and grade row carries `competition_type` (`REGULAR_SEASON` / `PLAYOFFS`)
and `playoff_round` (`WILD_CARD` → `SUPER_BOWL`). The regular season is closed out —
aggregated, records updated, awards voted — **before** `run_playoffs` is called, so
postseason production cannot leak backward into regular-season totals, grades, record
books, or award ballots.

There are two independent record books. A real exported career:

```
Rafferty Sunderland — QB
  regular season:  27,111 yd   232 TD   34 INT
  playoffs:         1,544 yd     9 TD    2 INT
  season grades:   2026 86.2 · 2027 91.9 · 2028 71.5 · 2029 83.0 · 2030 81.4
  playoff grades:  2026 80.9 · 2027 99.9 · 2028 72.9
  honors:          2027 MVP · 2027 1st-Team All-Pro · 2027 All-Star · 2028 All-Star
                   2029 1st-Team All-Pro · 2030 All-Star · 2031 2nd-Team All-Pro
```

Honors are stored per season, not as counts — two honors in one season stay as two
rows (tested).

---

## Grading

Scale is 0–100 with a compression knee at 87 (slope 0.66). Without the knee the scale
clipped: elite seasons all piled up at 99.9 and a historic year was indistinguishable
from a merely excellent one.

Qualified regular-season distribution: **mean 67.1, sd 10.1**, roughly 8–12 players
per season at 90+. Component grades (`pass_block_grade`, `coverage_grade`,
`pass_rush_grade`, etc.) are populated per position and roll up by position-specific
weights — a corner's overall is 78% coverage, a guard's is 54% run blocking.

Process statistics are keyed to grade rather than outcome, which is how section 7's
examples work: `turnover_worthy_plays` rises as grade falls whether or not the pass
was intercepted, `pressures` rise with pass-rush grade whether or not a sack landed,
and a corner's `targets` *decrease* as coverage grade rises — good coverage draws no
throws, and the grade reflects it.

Minimum snap thresholds per position gate leaderboard qualification. A backup with a
96.8 grade on 9 attempts keeps the grade but is not `qualified`.

---

## Awards

**The candidate pool is built per position, then ranked.** This was a real bug: a flat
top-N list produced 100% EDGE MVPs, because there are ~290 qualified edge rushers to
~64 quarterbacks, so pass rushers filled every slot before a quarterback appeared.
Roster construction was masquerading as merit.

Fifty voters, seven archetypes (`BALANCED`, `TRADITIONAL_STATS`, `ANALYTICS`,
`TEAM_SUCCESS`, `POSITIONAL_VALUE`, `NARRATIVE`, `EFFICIENCY`), each weighting
production, grade, team success, positional value, narrative, and reputation
differently. Disagreement comes from *weighting*, not from noise.

Sample MVP ballots:

```
2027: Sunderland (QB) 36 · Satterfield (QB) 8 · Hathaway (RB) 5 · Honeycutt (DT) 1
2029: Kilgore (QB) 38 · Trapasso (WR) 7 · Birchfield (EDGE) 2 · Langford (DT) 1
2031: Kilgore (QB) 30 · Satterfield (QB) 14 · Aguilar (EDGE) 5 · Trapasso (WR) 1
```

**The top-graded player did not win MVP in any of eight seasons.** In 2031 the MVP
graded 79.6 while the league's top grade was 99.9. That is section 77's requirement
working.

Positional outcomes over eight seasons, all emergent from valuation rather than
quotas:

| award | distribution |
|---|---|
| MVP | QB 8 |
| OPOY | WR 6, RB 1, QB 1 |
| DPOY | DT 3, EDGE 3, S 1, CB 1 |
| OROY | RB 5, WR 2, TE 1 |
| DROY | EDGE 4, DT 2, LB 1, S 1 |

QB wins MVP while a WR wins OPOY, which section 31 explicitly wants. DPOY spreads
across four positions — a safety and a corner both beat the sack leaders.

All-Pro uses positional slots (23 first-team per season) weighted toward grade with an
availability penalty. All-Star is broader (80 per season, by conference) and weights
reputation and prior honors more heavily, so a famous veteran can make All-Star while
a less-known player takes the All-Pro spot.

Preseason expected wins are frozen before Week 1 into `preseason_expectations` so
Coach of the Year cannot be judged with hindsight.

---

## Storage

Game logs stream to disk and are never held in memory — 30 seasons would be ~11M rows.
Season rows (~1,700 × seasons) stay resident and are what every screen reads. A
6-season export:

| file | rows |
|---|---:|
| player_game_stats | 577,914 |
| player_game_grades | 577,914 |
| player_season_stats | 10,117 |
| player_season_grades | 10,117 |
| player_career_stats | 3,666 |
| player_team_history | 10,087 |
| player_honors | 791 |
| all_star_selections | 480 |
| all_pro_selections | 276 |
| award_voting | 154 |
| record_history | 71 |
| season_leaders | 66 |

Career totals are derived from season rows, split by competition. Nothing is
overwritten; retirement does not delete or alter anything (tested).

---

## Known issues

**Playoff grades clip at 99.9.** A postseason sample is 1–4 games, so per-game noise
does not average out the way it does over 17. The knee is calibrated for
regular-season sample sizes. Playoff grades need either their own scale or explicit
small-sample regression toward the mean.

**Multi-team seasons are schema-tested, not simulation-tested.** Rows are keyed by
`(player, season, team, competition)`, and `test_edge_cases.py` verifies directly that
a player traded once keeps two franchise rows, traded twice keeps three, and that
prior seasons survive later writes. But no trade has ever occurred in a live run,
because the trade engine does not exist yet. This will need re-verification once it does.

**Not built:** in-season award race snapshots (section 47), Super Bowl-specific record
filters, returner/special-teams coverage stats, and Coach of the Year voting — the
expectations snapshot that section 38 requires is captured, but the ballot itself is
not wired. Era normalization is per-season percentile, which handles offensive
inflation, but there is no cross-era comparison tooling.

---

## A note on the download

The full six-season game-log stream is 151 MB (578k rows each for
`player_game_stats` and `player_game_grades`). The package ships a 5,000-row sample of
each under `history/game_logs_sample/`; regenerate the full stream with
`python3 engine/export_history.py 6`, which writes them to `history/`. Season, career,
honors, voting, and record tables are complete in the package.
