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

## Getting in

The app opens on a main menu with two options, and the way in is five taps:

```
Home -> New Franchise  -> Save file -> Create GM -> Select Team -> Team Preview
              -> Franchise Settings -> Confirm Franchise -> Building the world
                                                         -> Dashboard
     -> Load Franchise -> Save file ---------------------------------------> Dashboard
```

**New Franchise** asks for three things and one optional fourth: which of the
three save files to start in, a first and last name for the general manager,
one of the thirty-two teams, and -- optionally -- how that manager sees the job.
There is no difficulty, no traits, no avatar, no reputation and no start date,
because a new game always opens at week 1 of the regular season --
`create-save` writes `week = 1, phase = 'REGULAR_SEASON'` and has no other
setting.

**Create GM** takes the two names and shows what they add up to while you type:
a preview card with the GM's monogram, his role, and the facts that are true of
a manager who has not worked a day -- reputation unknown, career record 0-0,
legacy not started -- over the save file he is being created in. Continue is
held until both names are there, and a refused tap says which field is missing
rather than sitting dead.

Under the preview is the one optional question: **GM style**, one of Architect,
Talent Scout, Negotiator, Culture Builder or Strategist. It opens on Architect,
it is kept on the save file, and nothing in the simulation reads it yet -- which
the screen says on itself. It is stored rather than discarded so that the day
the engine does read it, every franchise created from today has an honest
answer to give.

**Select Team** is a scouting board rather than a list. A search box matches on
city, nickname, abbreviation, conference and division, word by word, so "iron
north" finds the Cleveland Ironmen. Nine chips cut the league: All, Contenders,
Playoff Push, Mid-Tier, Rebuilds, Cap Space, Young Roster, Elite QB and High
Draft Picks, and the line under them says what the chip actually selected --
"the eight clubs with the most room under the cap" -- rather than leaving the
rule to be reverse-engineered from the results. A filter that matches nothing
says so and offers Clear Filters.

Each row carries the club's badge, its market over its nickname, its place in
the league in words ("Atlas North", never "AC · AC-N"), its
roster rating and how hard the job is. The league is 32 clubs in two
conferences -- Atlas and Frontier -- of four divisions of four; a placing is
written three ways depending on the room a screen has, and all three come from
`leaguePlacing.ts`: "Atlas Conference East" in full on the team preview, "Atlas
East" on a row or a dashboard tile, and "AC East" only where the full name is
already on screen. All of that is measured from the
template world's own rows by the `team-profiles` read -- unit ratings from the
players who would be on the field, cap space from the cap sheet, draft capital
from the picks the club owns, owner patience and stadium capacity from their
own tables. A club the read could not measure shows a dash; nothing is filled
in with a zero.

**Team Preview** is the scouting report for the club that was tapped, in the
order a front office reads one.

*Identity* — the club's two kit colours washed across the card with an accent
rule drawn from them, its badge, market, abbreviation and league placing, and
underneath, at a size you can read across a room, how hard the job is: Dynasty
Ready, Playoff Push, Middle Class, Rebuild, Hard Rebuild or Cap Hell.

*Ratings* — overall, offence, defence and special teams as rings, where the arc
is the number and the colour is the band: teal for elite, green for strong,
neutral for solid, amber for developing, red for weak. Two channels for one
fact, so the colour reads before the digits do and the arc still reads in
greyscale.

*Front office* — cap space (`$24.6M`), draft capital as a word and a score
(`Strong · 82`, where 50 is exactly the picks every club is given), roster age,
roster count, owner patience (`Patient · 72`), fan pressure, stadium, and the
franchise status the first two sections add up to.

*Football situation* — the quarterback in one of six words (Franchise QB, Bridge
QB, Rookie Project, Veteran Stopgap, Open Competition, No Answer), the best
player, the top young player, the biggest weakness and the roster timeline. It
closes on one instruction — *Review offensive line depth.*, *Find a long-term
quarterback.*, *Protect cap space.*, *Win now, before the veteran core ages
out.* — derived from the four sections above it.

