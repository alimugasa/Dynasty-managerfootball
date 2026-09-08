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
| Sim to the end | **Team** → *Sim to end of season* (one request per week, stops at the bracket) |
| Play a playoff round | **Team** → *Play the Opening Round*, then one button per round |
| Follow the bracket | **Team** or **League** → *See the bracket*, or **Schedule** → the round chips |
| Play the offseason | **Team** → *Play the offseason* (appears once the final is played) |
| Skip the offseason | **Team** → *Simulate it → next year*, or *Let the staff handle the rest* at any step |
| Play year two | **Team** → *Sim week 1* again |

The depth chart is load-bearing, not decoration: the order you set is stored in
`team_depth_charts` and is the order the engine fields next week. The season is
the seed's schedule -- **18 weeks with byes, 272 games** -- and later years keep
that shape, with the clubs renamed by a seeded permutation, so every year is 17
games each over 18 weeks.

## The postseason

Fourteen clubs, seven from each conference: the four division winners seeded
one to four by record, then the three best of the rest at five to seven. The
top seed rests the opening round; the rest open 2v7, 3v6 and 4v5. Every round
re-seeds -- the best surviving seed meets the worst -- and the higher seed
hosts until the League Final, which is played on neutral ground. One loss and
a club is out, so a playoff game cannot end level.

The four rounds are the **Opening Round**, the **Quarterfinals**, the
**Conference Final** and the **League Final**, played in weeks 19 to 22. Ties
on record are broken in one fixed order: the games between the tied clubs,
division record, conference record, point differential, and finally a coin
drawn from the season's own stream, so the same season seeds the same table
every time it is loaded.

The bracket is never stored. It is derived from the seeds on `standings` and
the playoff games in `game_results` every time it is asked for
(`supabase/functions/_shared/engine/playoffs.ts`), so a save reopened mid-round
picks up exactly where it was. Playoff production is written under
`competition = 'PLAYOFF'` and never joins the regular season's totals or the
table. When the final is played, every club's line goes into `league_history`
with its seed and how far it got, and the champion's players each gain a ring.

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
| sim to end of 2026 | 272 | ~14,300 | ~1,190 | 32 | ~600 | 0 | 448 | 0 | 0 | 0 | 0 | 278 | 3,066 |
| play the four rounds | 285 | ~15,000 | ~1,600 | 32 | ~620 | 0 | 448 | 32 | 0 | 0 | 0 | 285 | 3,066 |
| offseason → 2027 | 285 | ~15,000 | ~1,600 | 64 | ~620 | ~2,800 | 672 | 32 | 1,696 | 46 | ~1,600 | 557 | ~3,400 |
| sim week 1 of 2027 | 301 | ~15,850 | ~2,460 | 64 | ~640 | ~2,800 | 672 | 32 | 1,696 | 46 | ~1,600 | 557 | ~3,400 |

Thirteen of those 285 games are the bracket, and the 32 `league_history` rows
are written by the final rather than by the offseason: every club's line, its
seed, and how far it got.

Also at create: `team_rosters` 1,696 (32 × 53), `free_agents` 1,152,
`player_contracts` 1,696, `contract_years` ~4,240, `salary_cap` 32, the managed
club's 53 rows in `team_depth_charts`, and one `save_documents` row. Per-game
lines carry the counts the engine emits and nothing else; `snaps`, starts,
fumbles and the other columns it does not count are NULL.

A week takes about 200 ms on the server; the offseason about a second.
`player_game_stats` is retained for the current season plus three
(`prune_player_game_stats`, migration 0017).

## The staff

Every club employs the seed's own coaches: a head coach, two coordinators and
the position room, each with the seed's attributes. They are not decoration.
The offensive coordinator's play-calling is what the engine reads on third and
four; the head coach's game and clock management are what it reads at the end
of a half; the room's development rating decides how fast that club's young
players close on their potential, and its evaluation decides how well the club
reads a draft class.

Development is redistributed, never created: the multiplier is centred on the
league's own mean, so a league of good staffs does not inflate everyone. That
is what keeps the forty-season talent-drift check flat with staffs on.

