# Regular-season League intelligence

This milestone adds three drill-downs to the existing League hub. It does not
change game simulation, season advancement, final award winners, migrations,
dependencies, design tokens, or avatars.

## Authoritative reads and timing

The authenticated `league-intelligence` handler verifies save ownership and
returns the calendar, team rankings, projected field and award watchlists.
It uses a read-only repeatable-read snapshot so a concurrent week advance
cannot mix the calendar from one week with statistics from another.
Calculations live in `supabase/functions/_shared/api/leagueIntelligence/`.
React renders those results and validates missing fields through MissingData.

Timing comes from the actual regular-season schedule length and completed
regular-season results, not a client calendar:

- Awards open after max(2, ceil(schedule weeks / 3)) completed weeks.
- The projected field opens after max(2, ceil(schedule weeks / 2)).
- Late-season prominence begins at ceil(schedule weeks * 0.75).
- On the current 18-week schedule, those thresholds are 6, 9 and 14.
- Races are active only during REGULAR_SEASON. Once the bracket opens, links
  lead to actual postseason and final season records.
- Team rankings remain regular-season totals during postseason and offseason.
  A new season with no games shows all teams as unranked.

No game or season is simulated by opening any of these screens.

## Projected postseason field

The read reuses `clubRecords`, `regularResults` and the engine's `seedLeague`,
with the same canonical input order and season-specific postseason RNG stream
used by `seedPostseason`. The number of qualifiers comes from the engine.
Division winners lead the field; other qualifying teams follow. Current rules
produce seven seeds in each of two conferences.

The inherited tiebreakers are win percentage, head-to-head, division record,
conference record, point differential and the seeded coin draw. The picture
does not maintain another seeding implementation.

Conference record rank is supplemental, not the seed: division winners take
priority in seeding. Division leaders are the winners selected by the seeding
routine, including when the last tiebreaker is needed.

The user's conference opens by default, with a franchise summary above the
conference selector. Rows show record, division, seed/status, remaining games
and division/conference position. Teams route through EntityLink.

Chasing teams' record gap is
`((cutoff wins - team wins) + (team losses - cutoff losses)) / 2`.
It is explicitly labelled a record-only gap, not games needed to qualify, an
elimination number or a probability. Division priority and tiebreakers matter.
Exact midseason clinching/elimination mathematics do not exist in the inherited
model; no such declarations are fabricated. Actual postseason statuses remain
owned by the existing transition.

## Award methodology

The existing final award taxonomy is retained: Player of the Year, Offensive
Player of the Year, Defensive Player of the Year and Newcomer of the Year.
Separate offensive and defensive newcomer watchlists are views of the existing
newcomer category, not new trophies. Coach and improvement races are deferred.

A live race is a performance watchlist, not a final ballot. Existing final
grades are produced in the offseason and are not live game grades. Running that
grading pipeline early would alter state and invent a current grade. The race
therefore uses recorded counting statistics without touching grades or votes.

Only REGULAR player game lines through the completed week are read. Production:

- QB: passing yards + rushing yards + 20 * (passing TD + rushing TD)
  - 45 * interceptions thrown.
- RB/WR/TE: rushing yards + receiving yards + 20 * (rushing TD + receiving TD).
- EDGE/DT/LB/CB/S: tackles + 5 * sacks + 8 * interceptions caught.

Eligibility requires at least two recorded appearances and appearances in at
least half the most recent club's completed games. Newcomer eligibility is
experience_years = 0. Group mapping accepts both the seed's position labels and
generated players' canonical group labels through the shared API mapper.

Production per appearance is standardized against eligible players in the same
position group, with z-scores limited to [-3, 3]. Offensive efficiency is
production per passing attempt plus rush for quarterbacks, or per target plus
rush for other offensive groups. A player with no recorded opportunities has
zero production efficiency. Offensive score is 75% production z-score plus 25%
efficiency z-score; defensive score is production z-score. Missing appearances
subtract 0.5 * (1 - min(1, appearances / team games)). The index is
50 + 15 * score, rounded to two decimal places.

