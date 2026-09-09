# Saves

Two layers, versioned independently because they change for different reasons.

| | What it versions | Where | Migrated by |
|---|---|---|---|
| **Save document** | the shape of the engine's own state | `supabase/functions/_shared/save/` | `migrate()` in TypeScript |
| **Save rows** | the shape of a save's rows in Postgres | `supabase/migrations/0013` | `apply_save_migrations()` in SQL |

`engine_version` is recorded and never migrated: it explains a result, it does
not change one.

The document lives in Postgres, in `save_documents`, through `PostgresSaveStore`
(`supabase/functions/_shared/api/saveStore.ts`), which implements the same
store interface the memory store does -- so every load goes through the one
path: read, migrate, validate, deserialise. The relational tables are a
projection of the document; see `docs/SCHEMA.md`.

## Forward only

There is no downgrade path and there will not be one. An older build opening a
newer save must refuse, because the alternative is loading it, silently
dropping whatever the newer format added, and then saving over it. Both layers
refuse loudly:

```
Save was written by a newer build (format 4, this build reads 3).
Update the app rather than opening it here.
```

Adding a version means three things, and a test asserts all three agree:
bump `SAVE_SCHEMA_VERSION`, add the `VERSION_LOG` entry, add the step in
`migrations.ts`. A bump without a step fails the build rather than failing on
somebody's dynasty.

## What a migration step may do

A step takes a document at version N and returns one at N+1. Three rules:

**It never reads the current types.** Steps work on `UnknownDocument`. A step
that imported `SavedPlayer` would compile against today's shape and break
silently the next time that shape changed — which is precisely the moment the
step needs to keep working.

**It never invents data it cannot derive.** Where a new field has no answer in
the old document, the honest value is the one that makes the old behaviour
continue. The v2→v3 step adds `previousTeamId`, and sets it to the player's
current club for anyone under contract and `null` for a free agent — because v2
free agency had no loyalty term at all, so "nowhere" is what reproduces how the
save was actually played. Inventing a plausible former club would change the
outcome of the next market the player opened the save to run.

**It is pure and total.** No clock, no RNG, no I/O — so a failed load can be
retried, and migrating twice gives the same answer.

The driver proves it arrived: a step that forgets to set `version` on its
output is caught rather than looping or returning a half-migrated document that
deserialises without complaint.

## Loading

One path, always: read bytes → migrate → validate → deserialise. Migration
happens *before* validation, never after — a v1 document validated against v3
rules fails for the wrong reason and tells the player their save is corrupt
when it is merely old.

The loader validates every field and names the one that failed:

```
Save is unreadable at players[412].ability: expected a finite number, got null
```

`ARCHITECTURE.md` rule 3 has its sharpest application here. A loader that
defaulted a missing ability to 50 would turn a corrupt save into a league of
mediocre players and tell nobody.

## Integrity

`checkIntegrity()` runs against the document, so it holds for a save on disk, a
save in Postgres and a league in memory alike. Three families:

- **Nulls** — a required field that arrived null or NaN.
- **Orphans** — a reference to something absent: a contract on a retired player,
  a roster spot at a club that does not exist, a draft class for a season
  already played.
- **Cap** — a club over the salary cap, a roster over the limit, a contract
  outside the rules it was signed under.

## The integration test

`tests/save/integration.test.ts` creates a save, plays ten seasons and asserts
all three families hold every year. The league is **not** held in memory across
seasons: each year it is serialised, pushed through a store that round-trips it
as JSON, migrated, validated and rebuilt, and the next season is played on
whatever came back. A save system tested by keeping the object graph alive
tests nothing.

It also asserts that load-then-save is a fixed point — byte-identical. If it is
not, every reload mutates the save a little and ten reloads compound into
something nobody wrote, which is how long saves rot.

### What it found

Four real defects, none of which any existing test could see:

**Compliance ran cut and fill once each, in that order.** Clubs cut their way
under the cap, then signed minimum-salary bodies to fill the roster — and went
straight back over, with nothing re-checking. Two clubs were over the cap by
season four.

The first fix was wrong and the test caught that too: alternating cut and fill
until they settle turned one club into 183M of dead money and released the first
overall pick. Every cut charges dead money, so a club that is over the cap cuts,
becomes *more* over, and cuts again — cutting is not a fixed-point operation and
must not be iterated as if it were. The cut pass now reserves the room the fill
pass will need, and each runs once.

**Free agents held contracts for ever.** `expireContracts` skipped unrostered
players, so a contract on a player with no club never ticked down and never
expired. 188 players in the first season alone were "under contract" to nobody.
A contract is a relationship with a club: no club, no contract.

**The starting world is already over the cap — seven of 32 clubs, one by 84M.**
Contracts in the seed loader are derived from market value, which knows nothing
about the cap. This one is **reported and bounded, not fixed**, and that is a
deliberate call worth reviewing:

- Running the engine's compliance pass at load releases players and charges dead
  money. A from-scratch world has no history to charge, so one club came out
  with 276M of dead money and further over than it started.