Walking back out changes nothing, which is the point of it being a screen
rather than a confirmation on a list row: a player can open five clubs and
start none of them. **Back to Teams** returns to the board with the search and
the chips as they were.

**Franchise Settings** is where the rules are set. A summary card reminds you
of the GM, the club, the difficulty and the season; a difficulty card offers
Easy, Normal, Hard and Custom; and eight rows set the rest: injury frequency,
salary cap, trade difficulty, draft class strength, player development,
scouting visibility, auto-sim CPU games and Commissioner Mode.

Easy, Normal and Hard each set all eight rows at once and lock them — shown,
not hidden, because a preset is a statement about all eight and a player
choosing Hard deserves to read what Hard did rather than take the word for it.
Custom unlocks them, and changing a row renames the difficulty to match: eight
rows that happen to equal Hard *are* Hard, and eight that equal nothing are
Custom.

Commissioner Mode asks before it turns on — *Enable Commissioner Mode?*, "This
unlocks editing tools and can affect save balance." — and once on, an amber
*Commissioner Tools Enabled* badge follows the franchise onto the summary card
and the confirmation.

**Nothing in the simulation reads these settings yet.** The screen says so once,
at the foot of the rules, and the save records every one of them from today, so
that the day the engine starts reading them every franchise created from now has
an honest answer to give. Eight controls promising specific behaviour would be
worse than none if none of it were true and the screen kept quiet about it.

**Confirm Franchise** is the last screen, and the only one in the flow that
writes. *Review your setup before taking the office.* Four cards:

- **Save File and GM** — the file number, an editable save name defaulting to
  the club's (*Cleveland Ironmen Franchise*), the GM, his style, and the two
  facts true of a manager who has not worked a day: reputation *Unknown*,
  career record *0-0*. Clear the name and Create Franchise closes.
- **Team Selection** — badge, club, market, conference and division, difficulty,
  archetype, all four ratings, cap space, draft capital, owner patience and fan
  pressure, with a **Change Team** link back to the scouting report that keeps
  the GM, the rules and the board's own search and filters.
- **League Setup** — teams, conferences, divisions, the regular season's length,
  playoffs, draft picks on the books, the cap setting and the starting point.
  All of it **counted from the template world**, not stated: thirty-two clubs and
  eighteen weeks are facts about this seed, and a screen that printed them as
  constants would be wrong the day a different one ships.
- **Rules and Settings** — the difficulty and all eight rules, closing on an
  amber warning where the editing tools are open and *Realistic franchise rules*
  where they are not.

Create Franchise hands over to **Building Franchise World**, which is the screen
that runs the single call to `create-save`. It shows the club's badge, the GM and
the file over a backdrop built from the club's own two colours, and a checklist
of the ten steps the build performs: league structure, teams, players, rosters,
contracts, depth charts, schedule, draft picks, news feed, front office.

**What that checklist can honestly show is set by how the world is written.**
`create-save` is one transaction, which is what lets it promise a failure leaves
the save file empty — and rows inside an open transaction are invisible to every
other connection, so there is nothing to poll and nothing to stream part-way.
The steps are therefore *reported* rather than narrated: the handler records what
each one produced, counted off the rows it wrote, and hands the list back when
the franchise commits. The screen then checks them off with those counts —
`3,066 players`, `272 fixtures`, `448 picks`, `4 stories` — and says at the foot
why nothing ticked along before that. A step with nothing to count (opening the
office is work rather than rows) reads *Ready*, never `0`.

**A failure names the step.** The handler wraps each phase so a throw carries the
step it was in, and that name travels across the wire to the failure card:
*Generating schedule failed*. The card promises the file is still empty, because
the transaction guarantees it, and offers **Retry** and **Return to Main Menu**.
Retry rather than "retry this step": there is no half-built world to resume from,
and a button claiming otherwise would describe an architecture this one does not
have. The draft survives a failure, because six screens is a lot to answer twice.

When every step is checked, the screen pauses on *Opening front office…* and then
the franchise dashboard takes over.

