# App Shell

The frontend skeleton: navigation, theme, and the component vocabulary every
screen is built from. Components first, data later — screens render their real
layout with skeleton placeholders until the data layer is wired.

```bash
npm run dev                 # the app
npm run dev                 # then open /dev/components for the gallery
npm run test:e2e            # overflow and navigation at five widths
```

## Bottom navigation

Five destinations: **Office, Team, Play, League, News**.

They are the jobs a manager has, not the screens that happened to exist:

| Tab | Its job | What is on it |
|---|---|---|
| Office | the executive one | finances, the front office, dynasty history, the franchise rules |
| Team | the football one | the franchise dashboard, then the roster, the depth chart, the schedule and offseason moves |
| Play | the week | the matchup, game prep, the one gold button, and the result it produced |
| League | the world outside | standings, leaders, the league schedule, the bracket, awards and records |
| News | what is being said | the whole feed, as the engine writes it |

### The franchise dashboard

Team is the first screen after the world is built, so it is a dashboard rather
than a team card. In order, it answers the questions somebody actually has on
opening it:

| Band | Question |
|---|---|
| Identity card | who am I — badge, city, name, the record as the one large figure, the roster timeline and the owner's mandate as pills, then division, roster, streak and cap space |
| Rating rings | what am I rated — overall, offense, defense, special teams, banded green / teal / plain / amber / red |
| Season tiles | how is the year going — points for, against, differential, turnover differential, league rank |
| This week | who do we play — opponent, home or away, their record and rating, how hard it looks |
| The owner | what was I hired to do — the mandate, who set it, and his patience |
| Checklist | what have I not done — roster, depth chart, cap, opponent, the game |

The club's two kit colours run across the top edge of the identity card and
wash faintly behind it, so opening the app looks different depending on who you
manage.

**One gold button.** *Sim week N* on the week card is the only primary action on
the page, because weekly management is the game. *Sim to end of season* is a
quiet button on the Play tab and is meant to look like the shortcut it is.

#### The checklist

Five items — roster, depth chart, cap, opponent, the game — in three states:

| State | Looks like | Means |
|---|---|---|
| Pending | hollow ring, muted | never opened |
| Opened | gold ring with a tick | tapped, and there was nothing more to finish |
| Done | filled teal disc | the thing it asked for actually happened |

Only two of the five can reach **Done**, and that is the honest part. Setting
the depth chart is marked finished beside the write that reorders it, so it
counts from wherever the reorder happened. Playing the game is completed by
`game_results` — the league's own rows — rather than by a flag written next to
them; two records of one fact are two records free to disagree. The other three
stop at Opened, because there is nothing there to finish yet, and a green tick
for having looked would be measuring the wrong thing on the first screen a
player sees.

**The marks live on the save** (`saves.checklist`, migration 0029), not in the
browser. A dynasty opened on a second device is the same dynasty, and a
checklist that resets is one nobody trusts twice. `mark-checklist` merges a
single mark in Postgres rather than replacing the document, so two taps in
quick succession cannot lose one another, and it never downgrades a finished
item — opening the depth chart again to look at it must not un-set it.

**Before the first game** the card is ringed in amber and shows all five. **After
it** the same card becomes *Weekly prep*: the count, and only what is still
outstanding. A manager ten seasons in should not be reading five ticked rows
every week.

**A row with nothing behind it opens a sheet.** Cap and opponent have no screen,
so tapping them raises a bottom sheet that says what will live there in the
words that screen will use — and the cap sheet carries the club's real cap
number, so the tap is worth making. A row that navigated to a screen rendering
nothing, or that quietly did nothing, are the two dishonest answers. *Play the
game* navigates nowhere at all: it scrolls the gold button into view and
focuses it, because the button is already on this screen.

### The Play tab

The weekly command centre, in the order a manager does the week:

