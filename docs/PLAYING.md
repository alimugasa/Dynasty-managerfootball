# Playing it

```bash
DB=dmp_dev npm run db:fresh          # migrations from nothing, the template world, the dev user
export DATABASE_URL=...              # the URL db:fresh printed
npm run dev:api                      # the shim, on :8787
VITE_API_URL=http://localhost:8787 npm run dev   # the app, on :5173
# open http://localhost:5173/
```

Two processes. The shim (`scripts/dev-api.ts`) is a transport: it routes a
request to a handler under `supabase/functions/_shared/api/` and serialises the
answer. Every handler is the same code the edge function
(`supabase/functions/api/index.ts`) imports. The app talks to nothing else.

On first open the Team tab lists the clubs; pick one and a dynasty is created
on the server -- `create_save()` clones the template, the engine's state is built
from the clone, and every roster, contract and cap sheet is written back. You
manage whichever club you picked. Office → *Start a new dynasty* deletes it
and offers the list again.

## The loop

| Step | Where |
|---|---|
| Set a depth chart | **Roster** tab → pick a position chip → ↑ / ↓ arrows |
| Sim a week | **Team** tab → *Sim week N* |
| Read the box score | **Team** → *Last result* row, or **Schedule** → any played fixture |
| Standings and leaders | **League** tab |
| Read the news | **Office** tab → News |
| Sim to the end | **Team** → *Sim to end of season* (one request per week) |
| Run the offseason | **Team** → *Run offseason → next year* (appears once the schedule is done) |
| Play year two | **Team** → *Sim week 1* again |

The depth chart is load-bearing, not decoration: the order you set is stored in
`team_depth_charts` and is the order the engine fields next week. The season is
the seed's schedule -- **18 weeks with byes, 272 games** -- for the first year;
later years get a round-robin from `buildSchedule` (288 games over 18 weeks).

## Where the game runs

In Postgres. `ARCHITECTURE.md` rule 2 holds: the client is read-only. Nothing
under `src/` imports the engine or the seed (`scripts/lint-arch.mjs` rule 6
fails the build if something does), the production bundle carries neither, and
the browser holds no game state -- not in memory, not in `localStorage`. It
holds which save it is looking at and re-reads after every write.

The engine's own state -- the versioned save document from
`supabase/functions/_shared/save/` plus the season's news ledger -- lives in
`save_documents`, which no client can read (it carries true potential). Every
table the screens read is a projection of it, rewritten by the handler that
changed it. See `docs/SCHEMA.md` and `docs/SAVES.md`.

## What lands, per step

Measured by `npm run walk` (a headless browser driving the real app and shim,
counting rows in Postgres after every step) on a fresh database:

| After | game_results | player_game_stats | player_season_stats | standings | news | transactions | draft_picks | league_history | player_season_grades | team_season_summary | player_career_totals | season_schedule | players |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| create | 0 | 0 | 0 | 32 | 0 | 0 | 448 | 0 | 0 | 0 | 0 | 272 | 3,066 |
| sim week 1 | 16 | ~700 | ~700 | 32 | 8 | 0 | 448 | 0 | 0 | 0 | 0 | 272 | 3,066 |
| sim to end of 2026 | 272 | ~11,750 | ~830 | 32 | ~144 | 0 | 448 | 0 | 0 | 0 | 0 | 272 | 3,066 |
| offseason → 2027 | 272 | ~11,750 | ~830 | 64 | ~144 | ~1,100 | 672 | 32 | 1,696 | 32 | ~830 | 560 | ~3,400 |
| sim week 1 of 2027 | 288 | ~12,450 | ~1,520 | 64 | ~152 | ~1,100 | 672 | 32 | 1,696 | 32 | ~830 | 560 | ~3,400 |

Also at create: `team_rosters` 1,696 (32 × 53), `free_agents` 1,152,
`player_contracts` 1,696, `contract_years` ~4,240, `salary_cap` 32, the managed
club's 53 rows in `team_depth_charts`, and one `save_documents` row. Per-game
lines carry the counts the engine emits and nothing else; `snaps`, starts,
fumbles and the other columns it does not count are NULL.