- Scaling wages to fit works arithmetically, but the intake, market and drift
  baselines are all calibrated against these exact contracts. Scaling broke the
  draft-need test and pushed the first offseason hard enough to release two
  first-round rookies on guaranteed deals — which
  `tests/offseason/freeAgency.test.ts` correctly refuses, because cutting a
  guaranteed rookie deal frees nothing.

The first offseason's compliance pass resolves it, and the league stays legal
for the ten seasons after. The real fix belongs to the seed importer that will
build the production template world, where each club's wages can be constructed
inside a cap budget from the start and the calibration re-run once against the
result. `tests/save/save.test.ts` bounds the overage so it cannot quietly grow
from seven clubs to twenty.

**One game in 2,720 went unplayed.** A club lost a position group to injury and
could not field a side. The engine reports that rather than inventing a
scoreline, which is right; the gap it exposes is that nothing signs a
replacement mid-season. A real club whose only kicker tears a knee signs one off
the street on Tuesday, and this league cannot. The test bounds the rate rather
than asserting zero, so the regression that would matter — this becoming
systemic — still fails.

The first two fixes were confirmed by reverting each and watching the test fail.

## The SQL side

`saves.schema_version` tracks a save's row shape. Migration is per-save rather
than a bare `ALTER`, because a DDL change applies to every save at once — right
for adding a column, wrong for anything that has to look at a save's data.
Backfills differ per dynasty, some are expensive, and a save nobody opens should
not pay for one.

`apply_save_migrations()` reads the version `FOR UPDATE`: two clients opening the
same dynasty would otherwise both run the v1 step and the second would fail on
the log's primary key having already written half its migration. Steps are
idempotent, so a migration that failed after its writes but before its version
bump can be retried.

`supabase/tests/01_rls_test.sql` proves the driver reaches the current version,
stamps the save, logs each step, is a no-op on a second run, refuses a save from
a newer build, and cannot be invoked by a client.

## Save files

A save sits in a numbered slot the player chooses, and carries the name of the
general manager who runs it. Both live on `public.saves` -- `slot`,
`gm_first_name`, `gm_last_name` -- and not in the engine document, because the
menu has to read them before anything is opened and opening a 12MB document per
slot to print a record is not a menu.

| | |
|---|---|
| Slots offered | three (`SLOT_COUNT`), plus any a save already sits beyond them |
| One save per slot | `saves_user_slot`, a unique index on `(user_id, slot)` |
| Every player save has a slot | `saves_slot_presence`, a **deferred** constraint trigger |
| A GM has both names or neither | `saves_gm_name_pair` |

The presence rule is a deferred constraint trigger rather than a `CHECK` because
`create_save()` inserts the row and then clones the world under it, and the slot
is written by the handler that called it. Postgres cannot defer a `CHECK`. The
trigger re-reads the row rather than trusting `NEW`: a deferred trigger runs at
commit but carries the row as the triggering statement left it, so `NEW.slot` is
still the null the INSERT wrote.

Nothing is invented for a save that predates this. Slots were backfilled in
creation order -- a slot is an ordering the player chooses, not a fact about the
world -- but GM names were left null, and the menu prints *No GM recorded*.

`create-save` takes an optional `slot` (the lowest free one when omitted) and an
optional GM name, and refuses a slot that is occupied before it clones anything.
The `slots` read answers the menu from `saves`, `teams` and `standings` in one
query; `save` opens the save it is given, or the most recently touched when it
is given none.

## Where the pieces live

| | |
|---|---|
| Format, versioning, migrations | `supabase/functions/_shared/save/` |
| Row versioning and SQL steps | `supabase/migrations/0013_save_versioning.sql` |
| Career state → playable squads | `supabase/functions/_shared/engine/careerBridge.ts` |
| The season loop | `supabase/functions/_shared/engine/season.ts` |
| Integration test | `tests/save/integration.test.ts` |
| Format tests | `tests/save/save.test.ts` |
| Save files and the GM | `supabase/migrations/0025_save_slots.sql` |
| The menu's read | `supabase/functions/_shared/api/reads/slots.ts` |
| The start flow | `src/screens/HomeScreen.tsx` and the three after it |
| Save-file tests | `tests/api/slots.test.ts`, `tests/startFlow.test.tsx` |

`careerBridge.ts` and `season.ts` are new and were needed for the test to exist
at all: nothing previously turned career state into a squad that could play, and
the season loop had been rewritten three times inside report scripts. The bridge
deliberately does **not** synthesise per-skill ratings. `PlayerRatings` has
sixteen optional skills and the career model knows none of them — it has
`ability`. `roster.ts` already reads a skill as `ratings[skill] ?? overall`, so a
player carrying only `overall` is rated on his actual ability everywhere, which
is right for a model that does not distinguish them. Synthesising a spread from
a hash of the player id would look more detailed and would be fabrication: it
would decide, from nothing, that this quarterback is accurate but indecisive,
and games would then be won and lost on it.

## Not yet built

The Postgres-backed `SaveStore` — writing the document to the save-scoped tables
and reading it back. The interface (`store.ts`) and the two migration layers are
in place; what is missing is the implementation that maps the document onto the
45 tables, which needs the write path the app does not have yet. Until then
`MemorySaveStore` is the only implementation, and it round-trips through JSON
precisely so that it cannot pass tests a real store would fail.
