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

Five destinations: **Team, League, Schedule, Roster, Office**.

Tapping a tab calls `replaceRoot`, never `push`. Per
`docs/NAVIGATION-CONTRACT.md`, tapping Team from four levels deep inside League
must not grow the stack forever, and a test asserts the back affordance
disappears when you do it.

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

**Barlow Condensed** carries display text, headings and figures; **Inter**
carries body copy. Both are SIL Open Font License, which permits commercial
embedding (`docs/IP-POLICY.md`). Figures use `font-variant-numeric: tabular-nums`
so a column of scores does not dance as it updates.

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
"The franchise" heads the Office section that leads to the record book and the
staff, while a standings column is headed "Team". League, Conference, Division,
Roster, Schedule, Staff, Office, Standings, Salary Cap, Depth Chart, Playoffs
and Dynasty History are the screen names and stay exactly as they are.

Internal names are not part of this. The `clubs` route, the `Club` type and
`clubsById` predate the rule and are invisible; renaming them would touch the
API surface and the play-test rig to change nothing anyone reads. What is on
screen is what this section governs.

## Getting in, and the boot flow

Four screens sit outside the game: Home, the save files, the GM name and the
club list. They are marked `boot` in the screen registry, which buys them two
things. The bottom navigation does not render on them -- there is nothing to
navigate to until a dynasty is open, and a bar of dead tabs under the main menu
would be five promises the app cannot keep. And `rootFor` sends them back to
Home rather than to Team, so Back from the club list lands on the menu instead
of on a dashboard with no dynasty behind it.

The stack is built once the app knows which save is open, not before: a frame
pushed on a guess would leave a Back button pointing at a screen nobody visited.
One effect, `OpenSaveRouter`, keeps the two in step afterwards -- opening a save
leaves the boot flow, closing one returns to it -- so nothing that opens,
creates or closes a save has to know the rule.

The three answers a new game needs travel as navigation params, which is what
makes Back work across them for free: leave the club list, come back, and the
save file and the GM name are still on the frame.

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