A week takes about 200 ms on the server; the offseason about a second.
`player_game_stats` is retained for the current season plus three
(`prune_player_game_stats`, migration 0017).

## What is stubbed or missing

Honestly, and in the order you will notice it:

- **No playoffs.** The last week ends the season and the offseason button
  appears. The standings are the final word; there is no bracket, no champion.
  `game_results.competition` is always `REGULAR`.
- **The seed's day-to-day injuries are honoured; its long-term list is not
  yet.** The 195 day-to-day rows are dated to week 0 at create time, so a
  player listed as out for n weeks misses the first n-1. The 114 IR/PUP/NFI
  rows stay undated: the seed lists those players on the 53 with nobody
  behind them -- nine clubs' only kicker or punter -- and until clubs can sign
  a replacement in season, honouring them left 39 games with no side to field.
  A club whose only kicker, punter or quarterback is day-to-day still loses
  that game to a red notice rather than a phantom: 8 of 272 games in the
  first three weeks of a measured season, none after week 3. The seed's 186 free agents enter the engine's
  pool.
- **No in-season roster moves.** You cannot sign, cut, or trade during the
  year. If your only kicker gets hurt, you play without one. Very rarely a club
  cannot field a unit and the game is skipped -- the Team tab says so in a red
  notice rather than inventing a scoreline, and the fixture stays `SCHEDULED`.
- **The offseason runs itself.** Development, retirement, the draft, the market
  and compliance happen when you press the button; the AI runs your club too.
  The engine drafts in its own strength order and trades nothing, so a template
  `draft_picks` row for a later year is overwritten with the club that actually
  picked.
- **The first offseason is a bloodbath, and that is the seed's.** The seed's
  own contracts are 1,342 one-year minimum deals, so about 900 expire at once,
  the market signs about 1,400 players, and every club then cuts to the roster
  limit (~700 cuts, 80 of them rookies drafted the same spring, two of them
  first-rounders). All of it is in `transactions` -- `CONTRACT_EXPIRY`,
  `FREE_AGENT_SIGNING`, `RE_SIGNING`, `RELEASE` with the reason and dead money,
  `DRAFT_SELECTION`, `RETIREMENT` -- as the engine reported it.
- **The seed's 2026 draft class is not what gets drafted.** `draft_classes`
  is the template's data; the engine drafts from its own pipeline, primed at
  create time. Reconciling the two is an open decision.
- **Long snappers are on the roster and not in the sim.** The engine has no
  position group for them, so the seed's 32 stay on their clubs' `team_rosters`
  and `player_contracts` rows as the seed wrote them, outside the engine's
  52-man squad and its cap sheet.
- **No coaching or staff screens.** `CoachScreen`, `CollegeScreen`,
  `DraftPickScreen`, `ScoutingScreen`, `StaffScreen` and `TransactionsScreen`
  render skeletons and nothing links to them. `transactions` is written; no
  screen reads it yet.
- **Player pages show this season only** on screen; `player_career_totals` is
  refreshed at every rollover and is not yet drawn.
- **No awards, no honours, no record book.** The tables exist; nothing fills
  them.
- **News has no coach or award-race stories.** The engine has no coach model
  and no award races are defined; those detectors receive empty inputs.
- **Seven clubs start over the cap, and that is the seed's too.** With its own
  53-man rosters under its own contracts: DET -69.4M, SF -18.6M, CAR -16.7M,
  KC -15.0M, PIT -12.8M, GB -10.1M, DEN -1.2M -- while the seed's `salary_cap`
  table claims every club is under. Nothing is cut to hide it; the first
  offseason's compliance pass resolves it (18 cap cuts league-wide) and the
  Office shows the negative space.
- **The transport shim trusts `DEV_USER_ID`.** There is no auth server in
  development. The edge function reads the verified JWT; the shim is never
  deployed.
