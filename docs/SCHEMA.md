# Schema Design

Authoritative source: `supabase/migrations/`. Applied in numeric order.

| Migration | Contents |
|---|---|
| `0001_foundation` | `profiles`, `saves`, the RLS predicate |
| `0002_world_league` | leagues, conferences, divisions, teams, stadiums, owners, colleges |
| `0003_world_staff` | coaches, attributes, staffs, schemes |
| `0004_world_players` | players, attributes, traits, morale, injuries |
| `0005_world_roster_contracts` | rosters, depth charts, contracts, contract years, cap, finances, free agents, needs, owner goals |
| `0006_world_schedule_draft` | schedule, byes, draft capital, prospects, scouting, provenance |
| `0007_runtime_results` | game results, season statistics, season grades, standings |
| `0008_runtime_history` | transactions, awards, ballots, honours, league history, coach history, records, news |
| `0009_rls` | forced RLS on all 45 tables, read-only client policies, self-verification |
| `0010_create_save` | `create_save()`, the template clone |

45 tables, 45 primary keys, 103 foreign keys, forced row-level security on every one.

## The template save

There is one set of tables, not a seed set plus per-save copies. Every game table
carries `save_id`. The imported starting world lives under a single `saves` row
with `is_template = true`, owned by nobody and readable by everyone;
`create_save()` clones it under a fresh id.

This keeps one table name, one domain type and one RLS policy per concept. The
alternative duplicates 28 table definitions and leaves a permanent question at
each call site about which copy is authoritative. It costs about 25,200
duplicated rows per save, roughly 12 MB, and it makes deleting a dynasty one
cascading delete instead of 42 scoped ones.

Nothing in the world is genuinely immutable, which is the deciding argument. A
dynasty retires players, fires coaches and rewrites depth charts. Tables modelled
as shared reference data would have to migrate to per-save copies the first time
any of that shipped.

## Composite keys

Primary keys are `(save_id, natural_id)` and foreign keys carry `save_id` through
the composite. With a plain `player_id` reference, a depth chart row in one save
could legally point at a player in another, and the corruption would stay
invisible until a lineup rendered someone else's roster. The composite makes it
unrepresentable rather than merely unlikely. The suite in `supabase/tests/`
asserts it.

Natural text ids from the seed (`BUF`, `BUF_QB_01`, `CCH0001`) are kept rather
than replaced with surrogate uuids: 25,187 CSV rows already use them and they
stay readable in logs and parity goldens.

## Security posture

1. Every game table **enables and forces** RLS. Enabling alone leaves the table
   owner exempt.
2. A table with RLS on and no policy denies everything. That is where each table
   starts, and it is what deny-by-default means here.
3. The only client policy is `SELECT`, limited to save ids the caller owns plus
   the read-only template.
4. **No client `INSERT`, `UPDATE` or `DELETE` policy exists anywhere.** Not on
   depth charts, not on `saves`. Every write is an engine outcome and goes
   through an edge function holding the service role.

Point 4 is `ARCHITECTURE.md` rule 2 expressed as a database privilege instead of
a code-review convention. A user editing a depth chart is proposing a lineup; the
server decides what that does to a game. A tampered client holding a valid token
still cannot award itself a win, a draft pick or cap room.

Two mechanisms sit outside RLS because RLS is row-level and these are not:

- **Prospect true ratings.** `draft_classes.true_overall`, `true_potential` and
  `bust_risk` are removed from the client's grant. The user reads the consensus
  grade and their own club's noisy estimate in `scouting_reports`.
- **The `v_team_game_stats` view** is declared `security_invoker`. A Postgres view
  runs with its owner's privileges by default and would otherwise return every
  save in the database straight past the policy on `game_results`.

`0009` ends with three checks that fail the migration if a table lands without
forced RLS, if a client-writable policy appears on game state, or if a
table-level `SELECT` grant reappears on `draft_classes`.

## Denormalization register

Every deliberate duplication, and why it earns its place.