Nothing before it writes anything. The file, the names, the style and the club
collect in the franchise setup state (`src/app/FranchiseSetup.tsx`), which lives
above the navigation stack so walking forward and back between the questions
does not lose them, and which is thrown away the moment the dynasty is created
from it. *Create Franchise* is what creates it: `create_save()` clones the
template world under a fresh server-side seed, the engine's state is built from
the clone, and every roster, contract, cap sheet and opening table is written
back. Then the franchise dashboard opens on it.

**Load Franchise** shows the same three files. An occupied one shows its team
and badge, the GM's name, the season and where in it the save is, the team's
record, cap space, titles won and when it was last saved; an empty one says it
is empty and is what New Franchise starts in. Renaming and deleting live here
too, behind the card's overflow menu, because three files with no way to clear
one is a dead end.

A save made before general managers were named says *No GM recorded* rather
than being given a name it never had; one made before styles were asked for
reports no style rather than claiming Architect; and a save whose table has not
been written yet shows a dash rather than 0-0.

Which save is open is remembered in the browser, so a reload puts you back in
the game rather than at the menu. It is remembered nowhere else: the save lives
on the server, and opening the app on another device meets the menu. Office →
*Main menu* closes the dynasty without deleting anything.

## The loop

| Step | Where |
|---|---|
| Start a dynasty | **Home** → *New Franchise* → a save file → a GM name → a team → *Choose This Team* → the rules → *Create Franchise* |
| Reopen one | **Home** → *Load Franchise* → the save file |
| Leave to the menu | **Office** → *Main menu* |
| See where the franchise stands | **Team** tab — the dashboard is the first screen after the world is built |
| Work through the first week | **Team** → *Before week 1* — five rows; progress is kept on the save |
| Read the team's rating | **Team** → the four rings under the identity card |
| See what the owner wants | **Team** → *The owner* |
| Set a depth chart | **Team** → *Depth chart* → pick a position chip → ↑ / ↓ arrows |
| Release a player | **Team** → *Depth chart* → a player → *Release* — under four seasons and he goes to waivers, four or more and straight to the market |
| Claim somebody off waivers | **Team** → *Waiver wire* → a player → *Submit claim*; withdraw it any time before the deadline |
| Sign a free agent mid-season | **Team** → *Free agents* → filter → a player → move the terms → *Offer this deal* |
| Meet a player's counter | the offer sheet's *Meet his number* button — it names the salary that closes it |
| See every move in the league | **Team** → *Transactions*, or the News tab's *Transactions* chip for the ones worth reporting |
| Build a trade | **Team** → *Trade Center* → a club → tick assets on both sides → *Offer this trade* |
| See what they think of it | the interest meter under the package, which re-reads as you change it |
| Put a player on the block | his profile → *Place on trade block* — clubs that need him will call, and he will know |
| Answer an offer | **Team** → *Trade Center* → *Incoming offers* |
| Find out when trading shuts | the Trade Center header, or the countdown on **Play** and **Office** once it is close |
| Sim a week | **Play** tab → *Sim week N*, or the week card on **Team** |
| See who you play next | **Play** tab — the matchup card is the top of it |
| Check the injury report | **Play** → *Game prep* |
| Read the box score | **Play** → *Last result* row, or the schedule → any played game |
| Read your schedule | **Team** → *Schedule* |
| Standings and leaders | **League** tab |
| The league's schedule | **League** → *Schedule* |
| Split the table | **League** → *League* / *Conference* / *Division* |
| Sort the table | **League** → the sort chips, then the ▼/▲ pill to reverse |
| Read a leaderboard | **League** → *Leaders* → side of the ball, then a board |
| Playoff leaders | **League** → *Leaders* → **PLAYOFFS** |
| Read the news | **News** tab — four stories are waiting before a single week is played |
| Filter the feed | **News** → the chips: *All*, *Team*, *League*, *Injuries*, *Transactions*, *Draft*, *Owner* |
| Read a story in full | **News** → tap the card. It expands, the unread mark clears, and a button appears if there is a screen behind it |
| Read the cap sheet | **Office** tab → *Finances* |
| The rules this save is played under | **Office** → *Franchise rules* |
| Sim to the end | **Play** → *Quick sim* → *Sim to End of Regular Season* — confirms first, then hands over a season summary (one request per week, stops at the bracket) |
| Play a playoff round | **Play** → *Play the Opening Round*, then one button per round |
| Follow the bracket | **Play** or **League** → *See the bracket*, or the schedule's round chips |
| See the awards | **League** → *Awards and records*, once the season is closed |
| Play the offseason | **Play** → *Play the offseason* (appears once the final is played) |
| Skip the offseason | **Play** → *Simulate it → next year*, or *Let the staff handle the rest* at any step |
| Play year two | **Play** → *Sim week 1* again |

