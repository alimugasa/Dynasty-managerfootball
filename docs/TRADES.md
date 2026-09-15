# Trading

The offseason has had trades since the winter was built: the engine prices a
player as an asset and says yes or no. What it never had was any of the things
that make trading something you *do* rather than something you submit — a
package with more than players in it, a club with a stated direction, a reason
attached to a refusal, a counter, a deadline, or the other thirty-one clubs
dealing with each other while you watch.

## What an asset is worth

`tradeValue.ts` anchors on the engine's own `tradeValue` rather than replacing
it. Two valuations would mean a player worth one thing in March and another in
October for no reason anybody could name — the same argument that kept the
in-season market on the offseason's model.

What is added is the rest of what the request weighs: injury history,
production, positional scarcity, scheme fit, morale, draft pedigree and years
of team control. Each is a **multiplier** rather than a term, because a
multiplier cannot make a bad player valuable, only make a good one more or less
so, which is how each of them actually behaves. A 63-rated linebacker with a
clean injury record is still a 63-rated linebacker.

Where a factor is unknown it moves nothing. An unscouted morale, a player with
no games this season, a club with no scheme on record: none is treated as
average, because "we do not know" and "it is average" are different facts.

The compounded multiplier is bounded to 0.70–1.35. Each individual bound is
defensible and their product was not: everything at its best reached 1.65×,
which is the factors deciding the trade and the player coming along for it.

### Picks

Three things decide a pick. The round sets the range; where in the round it
falls places it inside that range — which is what makes a bad club's second
worth more than a good club's, and why a pick's value moves as the season does;
and how far away it is discounts it about a fifth per year. A future year has no
standings behind it, so it is priced at the middle of its round and the screen
says so rather than showing a settled-looking number.

### Packages

A package is deliberately **not** a sum. Three players worth 20 are not one
worth 60: the club receiving them has 53 roster places and can start one at each
position, and the best piece is the reason the deal happens. The largest asset
counts fully and each one after it counts for less.

That is also what stops the obvious exploit — bundling six fringe players to buy
a star — and it has a test of its own.

## What a club is trying to do

Six strategies, from Contender to Full Rebuild, read from the table with two
corrections: a roster much better than its record is unlucky rather than
finished, and an old roster going nowhere sells harder than a young one. Nobody
is a full rebuild in September, because four games is not a verdict and a league
that gave up in week 3 has nothing left to play for in November.

The strategy re-weights the same valuation. A rebuilding club counts the second
it is offered for more than a contender does, and counts the 30-year-old it
gives up for less. Both sides of a package are priced in the **evaluating**
club's terms — a single neutral valuation would make every club agree about
every deal, and then no deal would be interesting.

## The interest meter

Five bands, and every one of them says something. A band on its own is a score;
the reasons are what tell a manager which way to move, and they come from the
same evaluation that produced the band — a screen that said "contract too
expensive" when the refusal was about pick value would have lied about its own
reasoning.

Refusals that no package fixes are a **different kind of answer** from "not
enough value", and are shown differently. A manager who spends twenty minutes
adding picks to a deal that was never possible has been misled by the interface.

## Counteroffers

Only where one is honest. Below Fair the two sides are not talking about the
same deal, and a counter generated anyway is a negotiation the manager cannot
win dressed up as one they can.

What they ask for follows their own appetite rather than the gap alone: a
rebuilding club asks for a pick, a contender for a player, a club that cannot
fit the money for less of it. The asset named is the **smallest** thing on the
manager's side that closes the gap — a counter asking for a first-round pick to
close a gap of three is a club taking advantage of a screen that cannot say no.

## The deadline

`DEADLINE_SHARE` puts it about two thirds of the way through the regular
season; a franchise may name its own week. Everything else derives from it, and
the countdown appears on the Play and Office dashboards only once it is within a
few weeks — a countdown that runs all season is wallpaper and stops being read
long before it starts mattering.

Two earlier versions of the window were wrong in ways only a played season
showed, and both are recorded in `tradeWindow.ts`.

## The trade block

Listing a player tells the league he is available — and tells him. This is the
one event that **creates** a morale reading, because being shopped is precisely
the event that makes a player's mood knowable.

Morale is otherwise null, and deliberately thin. This league models ability,
contracts and availability; it does not model a player's home life, and a number
that moved for reasons the game cannot name would be a number pretending to know
things. Null reads as "nobody has asked", which is a different fact from "he is
fine".

## What the league does on its own

Computer-run clubs trade with each other every week, at a frequency set by the
franchise's trade difficulty and rising in the last weeks before the deadline.
They judge each other's offers through the same function that judges the
manager's — same margins, same reasons — which is the only way to be sure the
league is playing the game the manager is playing.

They also call about listed players: at most one caller a week, and only about a
position they actually need. A manager who lists a player and is buried in six
offers has been given a chore rather than a market.

The first version of this did nothing at all. The package builder took the
cheapest picks first and capped the package at three, so three late picks across
three drafts were offered for a player worth thirty and the function returned
nothing — every time, for every pair of clubs, all season. It also summed raw
values while the seller judges through the discounted package value, so a
package that cleared the bar by one arithmetic was short by the arithmetic that
decided.

## What a completed trade moves

Ten things, and the list lives in `tradeExecute.ts` because a trade that moves
eight of them looks finished from every screen a person opens:

1. the roster, and `players.team_id` that every read joins on
2. the depth chart — a traded player left on one is a player the week runner
   tries to field for a club he no longer plays for
3. the contract, moved rather than rewritten: a trade takes the deal over
4. both clubs' cap sheets
5. pick ownership
6. the engine's save document, which is the copy that actually picks the eleven
7. the transaction history
8. how he was acquired, on his roster row
9. the news, for the deals worth reporting
10. his morale

### The jersey

A traded player keeps his number only if it is free at his new club. Two clubs
each have a number 12, `team_rosters` carries a unique index on (club, number)
for active players, and a straight move failed outright the moment a trade
happened to collide — which is often.

The fix took three goes, and the third is the one worth keeping: **one**
function assigns a roster place and a legal number, and the waiver claim and the
free-agent signing go through it too. The second attempt fixed only the trade
path and the same collision surfaced from the waiver path a suite later. The
third also mirrors the number onto `players.jersey_number`, which is what the
offseason projection copies back at rollover — leaving it meant a traded player
carried his old number into the next projection and collided months later, in a
function that had nothing to do with trading.

## Not modelled

Trades involving cash, conditional picks, players to be named later, three-club
deals, and trading a player who is already on injured reserve (there is no
injured reserve). A trade cannot be agreed during the postseason or the
offseason phases: the offseason has its own trade route and its own rules, and
running both over one roster would be two systems disagreeing about who owns a
quarterback.