| Where | Duplicated | Reason |
|---|---|---|
| `teams.conference_id` | Reachable through `division_id` | Conference standings, leaders and playoff seeding all filter on it, and it cannot change during a save. Realignment is not a feature. |
| `players.team_id` | Also on `team_rosters` | "Who employs this player" is read by nearly every query in the app, most of which have no reason to touch roster metadata. Kept consistent by a trigger, not by a rule people remember. |
| `players.college_name` | `colleges.name` | Written once at creation. A drafted player's school must stay correct in the record book independent of the college pipeline. |
| `game_results` home/away columns | Two teams in one wide row | `sim_game()` produces both boxes as one indivisible result and every scoreline in the UI shows both sides. Two rows would make the dominant read a self-join. `v_team_game_stats` provides the long shape for aggregation. |
| `player_season_stats.passer_rating` | Derivable from five columns | Stored so the leaderboard, player page and record book cannot disagree, and so no football arithmetic happens in frontend code. |
| `free_agents` player fields | `players` | Free agency sorts and filters ~600 rows on exactly these five fields. Written on entering the market, discarded on signing, so they cannot drift across a season. |
| `transactions`, `awards`, `honours`, `league_history`, `league_records` name and club snapshots | Live entities | Durability, not speed. At season 50 the player who won a 2031 title is retired and his club has a different roster; a record book built only on joins renders an empty cell. Keys are kept alongside for routing when the entity survives. |
| `league_history` | Derivable from standings, results and awards | History screens read fifty seasons at once. Written when a season closes, never updated, so it cannot drift. |

Two things are deliberately **not** denormalized. `player_attributes` stays a wide
66-column table rather than key/value, because the whole row is read together on
the hottest path in the simulation. `player_season_grades` stays separate from
`player_season_stats`, because a grade is a judgement and a stat line is a count
of events; merging them invites a screen to average a grade with a yardage total.

## Defects corrected from the seed schema

| Defect | Fix |
|---|---|
| `season_schedule.home_score` / `away_score` typed `text`, so `'10' < '9'` | Removed. Results are outcomes and live on `game_results` as integers. A game with no result row has not been played. |
| `player_contracts` columns named `base_salary_2026`, `cap_hit_2026`, `dead_cap_if_cut_2026` and three more | Normalized into `contract_years`, one row per contract per league year. A column named for a year is a bug with a delivery date. |
| `salary_cap.rollover_from_2025` | Renamed `rollover_from_prior`. |
| `salary_cap.cap_limit` typed `integer` | Widened to `bigint`. The engine grows the cap 6.2% a year off $302,000,000, which crosses the `int4` ceiling in 2062 and reaches $6.11 billion by 2076 — inside the supported fifty-season lifetime. |
| 13 tables with no primary key, including `team_rosters` and `team_coaching_staff` | All 45 tables now keyed. A player held one roster spot only by convention. |
| `v_standings` recomputed wins and losses in SQL | Replaced by a `standings` table the engine writes. The view could not express a tie and made the database a second implementation of a rule the engine owns; a view ranking on win percentage would disagree with the bracket the engine actually produced. |
| `colleges.nfl_pipeline_rate` | Renamed `pro_pipeline_rate`. It embeds a real league abbreviation in a commercially shipped schema and survived the IP linter only because `\bnfl\b` does not match before an underscore. |
| `players` carried `roster_status`, `designation` and `depth_rank`, all also on `team_rosters` | Removed from `players`. Two writable copies of one mutable fact is the drift class of bug `legacy/ENGINE.md` already records fixing once. |

Integer 0/1 flags become real booleans throughout, so that
`count(*) filter (where is_starter)` cannot be confused with `sum(is_starter)`.

## Row growth per simulated season, per save

