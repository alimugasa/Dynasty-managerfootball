# Interface Architecture

`ui/index.html` — a working, self-contained mobile app shell running on **real
simulation data**: 284 player profiles, 6 seasons of history, live award ballots,
grade leaderboards, and the record book, all exported from the engine.

Open it in a phone browser or a desktop browser narrowed to ~390px.

---

## The audit section 96 asked for

There was no existing application. No routes, no components, no state management, no
player pages, no breakpoints. What existed was the CSV database and the Python engine.
The React prompt library from the earliest session was never executed.

That's the useful finding: **nothing needed migrating**, and the requirements that are
expensive to retrofit — navigation state preservation, universal entity routing, the
back stack — are cheap when they're the first thing built. They are the foundation
here rather than a later refactor.

---

## Visual direction

The look is a night press box: cool slate ink rather than pure black, warm paper-white
text, and one accent borrowed from the sport itself — the amber of the first-down
marker, used for actions and ability. Type pairs **Barlow Condensed** (a scoreboard
face, used for numbers and screen titles) with **Inter** for body and tabular data.

**The signature is the ability/performance distinction.** Section 91 requires OVR and
grade to never look alike, so they use different geometry, not different colours:

- **Ability** is a circular dial with an amber arc — a gauge, something that fills.
- **Performance** is a rectangular chip with a coloured left edge on a six-stop ramp
  (violet elite → teal → green → amber → orange → red).

You can tell at a glance which number you're reading without decoding a legend, and it
survives colour-blindness because the shapes differ.

---

## Navigation

Five destinations with a raised, contextual centre control:

```
HOME    TEAM    [▶]    LEAGUE    INBOX
```

The advance button's label changes with the calendar phase and only interrupts when
something genuinely blocks progress — a missing starting quarterback, a roster
violation. Otherwise it's one tap.

**The navigation stack is the part that matters.** Each frame stores its screen, its
params, *and its UI state* — active tab, filter chips, sort order, scroll position.
`back()` pops and restores all of it. So League → Grades → filter to CB → open a player
→ back returns to the CB filter at the same scroll offset, which is section 39 and 60's
requirement and the thing most implementations get wrong.

Universal entity openers mean a player is the same player everywhere: `openPlayer(id)`
from a roster row, a grade leaderboard, an MVP ballot, an All-Pro team, or a news
headline all land on one profile.

## Verified

A static flow test checks every navigation target resolves to a real screen and every
entity reference resolves to a real profile:

```
screens defined: 17   nav targets: 8   MISSING SCREENS: none
entity links checked: 503             BROKEN LINKS: none
profiles with duplicate season+comp rows: 0
```

That last line matters: it confirms the regular-season/playoff split survives the trip
from database to interface. The `REGULAR SEASON | PLAYOFFS` control is one component
used identically on player stats, player grades, team stats, league grades, and the
record book.

---

## What's real vs. stubbed

**Real, wired to data:** Home dashboard, roster with four sort modes, depth chart,
team stats, player profile (Overview / Stats / Grades / Career / Honours), standings
at three scopes, grade leaderboards by position, award winners, full MVP ballots with
vote bars, All-Pro, All-Star, record book, league history by season, search across all
284 players including retired ones, and news headlines that are tappable navigation.

**Honest stubs** — screens that say so rather than faking depth (section 83): trade
centre, free agency, draft, transactions, staff, settings. The cap screen shows
placeholder figures and says so; the contract engine exists but isn't wired to it.

---

## Known gaps

- **Not tested in a real browser.** I have no rendering environment here, so layout is
  verified by static analysis only — no fixed widths above the 520px shell cap, tables
  scroll inside `.tscroll` containers rather than the page. Check it at 320px yourself
  before trusting it.
- **Search re-focuses the input on each keystroke** via a `setTimeout` hack, because
  the whole view re-renders on state change. It works but it's the wrong pattern; the
  input should be uncontrolled or the render should be incremental.
- **Depth chart reordering isn't implemented** — tapping opens the profile instead of
  swapping.
- **One HTML file.** For production this needs the component split section 90
  describes. The design tokens are already centralised in `:root`, so that's mostly
  mechanical.
