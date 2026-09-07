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

## Storage

Rows go to `news` (migration `0008`), constrained and indexed by `0011`:

- `news_category_check` — the six categories, so a typo in a detector is a
  failed insert rather than a category that never renders.
- `news_importance_idx` on `(save_id, season, importance desc, news_id desc)` —
  the season feed, biggest story first.
- `news_team_idx` and `news_player_idx`, partial on non-null — a club's or a
  player's history, years later.

The engine returns rows without `save_id`, `news_id` or `published_at`. It is
pure and has no business minting identities or reading a clock; the server owns
all three.

## Where the numbers come from

`docs/news-baseline.txt` is the committed output of `npm run report:news`. It is
regenerated deliberately, so a change in the feed's character shows up as a diff
rather than as a thing somebody notices a month later.
