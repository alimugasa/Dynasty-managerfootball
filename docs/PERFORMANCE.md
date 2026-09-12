# Query Audit

```bash
npm run perf:fixture -- --seasons 50          # build the fifty-season fixture
npm run perf:bench -- --out docs/perf-baseline.txt
```

Both need a local Postgres with the migrations applied; `supabase/tests/run-local.sh`
sets one up.

## What this audit could and could not measure

**No screen issues a query today.** Every screen in `src/screens/` renders
skeleton placeholders; `src/data/` held one file, `errors.ts`; there is no
Supabase client anywhere in `src/`. So there was no "before" to profile in the
usual sense, and any table of current query counts would have been invented.

What is measured instead: both halves are real SQL, executed against a real
fifty-season database, and timed by `EXPLAIN (ANALYZE)`.

- **Before** is the query set a straightforward implementation produces — fetch
  the rows the screen names, filter and sort in TypeScript, fetch a row's detail
  when the row needs it. That is what this codebase would have got, because
  nothing in the schema pushed an implementer away from it.
- **After** is the same screen served by the indexes and summary tables in
  migration `0012` through the paging contract in `src/data/page.ts`.

The numbers below are therefore a genuine comparison of two implementations, not
a before-and-after of a change to running code. When the data layer is wired,
`scripts/perf/bench.ts` becomes a regression test against the real thing.

## The volume

`~350k stat rows` was the right order of magnitude. Measured, from a
fifty-season run of the real career engine:

| Table | Rows | Note |
|---|---:|---|
| `player_season_stats` | 84,724 | 1,694/season |
| `player_season_grades` | 84,724 | one per stat row |
| `transactions` | 61,901 | drafts, signings, retirements |
| `game_results` | 14,400 | 288/season |
| `season_schedule` | 14,400 | |
| `players` | 13,795 | every player who ever existed |
| `news` | 6,750 | 135/season |
| `standings` | 1,600 | |
| **Total** | **282,294** | |

282k against an estimate of 350k — the right order of magnitude. The shape
matters more than the total: two tables hold 60% of it, and one of them,
`player_season_stats`, is what every leaderboard, career page and record book
reads.

The 13,795 figure is the one worth noticing. A save holds about 1,700 players at
any moment, but fifty years of drafts and retirements leave eight times that
many rows in `players` — all of them matching a query that filters only on
`save_id`, which is what a roster read looks like when nobody has thought about
it yet.

## Results

Measured by `scripts/perf/bench.ts`. Rows read is what the database actually
touched, from `EXPLAIN (ANALYZE)`, not what came back.

| Screen | Queries | Rows read | Time |
|---|---|---|---|
| Team | 4 → 4 | 4,136 → 155 | 2.0ms → 0.6ms |
| League | 6 → 6 | 89,881 → 94 | 39.9ms → 0.4ms |
| Schedule | 2 → 2 | 612 → 34 | 0.3ms → 0.3ms |
| Roster | **54 → 1** | 96 → 44 | 0.9ms → 0.5ms |
| Office | 1 → 1 | **61,901 → 5** | 13.4ms → 0.1ms |
| Player | 2 → 2 | 32 → 17 | 9.1ms → 0.2ms |
| Transactions | 2 → 2 | 66,951 → 101 | 12.5ms → 0.2ms |
| **All screens** | **71 → 18** | **223,609 → 450** | **78.1ms → 2.3ms** |

The three that matter: the Roster's 54 queries are one query per player, the
shape that gets slower with every roster spot; the Office tab read 61,901 rows
to show five; and the League tab's record book folded the entire stat table on
every open. Schedule barely moves, because a week of fixtures was already
bounded — it is in the table to show that not everything needed fixing.

## What was wrong, by kind

Three different problems, needing three different answers. Adding a table where
an index would do is as much a mistake as the reverse.