1. **The matchup.** Both clubs either side of a label, each with its badge,
   name, record and the same three numbers — offense, defense, overall. The
   club you manage is always on the left whoever is at home; the label in the
   middle says which, and reads *Home* or *Away* with the opponent's name
   prefixed *vs* or *at*.
2. **Game prep.** Five cards: depth chart status (Ready / Incomplete / Not set),
   injuries out this week and how many of them start, gameplan, the opponent's
   overall and strongest unit, and the owner's mood beside the market's size.
   The gameplan card is dashed and badged *Not built yet*, because "Balanced"
   is not a setting anybody chose.
3. **One gold button**, then four quiet ones — game preview, depth chart,
   roster, fixtures.

**The button is the real thing.** It plays every club's week on the server and
writes the results, the standings, the statistics and the news. It is not a
placeholder and never was.

**It confirms first, but only when there is something to confirm.** A dialog
every week is a dialog nobody reads by October, so it is raised for two facts
that cost a Sunday — a position group with nobody named first, and a starter
who is out — and lists them, with Cancel and *Sim anyway*.

**Then it shows what changed.** The result modal carries the score, what kind
of result it was (an upset is an upset at any margin, read off the two overall
ratings), and the record, points for and points against the week just moved.
The screen behind it has already advanced to the next week; the modal is there
so nobody has to notice that for themselves.

Schedule and Roster were tabs of their own and neither was a destination: each
is a list, and it belongs inside the tab whose job it is part of. The roster is
opened from Team; the schedule from Team (your season) and from League (all
thirty-two). Weekly simulation moved to Play, which is why it sits in the
middle of the bar and carries a faint amber disc behind its icon — marked, not
enlarged, because a tab twice the size of its neighbours is a toy.

A tab's job is larger than what the game currently does. The parts that do not
exist yet — owner goals, job security, facilities, franchise direction,
contracts, injuries, the practice squad, the transaction log, the draft order —
are named on the tab that will carry them and drawn as `NotBuilt` cards:
dashed, dimmed, not buttons, and labelled "Not built yet". A placeholder that
looks like a feature is worse than an empty tab, because a player taps it,
nothing happens, and now they distrust the cards beside it that do work
(`src/screens/hubCards.tsx`).

Tapping a tab calls `replaceRoot`, never `push`. Per
`docs/NAVIGATION-CONTRACT.md`, tapping Team from four levels deep inside League
must not grow the stack forever, and a test asserts the back affordance
disappears when you do it.

Inside a drill-down the bar lights the tab at the *bottom of the stack*, not a
tab looked up from the screen on top: the schedule is opened from Team and from
League, and it belongs to whichever one opened it this time. That is what
`NavigationState.root` is for.

Active state carries three signals at once — amber tint, a filled icon, and the
rule above the tab — so it survives greyscale and colour-blindness rather than
resting on the amber alone.

## Theme

Night press box: cool slate ink, warm paper text, sideline amber.

| Role | Token | Value |
|---|---|---|
| Page | `--ink` | `#0F151B` |
| Panel | `--panel` | `#161F27` |
| Raised | `--raise` | `#1D2833` |
| Text | `--tx` | `#E8EEF4` |
| Muted | `--mut` | `#8698A8` |
| Accent | `--amber` | `#F0A830` |

Amber is the first-down marker: it marks the thing you are meant to look at.
When everything is amber, nothing is — so it appears on the active tab, the
selected chip, and the tick beside a section heading, and almost nowhere else.

Amber is **marked with, not filled with**. The primary `ActionButton` is the one
amber fill in the product; a selected chip, a lit table row and a salary-cap
meter carry amber as a border, a tint or a rule. A second amber fill anywhere
takes the meaning away from the button.

**Barlow Condensed** carries display text, headings and figures; **Inter**
carries body copy. Both are SIL Open Font License, which permits commercial
embedding (`docs/IP-POLICY.md`). Figures use `font-variant-numeric: tabular-nums`
so a column of scores does not dance as it updates.

## Form