The depth chart is load-bearing, not decoration: the order you set is stored in
`team_depth_charts` and is the order the engine fields next week. The season is
the seed's schedule -- **18 weeks with byes, 272 games** -- and later years keep
that shape, with the teams renamed by a seeded permutation, so every year is 17
games each over 18 weeks.

## The postseason

Fourteen teams, seven from each conference: the four division winners seeded
one to four by record, then the three best of the rest at five to seven. The
top seed rests the opening round; the rest open 2v7, 3v6 and 4v5. Every round
re-seeds -- the best surviving seed meets the worst -- and the higher seed
hosts until the League Final, which is played on neutral ground. One loss and
a team is out, so a playoff game cannot end level.

The four rounds are the **Opening Round**, the **Quarterfinals**, the
**Conference Final** and the **League Final**, played in weeks 19 to 22. Ties
on record are broken in one fixed order: the games between the tied teams,
division record, conference record, point differential, and finally a coin
drawn from the season's own stream, so the same season seeds the same table
every time it is loaded.

The bracket is never stored. It is derived from the seeds on `standings` and
the playoff games in `game_results` every time it is asked for
(`supabase/functions/_shared/engine/playoffs.ts`), so a save reopened mid-round
picks up exactly where it was. Playoff production is written under
`competition = 'PLAYOFF'` and never joins the regular season's totals or the
table. When the final is played, every team's line goes into `league_history`
with its seed and how far it got, and the champion's players each gain a ring.

## The standings, and who leads the league

Two splits sit on the League screen and they are not the same split.

The **standings** split by where a team sits: the whole league, its two
conferences, or its eight divisions, under the names the league itself gives
them (`league_conferences` and `league_divisions`, not labels the screen made
up). It arrives in the league's own order -- win percentage, then points
difference -- and that order is the standing. Sorting by any column is a
view of the same rows and never a different league position, which is why
*League order* is a sort field of its own rather than a hidden default. Sorting
is the explicit control above the standings rather than tappable column headers,
for the reason in `docs/PROMPT-BOOK.md` prompt 0061: a standings column on a
phone is thirty pixels wide. The sort is stable, so equal values keep the
league's order between them and the same sort applied twice gives the same
rows in the same places.

The **leaders** split by what a player leads in and by competition. Twelve
boards, ten deep, over three sides of the ball: passing yards, passing
touchdowns, rushing yards, rushing touchdowns, receiving yards, receiving
touchdowns and receptions; sacks, interceptions and tackles; field goals and
punting yards. Each row carries the games its number was made in, so a leader
on four playoff games is not read as one on seventeen. A regular-season board
and a playoff board are separate records and are never summed -- the toggle
asks a different question of the same read, and the `REGULAR` / `PLAYOFF` split
in `player_season_stats` is what makes summing them impossible rather than
merely discouraged.

There is no playoff standings table, only a bracket, so the standings do not
change when the leaders do.

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
are written by the final rather than by the offseason: every team's line, its
seed, and how far it got.

Also at create: `team_rosters` 1,696 (32 × 53), `free_agents` 1,152,
`player_contracts` 1,696, `contract_years` ~4,240, `salary_cap` 32, the managed
team's 53 rows in `team_depth_charts`, and one `save_documents` row. Per-game
lines carry the counts the engine emits and nothing else; `snaps`, starts,
fumbles and the other columns it does not count are NULL.

A week takes about 200 ms on the server; the offseason about a second.
`player_game_stats` is retained for the current season plus three
(`prune_player_game_stats`, migration 0017).

## The staff