**1. Aggregates over history — unbounded by construction.** A club's
fifty-season record folded 14,400 `game_results` rows to draw 50 lines, and grew
every season. The all-time record book folded all 84,724 stat rows to rank
13,792 careers, on every open. These get summary tables: `team_season_summary`
and `player_career_totals`, rebuilt by `refresh_*` functions at season rollover.
They are derived — every column is a fold of rows that remain in place, so if a
summary ever disagrees with its source, the source wins.

**2. Ordered reads of one season — bounded, but reading the season to sort it.**
`pss_leaderboard_idx` covered `pass_yards` only, so rushing, receiving and sack
leaderboards each sorted 1,694 rows on read to return 5. Fixed with three
partial indexes, `where <column> > 0` — a rushing leaderboard has no interest in
the 1,400 players who never carried the ball, and excluding them keeps each
index small.

**3. Long lists — bounded only by paging.** `transactions` reaches 61,901 rows.
Paging is the data layer's job, not the schema's; what the schema owes is an
index whose order matches the page order.

## Two findings that only measurement would have produced

**The feed index was ordered wrong, and looked right.**
`transactions_feed_idx` is `(save_id, season, transaction_id desc)`. Reading it
backward yields season descending but `transaction_id` *ascending* within each
season — not the feed's order. Postgres read all 901 rows of the newest season
and re-sorted them to return five. A mixed-direction composite index only serves
a read whose directions match it exactly, so `0012` adds
`(save_id, season desc, transaction_id desc)`.

**`refresh_player_career_totals` was itself an N+1.** Written first with a
`left join lateral` to pick up each player's grades, it took **53 seconds** on a
fifty-season save — a correlated aggregate per group is an N+1 that happens to
be spelled in SQL. Rewritten as two aggregates joined once: **0.51s**, 104×.

A third came from the benchmark contradicting me. The first version of the
roster's "after" query joined `players` to `player_season_stats` without a team
predicate, so it read all 13,792 players — the benchmark reported it reading
*more* rows than the 54-query N+1 it was meant to replace. It is in the report
because a fix that makes things worse is the reason to measure rather than
reason about it.

## Paging

Keyset, not offset. `offset 44000 limit 50` makes Postgres walk and discard
44,000 rows to return 50, so the last page of a feed costs the most — exactly
backwards. A keyset cursor carries the sort key of the last row seen and seeks
to it, so page 900 costs what page 1 costs.

The cursor carries the name of the sort order it came from, and a cursor from a
different order is rejected rather than silently returning a page from the wrong
place in the list. A corrupt cursor is an error, not a quiet reset to page one:
a list that restarts on its own looks like data loss.

`toPage` reads `limit + 1` rows and discards the last to answer "is there more".
A `COUNT` over a 61,901-row feed to decide whether to draw a "load more" button
is the query nobody notices writing and everybody pays for.

## The read contract

`src/data/queries.ts` names every read the app may issue, each with a declared
bound (`CONSTANT`, `SEASON`, `PER_SEASON`, `PAGED`) and the index or summary
table that makes the bound true. A screen that needs something not on the list
needs an entry first — which is the point: the review happens when the read is
added, not when a dynasty reaches its fortieth season and the Team tab takes
four seconds. Tests in `tests/data/page.test.ts` assert that every read of a
table which grows without limit is `PAGED`, and that no `PER_SEASON` read folds
a table it should be reading a summary of.

## Caveats

- **The fixture is a load fixture, not gameplay data.** Which players exist in
  which season, roster churn, retirements, draft intake and team assignments are
  real output of the career engine, so the cardinality a planner sees is the
  cardinality the game produces. The statistical *values* are drawn from the
  distributions in `docs/sim-report-baseline.txt`, because bridging a
  `CareerPlayer` to the per-attribute `EnginePlayer` the game simulation needs is
  a modelling decision that belongs to the save system. Row counts and index
  selectivity are real; the yardage in any given row is not.
- **Releases are missing from `transactions`.** They happen inside cap
  compliance and the engine does not report them, so the fixture is short one
  transaction kind rather than carrying an invented count.
- **Timings are from a local Postgres 16 with a warm cache**, on a dataset that
  fits in memory. They measure the shape of the work, not production latency.
  The row counts are the durable finding; the milliseconds are not.