The palette above came from the prototype and is canonical — no hex in
`tokens.css` may be changed. Everything below is the layer the prototype never
had, added on top: one scale each, so a screen cannot invent a fourth radius or
a seventh grey gap by accident. Both files carry the same values,
`tokens.css` for CSS and `tokens.ts` for TypeScript.

| Scale | Steps | For |
|---|---|---|
| Radius `R` | 6 / 10 / 16 / pill | a chip, a card, a hero, a control |
| Elevation `ELEV` | flat / low / mid / high | how far a surface sits above the one behind |
| Space `S` | 4 8 12 16 20 24 32 40 | every gap and pad |
| Type `TYPE` | display / heading / micro / body / prose / figure | six roles, two faces |
| Motion `MOTION` | 110ms / 200ms, one curve | press feedback, never animation |

Navigating cross-fades the new screen in over 220ms (`.screen-in` in
`base.css`). A fade and not a rise: a rise needs a transform, a transformed
ancestor becomes the containing block for `position: fixed` children, and that
would tear the main menu's full-bleed backdrop off the viewport for the length
of the animation. The reduced-motion block collapses it to nothing.

A dark interface cannot lift a surface with a drop shadow alone — black on
near-black is invisible — so each elevation step pairs a shadow below with a
one-pixel highlight along the top edge. That highlight is what actually reads as
"lit from above", and it is why `Panel` states a **tone**: `sunken` is a well
things are listed in, `base` is the default card, `raised` is the one thing on
the screen that is the point of the screen.

### Team colour

Thirty-two teams ship two colours each, and for a long time those colours lived
only in a 34px badge — the one place they cannot do any work. `tint(hex, alpha)`
lays a kit colour over the app's own ink at low alpha, which is what makes it
usable behind text: a colour chosen to shout on a helmet has to whisper under a
headline. `colourWash(primary, secondary)` is the one expression built on it,
so a franchise looks the same wherever it appears: the team hero, a save-file
card, a player's profile. Badges stay generated in code from those two colours
and the abbreviation, never shipped as art (`docs/IP-POLICY.md`).

### Figures

A figure leads and its label sits under it, which is the opposite of a form
field and the right way round for a scoreboard: the eye lands on `302.0M` and
only then asks what it is. `StatTiles` steps the figure down as the value gets
longer, because a truncated number is worse than a smaller one — `302.…` is not
a salary cap. A tile may carry a `fill` and draws it as a hairline amber meter,
because a cap number means much more next to how much of it is spent.

## 375px, and no horizontal scroll

The content column caps at 520px and centres on anything wider, so a desktop
browser shows a composed narrow column rather than a phone layout stretched
across a monitor. The floor is 320px.

The page never scrolls sideways. Controls that would otherwise force it — a
nineteen-chip week selector, a thirteen-chip position filter, a standings table —
scroll **inside themselves**, in a container marked `.tscroll`. That marker is
what lets the dev-mode overflow guard and the end-to-end assertion tell an
intentional scroller from a broken layout.

Every screen is asserted at 320, 375, 390, 768 and 1280.

## Skeletons, not spinners

A spinner says "something is happening". A skeleton says "this is what is
coming, and roughly how much of it", so the screen does not reflow into a
different shape when data lands.

Each skeleton mirrors the component it stands in for — `SkeletonRows` uses the
same 52px rhythm as `ListRow`, `SkeletonTiles` the same grid as `StatTiles` —
which is the only way that promise holds. Placeholder widths vary slightly down
a list so a column of them reads as text rather than as a barcode.

Accessibility: every placeholder is `aria-hidden`, and they sit inside a
`SkeletonRegion` marked `aria-busy` with a label. A screen reader hears
"loading roster" once, not a description of two dozen grey rectangles. The
shimmer is removed under `prefers-reduced-motion`.

## The words on the screen

This is an American football front office, and the interface says so. The
vocabulary is fixed, because a screen that says "club" next to one that says
"team" reads as two products:

