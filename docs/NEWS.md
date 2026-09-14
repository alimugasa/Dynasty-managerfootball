# Weekly News Feed

Location: `supabase/functions/_shared/engine/news/`. Pure, like the rest of the
engine: no I/O, no clock, no `Math.random`.

```bash
npm run report:news                        # 5 seasons of real football, measured
npm run report:news -- --seasons 20        # the variation guarantee at scale
npm run report:news -- --print 6           # more of the feed as a reader sees it
```

## What the feed is

Six kinds of story, each detected from something the simulation already
produced. No story is invented: every row traces back to a game result, a box
score line, an injury roll or a standings record.

| Category | Fires on |
|---|---|
| `UPSET` | A side rated 4+ points below its opponent wins |
| `STREAK` | Three or more in a row, then every second game after |
| `MILESTONE` | A big single game, or the week a season total crosses a marker |
| `INJURY` | Four weeks or longer, season-ending separated out |
| `HOT_SEAT` | A coach two wins clear of, or short of, what the roster promised |
| `AWARD_RACE` | From week 8, when a race is tight or effectively settled |

## No repeated sentences within a season

The requirement is a claim about output, so it is measured on output. Three
mechanisms make it true, in order of how much work they do:

1. **Templates dealt without replacement.** Each kind has a deck; a phrasing
   cannot come round again until every other has been used. When the deck is
   spent it reshuffles rather than refusing to write.
2. **Word banks.** `{@bank}` slots multiply each phrasing into many surface
   forms — six templates against four banks of five is hundreds of sentences
   per kind before a team name is substituted.
3. **A verbatim headline ledger.** The backstop. A headline already published
   this season is never published again; if no phrasing of a fact is new, the
   fact is **dropped** rather than repeated.

The ledger spans the season, not the week, which is why it is a parameter of
`generateWeeklyNews` rather than something the generator owns. Passing a fresh
one each week would discard the guarantee silently.

Across seasons the ledger resets **on purpose**. A good line returning in 2031
is the design; the report prints the cross-season distinct count so that number
is visible rather than mistaken for a defect.

Measured over five seasons of simulated football, 671 published headlines:

```
  repeats within a season      0
  distinct across all seasons  577 of 671  (86.0%)
  facts dropped as unphrasable 49  (6.8% of candidates)
```

And over twenty seasons — 2,699 headlines, the volume where a weak guarantee
would show — still **zero** repeats in any season, at a 6.3% drop rate.

Zero is the only acceptable number in the first row. A rising drop rate in the
third is the signal that a template bank has grown too thin for the volume of
facts a category produces.

## The weekly cut

The detectors fire far more than a feed can carry — a mid-season week produces
around forty facts against a cap of eight. Ranking on importance alone chose
badly, and the report is what caught it: a week's feed came out as six
milestones and two injuries, and `AWARD_RACE` was detected 22 times a season
and **published none of them**, because a coach under pressure outranked every
race in the league.

So selection is two passes. The first takes the best of each category up to
`maxPerCategory`, which stops any one theme owning the week. The second spends
whatever room is left on the highest-rated facts held back, so a quiet week
still fills. Two properties worth keeping are pinned by tests: a week flooded
with twenty injuries publishes at most three of them, and a week where nothing
else happened still publishes a full feed.

Award-race importance also scales with how late the season is. Flat, a race
never survived a busy week; week 17 with nothing between two players is a
bigger story than most injuries, and the scale now says so.

## Validated on real football, not fixtures

`scripts/news-report/season.ts` simulates an actual 272-game season: the 32
clubs, the schedule and every rating come from the seed, and the scores,
injuries and box score lines come from the game engine. A news engine validated
only against handwritten fixtures proves that the templates render, not that
the detectors fire on real football.

Absences carry across weeks there, as they do in the calibration harness and
for the same reason: the engine treats each game as independent, so a season
loop that never sits an injured player out reports a league where nobody is
ever missing. This was not a theory — without it a club eventually loses every
quarterback it has and a twenty-season run dies on `MissingUnitError`, which is
how the omission was found. A game no club can field a side for is skipped and
counted in the report, never replaced with an invented result.

The unit tests carry the other half. The strongest one renders *every* template
of *every* kind against the slots that kind's own detector actually supplies, so
a template referencing a slot its detector never sets fails the build rather
than shipping literal braces into a headline.

## The front office's own five

The engine's six categories are all reactions to football that has been played,
which means a franchise created five seconds ago has none of them. A News tab
that opened empty on a new dynasty read as broken rather than as new, so five
more categories are written by the API rather than by the engine
(`supabase/functions/_shared/api/franchiseNews.ts`, pure; its facts are
gathered in `franchiseNewsFacts.ts`):