For the combined overall and newcomer races, the index also uses the existing
final-award positional-value weight: 0.45 + 0.55 * POSITION_VALUE[group].
The weight is a shared pure function used by the unchanged final voter formula.
Side awards measure excellence within that side without this additional weight.

These are transparent presentation weights, not changes to simulation. They
reuse the final awards' position-relative philosophy, names, ballot depth and
overall positional weighting while deliberately omitting unavailable live
grades and final voter noise. Final results can differ.

Each shortlist contains at most five candidates. Equal rounded indices share
a rank; player ID gives stable ordering of ties. Rookie lists compare eligible
rookies against the same positional baselines as veterans rather than changing
the baseline to a tiny rookie sample.

Movement is computed by rerunning the same read through the previous completed
week. UP/DOWN/SAME compares ranks; NEW means absent from that previous shortlist.
No movement is shown on the first activation week. Immutable recorded game
lines supply history; no new snapshot table or client memory is involved.

Limitations: no blocking production, live season grade, snap count or consistent
defensive efficiency denominator is available. Linemen and specialists are
therefore not included in these counting-stat watchlists. Defensive production
can favor visible splash plays; it does not measure coverage responsibility.
Indices are not percentages, vote shares, ability ratings or predicted awards.

## Team-ranking methodology

All nine boards read REGULAR game_results through the completed week:

| Board | Metric | Best |
| --- | --- | --- |
| Overall offense | Recorded passing + rushing yards per game | Highest |
| Overall defense | Opponent passing + rushing yards per game | Lowest |
| Scoring offense | Points scored per game | Highest |
| Scoring defense | Points allowed per game | Lowest |
| Passing offense | Passing yards per game | Highest |
| Rushing offense | Rushing yards per game | Highest |
| Passing defense | Opponent passing yards per game | Lowest |
| Rushing defense | Opponent rushing yards per game | Lowest |
| Turnover differential | Total takeaways minus giveaways | Highest |

Rates account for different games played and byes. Turnover differential is
explicitly a total. Equal unrounded values share a competition rank (1,1,3);
team ID stabilizes tied order. Display values round to one decimal place.
Missing statistics cause a reported failure; teams with zero games have null
rank/value and an explicit unranked state.

Offense and defense are production ranks, not power ratings or efficiency
projections. They are not adjusted for opponent quality or game situation.
The team view shows concise offense, defense and scoring ranks; other metrics
remain on the dedicated screen with an explicit selector.

Team EntityLink already targeted the team route, but that screen previously
ignored the supplied team ID and showed the managed franchise. The route now
honors opponent IDs with a small read-only performance view. It does not expose
management controls for another club or rebuild team profiles.

## News and deferred work

The existing news detector accepts award-race leaders and a clear/tight margin.
Its template interprets a gap as a meaningful race margin. The new watchlist
index is not a vote share, and no authoritative clinching solver exists.
Therefore no race/clinching story events were connected in this milestone.
A follow-up can define an evidence-based story contract without overstating
indices or record gaps.

Also deferred: live blocking grades, coach/improvement races, exact clinching
math, opponent-adjusted metrics, historical race browsing across seasons, and a
richer opponent profile. There are no probabilities or betting features.

## Verification

- Model tests cover timing, role-specific production, rookie/participation
  eligibility, position diversity, deterministic ties, movement and rank metrics.
- API tests create an isolated save, simulate a regular season, check all teams,
  validate statistical arithmetic, inject excluded competition/future-week
  fixtures, and compare the final projected seeds with actual persisted seeds.
- Screen tests cover conference/award/metric selection, entity navigation,
  seasonal availability, mobile controls, unranked, loading, error and MissingData.
- Browser tests follow early League rankings, award activation, player profile
  navigation, picture activation, conference switching, rankings and an opponent
  team view at the project's five configured sizes.
- Existing engine tiebreaker/final-award tests remain unchanged.

The existing sim-report tool failed before simulation because its CSV loader
requires a long snapper absent from the seed. Saved-season API/browser journeys
provide runtime evidence instead; that unrelated report loader was not changed.