| Say | Not |
|---|---|
| team, franchise | club, side |
| roster, depth chart | squad |
| game | fixture, match |
| standings | the table |
| offense, defense | offence, defence |
| vs | v |
| GM, front office, coaching staff | manager, boss |

**Team** is a specific team; **franchise** is the organisation across years --
"The front office" heads the Office section that leads to the record book and
the staff, while a standings column is headed "Team". League, Conference, Division,
Roster, Schedule, Staff, Office, Play, News, Standings, Salary Cap, Depth Chart,
Playoffs, Franchise Rules and Dynasty History are the screen names and stay
exactly as they are.

Internal names are not part of this. The `clubs` route, the `Club` type and
`clubsById` predate the rule and are invisible; renaming them would touch the
API surface and the play-test rig to change nothing anyone reads. What is on
screen is what this section governs.

## Getting in, and the boot flow

Four screens sit outside the game: Home, the save files, the GM name and the
team list. They are marked `boot` in the screen registry, which buys them two
things. The bottom navigation does not render on them -- there is nothing to
navigate to until a dynasty is open, and a bar of dead tabs under the main menu
would be five promises the app cannot keep. And `rootFor` sends them back to
Home rather than to Team, so Back from the team list lands on the menu instead
of on a dashboard with no dynasty behind it.

The stack is built once the app knows which save is open, not before: a frame
pushed on a guess would leave a Back button pointing at a screen nobody visited.
One effect, `OpenSaveRouter`, keeps the two in step afterwards -- opening a save
leaves the boot flow, closing one returns to it -- so nothing that opens,
creates or closes a save has to know the rule.

The three answers a new game needs travel as navigation params, which is what
makes Back work across them for free: leave the team list, come back, and the
save file and the GM name are still on the frame.