Every team employs the seed's own coaches: a head coach, two coordinators and
the position room, each with the seed's attributes. They are not decoration.
The offensive coordinator's play-calling is what the engine reads on third and
four; the head coach's game and clock management are what it reads at the end
of a half; the room's development rating decides how fast that team's young
players close on their potential, and its evaluation decides how well the team
reads a draft class.

Development is redistributed, never created: the multiplier is centred on the
league's own mean, so a league of good staffs does not inflate everyone. That
is what keeps the forty-season talent-drift check flat with staffs on.

Every winter the carousel runs. A team judges its head coach against what its
roster said it should win rather than against .500, so a rebuild can survive a
losing season and a contender cannot. Nobody is fired in his first year, no
more than a quarter of the league turns over in one winter, coaches retire
with age, and vacancies are filled from one pool -- the most attractive team
hiring first, promoting a coordinator where the coordinator is the best
candidate. New coaches enter each year, named from the league's own names, so
a fifty-season dynasty never runs out. It all lands in `coach_history`,
`transactions` (COACH_HIRE, COACH_FIRE, COACH_RETIRE, COACH_PROMOTE) and the
hot-seat stories in the news feed.

Office → *Coaching staff* shows your room, its rating and where it ranks.

## The end of the year

When the final has been played the league votes. Five awards -- Player of the
Year, Offensive and Defensive Player of the Year, Newcomer of the Year and
Coach of the Year -- two all-league teams and two all-star rosters, all chosen
from every player the engine graded rather than from the box scores alone, so
an offensive lineman can be first team.

Three selections, three different questions:

| | Picked by | Shape |
|---|---|---|
| **All-league first team** | the whole league, as one | the starting shape: 25, one deep at every position |
| **All-league second team** | the whole league, as one | the next 25 |
| **All-star roster** | each conference, for itself | 41 a side, 82 in all -- a roster with substitutes |

The all-star rosters are a separate vote rather than the all-league team
reprinted: they are cut by conference, they run deeper, and they draw their own
voter disagreement. So the second-best quarterback in the league is on a roster
if the best one plays in the other conference, and a player can be an all-star
and on neither all-league team. Both selections need half a season played --
this is a reward for a year, and half a year is not one. The long snapper takes
a roster spot on the all-star side and none on an all-league team: the game
model never asks for a snap, so there is no best snapper to name.

A vote is a vote, not a maximum. Voters read the grade, what the position is
worth, the production and what the team won, and they disagree by a few per
cent, which decides a photo finish and never overturns a landslide. The whole
ballot is kept: finishing second in 2031 is a line on a career.

The coaching award goes for beating what the roster promised, not for the best
record. An award goes onto the player, where the market reads it: reputation
follows accolades, so a winner is paid like one the following spring.

The record book updates as seasons are played, single-season and career. It is
rebuilt when the season is settled rather than at camp, because that is when a
season's totals stop changing -- and because the year in review is shown three
steps before camp.

A season ends on the ceremony: the awards, one card each with the margin it was
won by, and then the year. Office → *Season recap* is the archive, and answers
for any season the dynasty has played.

## The offseason you play

Five steps, and a button at every one of them to hand the rest to your staff.

| Step | What you decide |
|---|---|
| **Season over** | Nothing. Closing the season grades everyone, ages the league, retires who is finished, runs the carousel and votes on the awards. |
| **The awards** | Nothing. Five awards, each with the vote share it was won by and the player it was won from, then the all-star rosters and both all-league teams. |
| **The year in review** | Nothing. The champion, your own season, and the records that fell. |
| **Contracts** | Re-sign your own out-of-contract players, release anyone, trade with another team. |
| **The draft** | It runs pick by pick and stops on yours. You take a player off your own scouts' board. |
| **Free agency** | Put offers in. They go to market with every other team's. |
| **Camp** | Nothing. Every team cuts to fifty-three and the calendar is drawn. |

Every price is the engine's. A player's re-signing ask is his market value
weighted by how much he cares about money, so a loyal player takes a discount
and a mercenary does not. Cutting someone costs the dead money his deal
carries. A team considering a trade wants more value than it gives, will not
take on salary it cannot fit, and says which of the two it is. An offer in
free agency competes with every other team's by the same rule -- money, need,
the team's standing, the player's own character -- so you can be outbid, and
you can overpay.

