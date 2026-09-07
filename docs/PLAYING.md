# Playing it

```bash
npm install
npm run dev
# open http://localhost:5173/
```

You manage **Buffalo Stampede** (`BUF`) — the first club in the seed. To manage
someone else, open Office → *Start a new dynasty* (that wipes the saved game),
or call `restart('SEA')` from the game context.

## The loop

| Step | Where |
|---|---|
| Set a depth chart | **Roster** tab → pick a position chip → ↑ / ↓ arrows |
| Sim a week | **Team** tab → *Sim week N* |
| Read the box score | **Team** → *Last result* row, or **Schedule** → any played fixture |
| Check standings | **League** tab |
| Read the news | **Office** tab → News |
| Sim to the end | **Team** → *Sim to end of season* |
| Run the offseason | **Team** → *Run offseason → 2027* (appears once week 17 is done) |
| Play year two | **Team** → *Sim week 1* again |

The depth chart is load-bearing, not decoration: put a worse quarterback first
and he starts, and his line shows up in the box score.

The season is **17 weeks**, 32 clubs, 16 games a week — a round-robin built by
`buildSchedule`. There are no playoffs yet (see below).

## Where the game runs, and why that is wrong

`ARCHITECTURE.md` rule 2 says no simulation outcome is decided in frontend code.
**This build breaks that rule**, deliberately and visibly.

There is no server. No Supabase client exists, no edge function, nothing that
can run a week and store the result. The engine is pure TypeScript, so the only
way to have a playable game today is to host it in the browser — which is what
`src/game/` does, persisting through the save system to `localStorage`.

`scripts/lint-arch.mjs` encodes the exception rather than hiding it: `src/game/`
may import the engine, and nothing else under `src/` may. The simulation is
called from exactly one directory, and that directory is what gets deleted when
the server write path lands.

## Saving

Automatic, to `localStorage` under `dmp.save.v1`, after every action. The league
goes through the versioned save document (`supabase/functions/_shared/save/`),
so a save written today survives a format change. A save this build cannot read
is dropped rather than crashing the app on boot.

A quota failure does not take the game down: the dynasty continues in memory and
is lost on refresh. That is bad and visible, rather than a white screen.

## What is stubbed or missing

Honestly, and in the order you will notice it:

- **No playoffs.** Week 17 ends the season and the offseason button appears. The
  standings are the final word; there is no bracket, no champion, no ring.
- **No in-season roster moves.** You cannot sign, cut, or trade during the year.
  If your only kicker gets hurt in week 3, you play without one. Very rarely a
  club cannot field a unit at all and the game is skipped — the Team tab says so
  in a red notice rather than inventing a scoreline.
- **The offseason runs itself.** Development, retirement, the draft and free
  agency all happen when you press the button. You do not pick draft picks or
  bid on free agents; the AI does it for your club too.
- **No coaching or staff screens.** The Office tab has cap, news and history
  only. `CoachScreen`, `CollegeScreen`, `DraftPickScreen`, `ScoutingScreen`,
  `StaffScreen` and `TransactionsScreen` still render skeleton placeholders and
  are no longer reachable — nothing links to them.
- **Player pages show this season only.** Career totals are not accumulated
  across years in the browser session; the `player_career_totals` table that
  answers this exists in the schema but nothing writes to it yet.
- **No awards, no honours, no record book.** The tables exist; nothing fills
  them.
- **News has no coach or award-race stories.** The detectors exist and are
  tested, but the browser loop does not assemble the coach and award-race inputs
  yet, so you get upsets, streaks, milestones and injuries only.
- **Nothing is in Postgres.** Every migration, every index, the RLS, the
  summary tables and the save-row migrations are all real and tested — and
  entirely unused by this build, which never opens a database connection.

## What was fixed to get here

Six things, all found by walking the loop in a headless browser:

1. `scripts/lib/seedCsv.ts` imported `node:fs` at module scope, so the browser
   died on boot before rendering anything. The parser is now its own module.
2. `loadCareerLeague` reached the same `node:fs` import through its default
   parameter, so the loader could not be reused in the browser. The world
   builder moved to `careerWorld.ts`, which takes an injected reader; the browser
   hands it bundled CSV strings and runs the same loader the reports use.
3. The five tab screens and the player and box-score screens rendered skeletons
   with no data behind them.
4. The Office tab's *Scouting department*, *Coaching staff* and *Transactions*
   rows opened placeholder screens — three dead ends. They are gone.
5. **The app took 12.7 seconds to show anything.** The Google Fonts stylesheet
   is render-blocking, so a slow or unreachable `fonts.googleapis.com` holds the
   whole app on a blank screen until it times out. Loaded without blocking, the
   same boot is **290ms**, and identical whether the fonts arrive or not.
6. Loading a save rebuilt the entire 2,848-player world from the seed CSVs and
   then threw it away, so a returning dynasty paid full price to open. Warm boot
   went from 335ms to 98ms.