Every winter the carousel runs. A club judges its head coach against what its
roster said it should win rather than against .500, so a rebuild can survive a
losing season and a contender cannot. Nobody is fired in his first year, no
more than a quarter of the league turns over in one winter, coaches retire
with age, and vacancies are filled from one pool -- the most attractive club
hiring first, promoting a coordinator where the coordinator is the best
candidate. New coaches enter each year, named from the league's own names, so
a fifty-season dynasty never runs out. It all lands in `coach_history`,
`transactions` (COACH_HIRE, COACH_FIRE, COACH_RETIRE, COACH_PROMOTE) and the
hot-seat stories in the news feed.

Office → *Coaching staff* shows your room, its rating and where it ranks.

## The end of the year

When the final has been played the league votes. Five awards -- Player of the
Year, Offensive and Defensive Player of the Year, Newcomer of the Year and
Coach of the Year -- and two all-league teams, chosen from every player the
engine graded rather than from the box scores alone, so an offensive lineman
can be first team.

A vote is a vote, not a maximum. Voters read the grade, what the position is
worth, the production and what the club won, and they disagree by a few per
cent, which decides a photo finish and never overturns a landslide. The whole
ballot is kept: finishing second in 2031 is a line on a career.

The coaching award goes for beating what the roster promised, not for the best
record. An award goes onto the player, where the market reads it: reputation
follows accolades, so a winner is paid like one the following spring.

The record book updates as seasons are played, single-season and career.
Office → *Season recap* shows the champion, the awards, the first team, your
own year and the records that fell.

## The offseason you play

Five steps, and a button at every one of them to hand the rest to your staff.

| Step | What you decide |
|---|---|
| **Season review** | Nothing. Closing the season grades everyone, ages the league, retires who is finished, runs the carousel and votes on the awards. |
| **Contracts** | Re-sign your own out-of-contract players, release anyone, trade with another club. |
| **The draft** | It runs pick by pick and stops on yours. You take a player off your own scouts' board. |
| **Free agency** | Put offers in. They go to market with every other club's. |
| **Camp** | Nothing. Every club cuts to fifty-three and the calendar is drawn. |

Every price is the engine's. A player's re-signing ask is his market value
weighted by how much he cares about money, so a loyal player takes a discount
and a mercenary does not. Cutting someone costs the dead money his deal
carries. A club considering a trade wants more value than it gives, will not
take on salary it cannot fit, and says which of the two it is. An offer in
free agency competes with every other club's by the same rule -- money, need,
the club's standing, the player's own character -- so you can be outbid, and
you can overpay.

Each step is one request that ends with the league written back, so the
browser can be closed between any two of them. What you have decided but not
yet committed -- your offers, the draft order, the pick the draft is waiting on
-- lives beside the save document rather than in it.

## What is stubbed or missing

Honestly, and in the order you will notice it:

- **You cannot hire or fire a coach yourself.** The carousel runs itself, your
  club included: it fires your head coach when the seat gets hot enough and
  hires the best candidate for you. Choosing your own staff is not built.
- **Trades are players for players.** Draft picks cannot be traded yet, and no
  club offers you a deal of its own: you propose, they answer.
- **No in-season moves.** Signing, cutting and trading are offseason work; once
  the season starts the roster is what you take into it.
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
- **The first offseason is busy, and that is the seed's.** The seed's own
  contracts are 1,342 one-year minimum deals, so about 900 expire at once and
  the market signs about 950 players; clubs then cut about 160 to the roster
  limit. All of it is in `transactions` -- `CONTRACT_EXPIRY`,
  `FREE_AGENT_SIGNING`, `RE_SIGNING`, `RELEASE` with the reason and dead money,
  `DRAFT_SELECTION`, `RETIREMENT` and `WASHOUT` -- as the engine reported it.
- **Half of every year's departures are washouts, not retirements.** The
  engine's hazard washes out fringe players at 25-29 and retires the rest at
  26-41; the log now says which is which. A washout is out of the league, not
  a free agent, and does not come back.
- **Clubs pursue their top three needs in free agency,** plus any acute one,
  so a signing draws one to nineteen bids (mean about four) rather than all 32
  clubs. Who signs where is different from before this rule.
- **Rookies have names**, drawn from the league's own first names and
  surnames, the same for the same seed.
- **Sacks belong to the pass rush.** EDGE, then DT, then LB; corners get
  none. Linebackers lead the tackle count.
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