Each step is one request that ends with the league written back, so the
browser can be closed between any two of them. What you have decided but not
yet committed -- your offers, the draft order, the pick the draft is waiting on
-- lives beside the save document rather than in it.

## What is stubbed or missing

Honestly, and in the order you will notice it:

- **You cannot hire or fire a coach yourself.** The carousel runs itself, your
  team included: it fires your head coach when the seat gets hot enough and
  hires the best candidate for you. Choosing your own staff is not built.
- **Trades are players for players.** Draft picks cannot be traded yet, and no
  team offers you a deal of its own: you propose, they answer.
- **No in-season moves.** Signing, cutting and trading are offseason work; once
  the season starts the roster is what you take into it.
- **The seed's day-to-day injuries are honoured; its long-term list is not
  yet.** The 195 day-to-day rows are dated to week 0 at create time, so a
  player listed as out for n weeks misses the first n-1. The 114 IR/PUP/NFI
  rows stay undated: the seed lists those players on the 53 with nobody
  behind them -- nine teams' only kicker or punter -- and until teams can sign
  a replacement in season, honouring them left 39 games with no side to field.
  A team whose only kicker, punter or quarterback is day-to-day still loses
  that game to a red notice rather than a phantom: 8 of 272 games in the
  first three weeks of a measured season, none after week 3. The seed's 186 free agents enter the engine's
  pool.
- **No in-season roster moves.** You cannot sign, cut, or trade during the
  year. If your only kicker gets hurt, you play without one. Very rarely a team
  cannot field a unit and the game is skipped -- the Play tab says so in a red
  notice rather than inventing a scoreline, and the game stays `SCHEDULED`.
- **The offseason runs itself.** Development, retirement, the draft, the market
  and compliance happen when you press the button; the AI runs your team too.
  The engine drafts in its own strength order and trades nothing, so a template
  `draft_picks` row for a later year is overwritten with the team that actually
  picked.
- **The first offseason is busy, and that is the seed's.** The seed's own
  contracts are 1,342 one-year minimum deals, so about 900 expire at once and
  the market signs about 950 players; teams then cut about 160 to the roster
  limit. All of it is in `transactions` -- `CONTRACT_EXPIRY`,
  `FREE_AGENT_SIGNING`, `RE_SIGNING`, `RELEASE` with the reason and dead money,
  `DRAFT_SELECTION`, `RETIREMENT` and `WASHOUT` -- as the engine reported it.
- **Half of every year's departures are washouts, not retirements.** The
  engine's hazard washes out fringe players at 25-29 and retires the rest at
  26-41; the log now says which is which. A washout is out of the league, not
  a free agent, and does not come back.
- **Teams pursue their top three needs in free agency,** plus any acute one,
  so a signing draws one to nineteen bids (mean about four) rather than all 32
  teams. Who signs where is different from before this rule.
- **Rookies have names**, drawn from the league's own first names and
  surnames, the same for the same seed.
- **Sacks belong to the pass rush.** EDGE, then DT, then LB; corners get
  none. Linebackers lead the tackle count.
- **The seed's 2026 draft class is not what gets drafted.** `draft_classes`
  is the template's data; the engine drafts from its own pipeline, primed at
  create time. Reconciling the two is an open decision.
- **Long snappers are on the roster and not in the sim.** The engine has no
  position group for them, so the seed's 32 stay on their teams' `team_rosters`
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
- **Seven teams start over the cap, and that is the seed's too.** With its own
  53-man rosters under its own contracts: DET -69.4M, SF -18.6M, CAR -16.7M,
  KC -15.0M, PIT -12.8M, GB -10.1M, DEN -1.2M -- while the seed's `salary_cap`
  table claims every team is under. Nothing is cut to hide it; the first
  offseason's compliance pass resolves it (18 cap cuts league-wide) and the
  Office shows the negative space.
- **The transport shim trusts `DEV_USER_ID`.** There is no auth server in
  development. The edge function reads the verified JWT; the shim is never
  deployed.