Home is the one screen that drops the app bar (`Screen`'s `bare`): it carries
the product lockup itself, and printing the name twice on the front door is the
kind of detail that makes an interface look assembled. Its backdrop is drawn
rather than shipped as art — yard lines and a pool of warm light — so there is
no photograph of anywhere real and no mark belonging to anyone
(`docs/IP-POLICY.md`), and the file stays a few lines of CSS.

The door reads top to bottom in three bands: an empty top, the name and the two
doors in the middle, and housekeeping along the foot. **New Franchise** is the
only gold fill on the screen — 58px tall, a three-stop gradient and a lifted
shadow; **Load Franchise** is a dark card with a blue-grey hairline, so one is
obviously the thing to press and the other is obviously still a door. Under
them, three quiet actions — Settings, Database Tools, Credits — in muted grey
at 10.5px with thin icons, and the build number pinned in the bottom-right
corner. They are furniture, not choices, and are styled so they cannot be
mistaken for either door.

Every one of the five goes somewhere: `settings`, `dbtools` and `credits` are
registered boot screens like the rest of the flow, so they render without a tab
bar and Back from any of them lands on the menu. Settings and Credits are the
same components in both builds; Database Tools is not, because the two builds
keep a dynasty in different places and each reports its own truth — the app
names the API and the open save, the rig names this browser and its three
files. Neither invents a fact it does not have, and Settings shows no switches,
because a control that does nothing is worse than an empty screen.

The door respects both safe areas: the title never sits under a status bar and
the foot never sits under a home indicator, and it measures itself in `dvh`
rather than `vh` so an iOS address bar cannot push the foot off the screen.
`Shell` stops reserving the tab bar's 60px on boot screens, which is what lets
the foot reach the bottom at all.

### The save files

One screen, two errands, told apart by the mode it was pushed with.

| | New Franchise | Load Franchise |
|---|---|---|
| Subtitle | Choose save file | Save files |
| An empty file | gold, `Empty · start here`, chevroned, opens the GM screen | dimmed, `Empty`, and a tap says *No franchise exists in this file.* |
| A filled file | shown, not tappable | the thing to tap; opens the dynasty |

An empty file in load mode is dimmed but is **not** `disabled`, and carries no
`aria-disabled`: both announce a control that cannot be used, and this one can
— tapping it is how the screen gets to say why the file is no use for loading.
A button that calls itself disabled and then answers a tap tells two stories.

A filled card carries the franchise's colours and everything worth knowing
before opening it: the file and when it was last saved along the top, the
badge, team and GM in the middle, and season, record, cap space and titles in a
strip along the foot. The strip is a wrapping flex row, not four columns —
"2026 · Week 4" is three times the width of "0", and equal columns truncate the
season to buy the trophy count room it has no use for. At 320px it wraps to two
lines rather than clipping.

The file's own name shows on the top line only once it differs from the GM's
name, because that is what it is created as: printing it unrenamed would say
the same thing twice.

**Rename** and **Delete** live behind the three dots on a filled card, and both
open a dialog naming the file. Rename prefills with the current name; Delete is
titled *Delete Franchise?* with a red confirm, and clears that slot only. The
name is the one thing about a dynasty the client may set — the season, the
record and the cap are the engine's to say — which is why `rename-save` is the
only write handler that takes a free-text string, and why it resolves the save
through `ownedSave` before touching it.

An occupied save file wears its franchise's colours and an empty one is drawn
as a dashed outline, so which of the three files is free reads before any of
the words do.

### Create GM

Two names, a preview of what they add up to, and one optional question.

The preview updates as you type and states only what it can: before a name,
*GM Preview* and *Name not entered yet* — no role, no record, no empty circle
pretending to be an avatar. Once both names are there, the monogram appears and
the card fills in with the facts that are true of a manager who has not worked
a day: **General Manager**, reputation *Unknown*, career record *0-0*, legacy
*Not started*, and the file he is being created in. Rendered outside the flow
with no file chosen it says *Not chosen* rather than printing File 1.

**GM style** is the optional question — Architect, Talent Scout, Negotiator,
Culture Builder, Strategist — stacked rather than scrolled sideways, because
five options with a line of explanation each do not fit across a 320px phone
and a swiped row hides the last two behind an edge. It opens on Architect. The
card says on itself that the simulation does not read it yet, because the
alternative is a player choosing Negotiator and spending a season wondering why
nothing negotiates differently.

Continue stays `disabled` until both names are filled, and a refused attempt
still says why: submitting the form (the keyboard's Go, which is how a phone
finishes a form) runs the same check, and a transparent catcher sits over the
disabled button so a tap lands somewhere that can answer. Each field then
carries its own message — *Enter a first name.* under the one that is empty,
not one complaint about both. Nothing reddens until the player says they are
done, and focus clears a field's complaint: a form that shouts while you are
still typing is telling you off for not having finished.

The whole form is `src/screens/gmForm.tsx`, imported by the play-test rig, for
the same reason the front door and the name field are: four screens stand
between the app icon and a dynasty, and four screens are easy to let drift.

### Select Team, and the scouting board

Thirty-two rows is a list; thirty-two rows you are choosing between is a board.
The search matches word by word across city, nickname, full name, abbreviation,
conference id and name, and both division forms, so "iron north" lands and
"AC-N" lands. Nine chips sit under it in a `ChipRow`, which scrolls inside
itself -- nine chips do not fit across a phone, and the fix is never to let the
document scroll.

Where the work is split matters. The **search** runs on the client, on strings
it already has, so it filters as fast as the player types. The **chips** filter
on tags the server attached, because every one of them is a statement about the
league rather than about a club: "the eight with the most cap space" is not a
fact any one club knows about itself, and computing it in the browser would be
a simulation outcome decided in frontend code. `teamShape.ts` holds the keys
and the rules; `teamFilters.ts` holds the labels; a test asserts the two lists
name the same eight tags.

Under the chips, one line says what the chip actually selected and how many it
left. A filter whose rule is a secret is a filter the player reverse-engineers
from its results.

A row carries the badge, the market in small caps above the nickname, the
league placing spelled out, the roster rating, and a difficulty pill coloured
by what it is telling you to expect -- amber for Dynasty Ready, teal for
Playoff Push, blue for a rebuild, red for Cap Hell. Rows divide with a hairline
and lift on press; the last row drops its divider rather than ending the panel
on a line that separates nothing from nothing.

Every number on the board is measured by `team-profiles` from the template
world (docs/SAVES.md records where each comes from). Fan pressure is the one
field the screen names and cannot fill: nothing in the world models a crowd
yet, so it is null on every club and the preview says *Not modelled yet* --
which is a different sentence from *Not recorded*, and the screen makes both.

### Team Preview

Four sections, in the order a front office reads a scouting report: who they
are, how good they are, what they can spend, and what the football problem is.
The last line is the first thing to do about it, which is the point of the four
sections above it.

The identity card is the one place a franchise gets to look like a franchise —
its two kit colours washed across the card, its badge at a size you can see, and
a three-pixel accent rule drawn from the same two colours, which is the only
place on the screen a kit colour is used at full strength. The difficulty sits
under the name at heading size, because it is the single fact this whole screen
exists to deliver.

Ratings are rings. The arc carries the value and the colour carries the band —
teal elite, green strong, neutral solid, amber developing, red weak. Two
channels for one fact: the arc still reads in greyscale, and on a phone the
colour reads before the digits do. The bands are the server's (`teamOutlook.ts`);
the screen decides only what elite *looks* like, never what counts as elite.

Every phrase on it is a pure function of measurements and returns nothing when
the measurement is missing — a club whose numbers could not be read gets **no**
suggested first move rather than a generic one, because a generic instruction on
a decade-long decision is the screen guessing.

The screen has three states beyond the report: skeletons in the same three
shapes so nothing reflows when the board lands, a `QueryError` when the read
fails, and a **Team Not Found** panel — dark, titled, with a way back — when the
board answers but has no club with that id. Reported rather than blanked: the id
came from somewhere, and "we cannot find it" is the useful thing to say.

**Choose This Team** records the club in the draft and goes to Franchise
Settings; it writes nothing. **Back to Teams** returns to the board with the
search and the chips as they were, which is why those two live on the
navigation frame through `useUiState` rather than inside `SelectTeamBoard` —
state held in the component dies the moment the player taps a club.

### Franchise Settings

The last screen of the flow and the only one that writes. It reads back the
file, the GM, the style and the club, then states what `create-save` is about to
do — opens at week 1, thirty-two clubs, a seed generated on the server — each of
which is something the handler actually does on the next tap.

It is called Settings because that is what it will be. It holds none today: a
difficulty, a season length or a simulation speed would each be a control with
nothing behind it, and the rule about not inventing data applies just as squarely
to inventing a knob.

While the world is being cloned both buttons are closed and the primary says what
it is doing. Leaving mid-create would strand a save halfway through 25,000 rows.

### Franchise Settings

A summary card, a difficulty card, and eight rows.

The **presets lock the rows**. Easy, Normal and Hard each write all eight and
disable them; Custom re-enables them. Shown-but-locked rather than hidden: a
preset is a statement about all eight, and a player who picks Hard should be
able to read what Hard did. The difficulty follows the rows in the other
direction too — change a row under Custom and the label becomes Custom; set the
rows back to a preset's values and it becomes that preset again, because eight
rows that equal Hard *are* Hard.

The segmented control wraps rather than scrolls: four labels as long as "Hidden
Potential" do not fit across 320px, and a control the player must swipe hides
options behind an edge. The chosen segment is *filled*, not outlined — unlike a
chip row, where several may be on, exactly one of these is true at all times, so
a fill reads as state where an outline reads as availability.

**Commissioner Mode is the one row that asks.** Turning it on opens a dialog —
*Enable Commissioner Mode?* — because it unlocks tools that can rewrite a save,
and a tap that far-reaching should take two. Cancelling leaves it off. Once on,
an amber badge follows the franchise onto this screen's summary card and onto
the confirmation.

At the foot, one line: **the simulation does not read any of this yet.** Once,
in one place, rather than eight apologies on eight rows. Eight controls that
promise specific behaviour would be worse than no controls if nothing behind
them were true and the screen said nothing — this is the same argument that put
`gm_style` on the saves table, with the stakes raised, because "injuries are
lighter" is a much more specific claim than "Architect".

`SetupBar` runs along the foot: sticky rather than fixed, inside the content
column rather than across the viewport so it never overhangs a wider layout, and
carrying the home indicator's safe area — a Continue button under the bar on an
iPhone is a Continue button nobody can press.

### Confirm Franchise

Four review cards — Save File and GM, Team Selection, League Setup, Rules and
Settings — and one gold button.

The **League Setup** card is counted, not stated. Thirty-two clubs, two
conferences, eight divisions, an eighteen-week regular season and 448 draft
picks are facts about the template world, read by `leagueShape()` in one query;
a screen that printed them as constants would be wrong the day a seed with
thirty-four clubs ships, and a season with no schedule reads *Not recorded*
rather than promising eighteen weeks nobody wrote.

The save name defaults to the club's — *Cleveland Ironmen Franchise*, falling
back to the nickname where the full name would exceed `MAX_SAVE_NAME`, which is
the same ceiling `rename-save` enforces so the screen that sets a name and the
screen that changes it later agree. `saveName` is `null` until the player types:
null means "use the club's", empty means they cleared it and the button closes.

**Creating happens once.** The guard is a `useRef`, not the busy flag — busy is
React state and lands a render later, so a second press inside that window would
ask for a second franchise in the same file. The unique index on
`(user_id, slot)` would refuse it, but "refused by a constraint" is not a thing
a player should ever see.

**A failure leaves nothing behind**, and that is the server's guarantee rather
than the screen's: `create-save` runs in one transaction, so the screen can
honestly say the file is still empty. `tests/api/createOnce` proves it by
failing three ways into one slot and then creating in it.

The draft is cleared in `OpenSaveRouter`, where a save actually opens — not
beside the call that created it. Clearing it there threw away every answer on a
failure as well as on a success.

**Change Team** uses `nav.backTo('teamPreview')`, a new navigator primitive:
back to a named screen further down the stack in one `history.go`. Pushing would
stack a second Select Team whose search and chips start empty, and calling
`back()` twice races the history it delegates to.

### Building Franchise World

The screen that runs `create-save` and shows what it built. Ten steps over a
backdrop made from the club's own two colours — two soft floodlight pools and a
faint grid, laid over the app's ink rather than used neat.

**The honesty problem, and how it is answered.** A ten-step checklist ticking
through a build is the most tempting thing in this product to fake, because the
build is a single opaque transaction. Rows written inside an uncommitted
transaction are invisible to every other connection: there is nothing to poll,
and nothing to stream without giving up the atomicity that lets a failure leave
the save file empty. So the steps are **reported, not narrated**. `createSave`
records what each phase produced — counted off the rows it wrote, in the same
transaction that wrote them — and returns the manifest when the franchise
commits. The screen renders all ten from the first frame, checks nothing off
until the server has spoken, and then reveals them with their real counts.
`tests/api/buildSteps` compares every reported figure against a fresh count of
the rows.

The note at the foot says all of this in two sentences, because a checklist that
animated to a timer would be a progress bar with no progress behind it, and the
player deserves to know which kind they are looking at.

A step with nothing to count says *Ready* rather than `0` — the news feed starts
empty and fills as the season is played, and opening the front office is work
rather than rows, so a `1` there would be a number pretending to be a
measurement.

**Failure names the step.** `runStep()` wraps each phase and rethrows a
`BuildStepError` carrying the step key; `dispatch` turns that into an `ApiError`
with a `step` field, both transports serialise it, and `ApiRequestError` exposes
it. So the card can say *Generating schedule failed* rather than printing a
message and hoping. A request refused before the build began — a taken slot, a
settings document the server could not read — names no step, and the card says
*The franchise was not created* instead of pointing at the wrong thing.

**Retry, not "retry this step".** One transaction means there is no half-built
world to resume from. The button re-runs the whole creation, which is the only
thing it could honestly do.

`OpenSaveRouter` exempts this screen by name. It is the one boot screen allowed
to have a save open — it is the screen that just created it — and without the
exemption the router would replace the root the instant the transaction
committed, so nobody would ever see what was built.

### The franchise being set up

Create GM and Select Team are two questions about one thing that does not exist
yet, so the answers collect in `src/app/FranchiseSetup.tsx` — a draft holding
the file, the two names and the style — which sits **above** the navigation
stack. Held on a frame it would die the moment the player walked to the next
question; held here, walking back shows what was typed.

It is in memory and nowhere else. A reload with no save open lands on the front
door, and half an answered franchise restored behind a screen the player is no
longer on would be a worse lie than asking twice. The draft is cleared when the
dynasty is created from it, and again whenever the player is standing on the
front door.

The club joins the draft when it is tapped on the board, and the eight rules
join it on Franchise Settings. That is what lets Back come out of any of these
screens onto the one before with everything intact — the GM, the search, the
chips, the rules. `create-save` is called once, from Confirm Franchise, with
everything the draft gathered.

## Navigation state

A frame stores three things: screen identity, params, and UI state including
scroll offset. `back()` restores all three.

Screens register filters and sort order through `useUiState` rather than
`useState`. That is the whole mechanism: state held in component state dies with
the unmounted screen; state held on the frame does not. Two frames of the same
screen keep their UI state independently.

Sorting is one shared control, `SortControl`, and it is never a tappable column
header: on a phone a standings column is thirty pixels wide, a precise tap is
hard, and a header that sorts one table while it navigates on another teaches
the reader nothing reliable. The control takes fields with labels and reports
the selection; the screen does the sorting. Direction is one separate tap, and
a field may declare itself `fixed` when it has no direction to reverse -- the
league's own standing being the case that matters.

The stack is split across two contexts. `Navigator` holds the imperative methods
and is stable for the life of the provider; `NavigationState` holds the current
frame and changes on every push, pop and filter tap. A component reading only
the methods does not re-render when a chip is tapped three screens down, and a
component reading the state re-renders when it must — which a value held in a
ref never would.

**The browser is the single authority on going back.** `back()` calls
`history.back()` and lets `popstate` do the popping, so the hardware button, the
edge swipe and the in-app affordance all take one path. Two paths would
desynchronise the moment someone pressed both quickly.

URLs are a projection of the stack, never its source. Filters and sort order stay
out of them. A cold URL naming a drill-down opens it on top of its root so the
back affordance leads somewhere rather than off the end of the stack — and the
root is resolved per screen, since assuming a single root would stack a link to
`/league` on top of Team.

## Screen registry

`src/app/screens.ts` maps every screen key to a component. `legacy/UI.md` records
a static flow test asserting that every navigation target resolves to a real
screen; a target with nothing behind it is a dead end that only surfaces when
someone taps it, so tests assert that every `resolveEntityRoute` target and every
tab has a screen, and that every drill-down resolves to a real root.

An unregistered screen renders a message naming the key and the file to add it
to. It does not render something plausible — `ARCHITECTURE.md` rule 3 applies to
routes as much as to data.

## Not wired yet

No data. Screens render skeletons and say so. `EmptyState` and `DataBoundary`
are deliberately different: empty is a fact, unavailable is a defect, and they
must not look alike.

Marks are generated from two colours and an abbreviation rather than loaded as
artwork, and icons are drawn in `src/components/icons.tsx` rather than pulled
from a set — both so `docs/IP-POLICY.md` is satisfied by construction rather
than by a licence audit later.
