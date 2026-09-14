# The waiver wire and the in-season market

The market does not shut when the season starts. A player released in week 6
goes somewhere, a club that loses a starter can replace him, and every move is
recorded where the league can read it. This is how that works.

## The hole this closed

`cutPlayer` had decided, correctly, since training camp was built: a player with
fewer than four accrued seasons is subject to waivers, and one with four or more
is a free agent the moment he is let go. It had nowhere to send the first kind.
A waived player came off the roster, off the depth chart, out of `players.team_id`
— and out of the game. Nothing held him and nothing said so.

## The wire

`waiver_wire` holds who is on it, who let him go, and when the window shuts.
`waiver_claims` holds who wants him and — the column the whole system turns on —
the priority that club held **when it claimed**.

That last point is the one rule worth stating twice. Priority moves when a claim
is awarded. A club that claimed on Tuesday from third must not be overtaken on
Thursday by a result it had nothing to do with, so a claim is settled from
`priority_at_claim` and nothing re-reads the queue at resolution.

### The queue

`waiverOrder()` is reverse order of standing: the club that has won least
chooses first, so the wire works against the table rather than with it. Early in
a season the table cannot carry that weight — three clubs at 1-0 are not ranked
by anything — so until every club has played `STANDINGS_MINIMUM_GAMES` the
previous season's finish decides, in reverse. A league in its first season has
neither, and the order falls back to something stable and visibly arbitrary
rather than to a guess.

A club awarded a player goes to the back (`reorderAfterAward`). That is why
priority is a stored column rather than a query: the table has not changed and
the order has.

### The window

`WAIVER_WINDOW_WEEKS` is the configurable deadline and everything else is derived
from it. A player posted in week 6 is claimable through weeks 6 and 7, and the
window is settled at the top of week 8 — so a claimed player plays that week.

Two earlier versions of this were wrong in ways only a played season showed:

- Settling *after* the deadline week left a player cut in week 5 unusable for two
  Sundays. Nobody would claim a player on those terms.
- A one-week window emptied the wire between screens. There was nothing to read,
  only something to catch.

### Resolution

At the top of each week, inside the week's transaction, every window whose
deadline has passed is settled. The best priority among the clubs that can
actually take him — roster place and cap room, checked at resolution rather than
at claim time — wins. A club that had room on Tuesday and filled it on Thursday
is passed over and does not block the clubs behind it. A player nobody eligible
claimed enters the free-agent pool.

Losing claimants are told, and told which of the two things happened: a claim
that lost on priority lost fairly, and a claim passed over for want of a roster
place is a different mistake the manager could have avoided.

## The pool

`free_agents` already existed and the offseason market already read it. What it
had never been was persistent — written at rollover, drained in March, ignored
until the next one. A player now enters when he is released with four accrued
seasons or when the wire clears him, and leaves when he signs, and for no other
reason.

He is priced from the engine's own record of him (`marketValue`), read out of the
save document, rather than from a share of his last contract. The old way
compounds: a club that overpaid a player once would find him cheap forever after.

## What a player wants

`inSeasonMarket.ts` reuses the offseason's model rather than writing a second
one. Two market models would mean a player signing for different numbers in
March and October for no reason anybody could name. The engine's seven
personalities still weigh money, contention, playing time, loyalty and standing.

Two things genuinely differ in November and only those two are changed:

- **There is no auction.** In March a player hears from six clubs and picks; in
  November he has one offer in front of him and answers it. So money is measured
  against what he is asking rather than against a rival bid, and the question is
  a threshold rather than a comparison.
- **The season is half gone.** A year signed in week 12 is ten weeks of work, and
  `inSeasonAsk` prices it that way — not linearly, because a club signing in
  December is buying a playoff run as much as a salary, and never below the
  veteran minimum.

Older veterans take short deals; young players want the years, because years are
what they have to sell. A good player will not join a club going nowhere at the
going rate — stated as a penalty money can pay off rather than a refusal, since a
flat refusal would leave half the league unable to sign anybody worth signing.

### Accept, refuse, counter

Above `ACCEPT_THRESHOLD` he signs. Below `COUNTER_THRESHOLD` he refuses. Between,
he counters — and `closingAav()` **solves** for the salary that reaches the
threshold rather than nudging at it.

That was the first version's real defect. The counter used to be the offer plus a
percentage scaled to how far short it fell, which is fine when the gap is money
and useless when it is not: a player who wants a ring, offered his exact asking
price by a club out of the race, was handed a number, given it, and counter-offered
again. A manager could not tell that from a refusal except by playing it out.

Where the money term is already at its ceiling and the threshold is still out of
reach, there is no such salary, and the answer is no — with a reason that says
which wall was hit, because "he wants more" and "he does not want you" call for
completely different moves.

## The computer-run clubs

A club works the market when it is short of bodies. It does not troll the pool
for upgrades every week: a league where thirty-one clubs sign the best available
player every Tuesday would churn a third of its rosters by December.

The first version fired on positional emergencies only, and so fired **once**, in
week two, for five clubs, and never again. Every club in this league carries
exactly 53 men, so rosters were full, needs were mild, and thirty-one clubs sat
out the season. They had not decided against signing anybody; they were never
asked.

What actually drives in-season signings is the treatment room. A club with
`SHORTHANDED_BY` or more men unavailable is playing forty-nine, and it signs
somebody — releasing its most expendable player first if it is at the limit,
through the same release path a managed club uses. One release path, not two:
a second one would be a second way for a player to vanish, which is the exact
defect this feature exists to fix, reintroduced by the clubs nobody watches.

Who they go after is the request's own rule and lives in `replacementScore()`: a
contender replaces a starter with somebody who has done it before; a club going
nowhere would rather find out what a 24-year-old is. Both rank the same pool.

Their round runs **after** the save has moved on to the next week. Running it
before posted every computer-run club's cuts under the week that had just
finished, so their windows were shut by the time anybody could see them — the
wire filled up and emptied between screens, and no claim was ever possible.

## The half nobody can see

Every move writes twice: to the relational tables, and to the engine's save
document (`engineRoster.ts`).

This is the part that is easy to forget and impossible to notice. Every screen
reads the tables, so a signing that wrote `team_rosters`, a contract and a cap
sheet looked correct from every direction a person can look. But the week runner
does not build its teams from those tables — it builds them from the document,
and the projection runs the other way, document to tables, at every rollover.

A signing that only wrote rows therefore had two silent consequences. The player
never took a snap, because the eleven men on the field came from a document that
still had him unattached. And at the next rollover the projection overwrote his
roster row from that same document, so the move undid itself in March and nothing
anywhere said it had.

Dead money is charged to both for the same reason: a charge written only to the
relational cap sheet expires at the rollover, which is the most convenient
possible bug.

## The record, and the news

Every move writes a `transactions` row — complete, dull, queryable — which is
what the Transactions screen reads. Only some of them are news: a move involving
the club being managed, or a player good enough (`NOTABLE_OVERALL`) that it would
be reported anywhere. A feed carrying all thirty-two clubs' depth signings would
bury the week's football under it.

The News tab's Transactions chip had said "trades, signings and releases are not
written to the feed yet" since it was built. It now has a feed behind it.

## Not modelled

Injured reserve, practice-squad elevations, trades during the season, the trade
deadline itself, and waiver priority variants that reset at a fixed week. A club
therefore carries its injured players against the 53, which is why the
shorthanded trigger counts unavailable men directly.