| Category | Written when | From |
|---|---|---|
| `FRANCHISE` | the dynasty is created | the GM name on the save, the club's identity row, the owner row |
| `OWNER` | the dynasty is created | `ownerMandate()` — the same derivation the dashboard's Owner Goal card prints |
| `CAMP` | the dynasty is created | the roster count, and `injuryCount()` for who misses week 1 |
| `MATCHUP` | the dynasty is created | the week 1 fixture, or its absence |
| `RESULT` | every week that is played | the club's own game, and the table just recomputed |

The first four are written inside `create-save`'s transaction, so a dynasty
either has its opening feed or does not exist. The build screen counts them
like every other step ("4 stories"). `RESULT` is appended in `week.ts` beside
the engine's own stories, so the feed has one entry every week that is about
the club being managed, win or lose.

Missing facts are reported, never filled in. A save created without a GM name
gets a story about an office with no name on the door; a league whose schedule
has not been written gets "The league schedule is being prepared" rather than a
preview of a fixture nobody has scheduled. Both are pinned by tests in
`tests/news/franchiseNews.test.ts`.

No story carries a pronoun for an owner. The world stores an owner's name,
archetype, patience and tenure and no gender, so "he" would be invented — and
wrong for roughly half the league by construction. A test asserts the opening
four contain none.

## Storage

Rows go to `news` (migration `0008`), constrained and indexed by `0011`,
widened by `0030`:

- `news_category_check` — eleven categories now: the engine's six and the front
  office's five. Still a check rather than free text, so a typo in a detector
  is a failed insert rather than a category that never renders.
- `news_importance_idx` on `(save_id, season, importance desc, news_id desc)` —
  the season feed, biggest story first.
- `news_team_idx` and `news_player_idx`, partial on non-null — a club's or a
  player's history, years later.
- `read_at timestamptz` and `news_unread_idx`, partial on null — read state,
  added by `0030`.

`read_at` is a nullable timestamp rather than a boolean on purpose: null means
nobody has opened it, and that is also what a row written before `0030` reads
as, which is the same fact. There is no backfill and no default. It is the
player's state, not the world's — the engine never reads it, no outcome turns
on it, and clearing it changes nothing about the save.

The engine returns rows without `save_id`, `news_id` or `published_at`. It is
pure and has no business minting identities or reading a clock; the server owns
all three.

## The News tab

`src/screens/NewsScreen.tsx`, with the card in `newsCard.tsx` and the
destination rules in `newsAction.tsx`. Two reads and one write:

- `news` (`reads/news.ts`) — the whole season's feed, newest first, with the
  club and player each story names already resolved, whether its game has a box
  score yet, and the unread count.
- `mark-news-read` (`markNewsRead.ts`) — one story, or every unread one. The
  update is guarded by `read_at is null`, so re-opening a story does not move
  the time it was first read.

Seven filter chips — All, Team, League, Injuries, Transactions, Draft, Owner —
defined once in `newsFilters.ts` and used by both the app and the play-test rig,
so the count on a chip and the list under it cannot disagree. They overlap on
purpose: your own player's injury is a Team story and an Injuries story. Team
and League are the exception and partition the feed exactly.

Two of the seven have nothing behind them in this build: nothing writes a
`TRANSACTION` or a `DRAFT` story yet. The chips are still there, and their empty
state says which it is — a filter that found nothing, or a feature that does not
exist. `CHIP_UNWRITTEN` is where that fact is recorded rather than discovered.

**A card shows a button only when the screen behind it exists.** The tempting
shortcut — switch on the category — gets this wrong for exactly the story a new
franchise opens on: the Game screen reads `game_results`, so the week 1 preview
has no box score to open and a View Matchup button on it would 404 on the first
tap a player ever makes in this tab. So the read reports `gamePlayed`, and an
unplayed fixture is sent to the Play tab instead. Another club's camp story gets
no button at all, because the roster screen shows yours.

The accent down the left of a card is a hue, not a brightness: your own club's
colour, blue for a league story big enough to lead with, and the interface's own
blue-grey for everything else. A club colour darker than the panel behind it is
refused in favour of the club's secondary, then gold — half the league plays in
a navy that measures darker than this ink, and an accent nobody can see is worse
than none, because the card silently loses the mark that says it is yours.

## Where the numbers come from

`docs/news-baseline.txt` is the committed output of `npm run report:news`. It is
regenerated deliberately, so a change in the feed's character shows up as a diff
rather than as a thing somebody notices a month later.