| Table | Rows / season | Note |
|---|---:|---|
| `scouting_reports` | ~8,300 | 32 clubs × ~260 prospects |
| `player_season_stats` | ~1,750 | regular season and playoffs |
| `player_season_grades` | ~1,750 | |
| `transactions` | ~1,200 | draft, free agency, releases |
| `news` | ~300 | |
| `game_results` | 285 | 272 regular + 13 playoff |
| `season_schedule.playoff_round` | — | `OPENING`, `QUARTERFINAL`, `CONFERENCE_FINAL`, `LEAGUE_FINAL` (0020) |
| `standings.conference_seed` | 14 a season | 1-7 per conference, NULL for the eighteen who missed |
| `league_history.playoff_result` | 32 a season | written when the final is played, not by the offseason |
| `coaches` / `coach_attributes` | ~500 | the engine's staffs, rewritten after every offseason |
| `team_coaching_staff` | one per employed coach | the job he holds; deleted and rewritten, because a fired coach has a row to lose |
| `coach_history` | ~480 a season | what each coach did that year and what became of him |
| `awards` / `award_ballots` | 5 and 25 a season | the winner and the whole ballot behind him |
| `honours` | 50 a season | both all-league teams, drawn from everyone graded |
| `league_records` | 15 | single-season and career bests, updated as seasons are played |
| `save_documents.offseason` | 1 while a winter is being played | offers, draft order, the pick it waits on; null otherwise (0023) |
| `draft_picks.made_by_user` | — | true for a pick the manager made himself |
| `draft_classes` | ~260 | |
| `coach_history` | ~130 | |
| `honours` | ~105 | |
| `standings` + `league_history` | 64 | |
| `awards` + `award_ballots` | ~70 | |
| **Total** | **~14,200** | |

Fifty seasons is roughly 710,000 rows per save on top of the ~25,200 cloned at
creation. Comfortable for Postgres with the indexes defined.

Scouting reports dominate at 59% of all growth, and they lose their value the
moment a draft completes. Retaining only the two most recent classes cuts
fifty-season growth to about 300,000 rows. That prune belongs in the offseason
rollover step.

## Deliberately absent

There is no per-game player statistics table. `legacy/ENGINE.md` is explicit that
the engine produces season-level statistics and no game logs. An empty table
would be a standing invitation to populate it with plausible numbers, which
`ARCHITECTURE.md` rule 3 forbids. When game logs are built they arrive as their
own migration alongside the engine change that fills them.

Trades, waivers, practice squads, franchise tags and compensatory picks have
column support in `transactions` and `draft_picks` but no dedicated tables, for
the same reason: the engine does not implement them yet.

## The engine's state, and the projection

Migration 0017 adds `save_documents`: one row per save holding the versioned
save document (`supabase/functions/_shared/save/`) and the season's news
ledger. It is the engine's own state and no client can read it -- RLS is
forced and there is no SELECT policy, because the document carries every
player's true potential. The handlers under `supabase/functions/_shared/api/`
load it, run the engine, and rewrite the tables the client reads from it:
`players`, `team_rosters`, `free_agents`, `player_contracts`, `contract_years`
and `salary_cap` after anything that moves a roster; `game_results`,
`player_game_stats`, `player_season_stats`, `standings`, `player_injuries` and
`news` after every week; `league_history`, `player_season_grades`,
`transactions`, `draft_picks`, `season_schedule`, `team_season_summary` and
`player_career_totals` at rollover. The projection runs one way, so a row can
never disagree with the document for longer than the transaction that wrote it.

`player_game_stats` (also 0017) is one line per player per game, every column
the engine emits and no defaults; `prune_player_game_stats(save, keep)` keeps
the current season plus `keep` prior (default 3), the older seasons living on
as `player_season_stats` totals. Rows written with `data_class = 'ENGINE'`
are the engine's; the seed's are `GENERATED` and `MODELED`.

## Running the schema locally

```bash
supabase/tests/run-local.sh    # applies every migration, then the RLS suite
```

`supabase/tests/00_local_shim.sql` recreates the parts of a Supabase database the
migrations depend on — the `auth` schema, `auth.uid()`, and the `anon`,
`authenticated` and `service_role` roles with Supabase's default grants — so the
schema can be validated on a plain Postgres cluster. It is never applied to a
real project.

`01_rls_test.sql` asserts the properties rather than the DDL: clone correctness,
cross-save foreign key rejection, roster/player consistency, that one user cannot
read another's save, that the client cannot write standings, ratings, depth
charts or the calendar, that prospect true ratings are unreadable, that
`create_save` is not callable by a client, and that deleting a save leaves no
orphans.
