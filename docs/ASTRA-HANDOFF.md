# Handoff

Everything a senior engineer or a new coding environment needs to inherit this
project without the conversation that produced it. Written to be read top to
bottom once, then used as a reference.

Nothing in this document is aspirational. Where a system is half-built it says
so, and where something is a known defect it is named and located.

---

## 1. Project overview

**Dynasty Manager Pro** is a mobile-first American football franchise
management game. The player is a general manager, not a coach: they take over
one of thirty-two clubs, then run it across seasons — roster, contracts,
trades, the waiver wire, free agency, the draft, coaching staff — while the
league simulates around them.

What it is intended to become: a deep, text-and-data management sim that holds
up over many simulated seasons, where the league's other thirty-one clubs
behave like opponents rather than scenery, and where the history the save
accumulates (statistics, awards, records, transactions, news) is the reward for
playing it. The visual register is a clean, dense, mobile-first game UI, not a
spreadsheet and not an arcade game.

Three things are deliberately *not* the goal: real-world licensed content of
any kind, real-time or play-calling gameplay, and photoreal presentation.

---

## 2. Tech stack

Runtime dependencies are deliberately tiny — three packages:

| | |
|---|---|
| **Client** | React 18.3, TypeScript 5, Vite 5 |
| **Server** | Supabase Edge Functions (Deno) over Postgres 16 |
| **DB driver** | `postgres` 3.4 (used by the dev shim and tests, not by the client) |
| **Styling** | Tailwind + a hand-written token layer (`src/app/tokens.ts`, `tokens.css`) |
| **Tests** | Vitest 2 + @testing-library/react (jsdom), Playwright for end-to-end |
| **Lint** | ESLint + `@typescript-eslint`, plus a bespoke architecture linter |

Node 22 and npm 10 are what this has been developed and verified against.

`package.json` `dependencies` is exactly `react`, `react-dom`, `postgres`.
Everything else is a devDependency. **There are no image assets anywhere in the
repository** — see §6.

---

## 3. Repository architecture

```
src/app          shell, design tokens, navigation stack, SaveProvider
src/screens      screen components (76 files) — consume hooks only
src/components   shared UI primitives
src/domain       typed game entities, generated from the real schema
src/data         data access — the ONLY place a Supabase client may appear
src/hooks        typed read hooks
src/lib          utilities (including env validation)
src/avatar       portrait rendering (see §6)

supabase/migrations          37 forward-only SQL migrations
supabase/functions/api       the edge-function entry point
supabase/functions/_shared/engine    the pure simulation engine
supabase/functions/_shared/api       handlers, reads, derivations
supabase/functions/_shared/avatar    deterministic player identity generation

scripts          dev API shim, seeding, reports, the architecture linter
tests            unit, API-against-Postgres, and Playwright end-to-end
legacy           FROZEN reference material — never imported, never linted
docs             design and system documentation
public/avatar-assets   an empty, documented asset directory (see §6)
```

### The three hard rules

These are enforced by `scripts/lint-arch.mjs`, which runs as `npm run lint:arch`
and is part of `npm run preflight`. They are in `ARCHITECTURE.md` and they are
not style preferences.

1. **No production file exceeds 400 lines.** A file that grows past it gets
   split, not exempted.
2. **No simulation outcome is ever decided in frontend code.** Results, ratings,
   standings, money and league state come from the server. The client renders.
3. **Missing data is reported, never invented.** Data access never returns
   `?? 0`, `|| 0`, `?? '-'` or `?? []` — it throws `MissingData`. No column is
   written with a default indistinguishable from a real value.

Two more the linter enforces:

- **`src/` may not import `_shared/engine`.** The simulation must never reach
  the client bundle.
- **IP denylist.** No real league, club, player, coach, stadium or honour names
  anywhere in source, migrations, docs, the seed or `public/`. The linter also
  checks the *filenames* of non-text files, because an art directory is where a
  traced asset announces itself in its name.

---

## 4. Database / data model

Postgres, migrated forward-only. `supabase/migrations/0001` … `0037`, plus a
`superseded/` folder for migrations that were replaced before release.
`docs/SCHEMA.md` is the fuller reference; this is the shape.

**World tables** (the league as generated, shared by every save): teams,
conferences and divisions, staff, players, roster and contract rows, the
schedule, draft classes.

**Save tables** (per-dynasty state): `saves` (with `schema_version`,
`gm_style`, franchise settings, the onboarding checklist, league identity),
`save_documents` (the engine's own serialised world), calendar and phase,
results and box scores, `player_game_stats`, `player_season_stats`,
standings, season summaries, awards and all-star rosters, transactions, news
and its read state, waivers and claims, trades and trade assets, preseason
fixtures and camp evaluations.

Two facts about the data model that repeatedly matter:

- **There are two representations of the same league.** The engine's save
  document (`save_documents`) and the relational tables. Any in-season roster
  move must write **both**, or the simulation and the screens disagree. This
  has caused real bugs.
- **Statistics are split by competition at the storage level.**
  `player_season_stats` has a `competition` column (`REGULAR` / `PLAYOFF`) and
  there is no combined row. Every aggregate takes an explicit competition.

Row-level security exists (`0009_rls.sql`); every handler additionally filters
by `ctx.userId`.

---

## 5. Current game systems

Classified honestly. "COMPLETE" means built, wired to a screen, and covered by
tests — not that it could never be improved.

| System | Status | Notes |
|---|---|---|
| Teams | **COMPLETE** | 32 clubs, profiles, outlook, scouting board, team preview |
| Players | **COMPLETE** | Generation, ratings, development, ageing, retirement |
| Roster | **COMPLETE** | Read, moves, cuts with dead money, roster-space rules |
| Depth chart | **PARTIAL** | `set-depth-chart` route works and a readiness readout exists on the Play tab; there is **no dedicated ordering UI** |
| Player profiles | **COMPLETE** | Entity routing, competition split, grades |
| Schedule | **COMPLETE** | Generated, read, rendered |
| Simulation | **COMPLETE** | Play-by-play engine, box scores, calibrated; `npm run report:sim` |
| Regular season | **COMPLETE** | Week runner, abandonment handling, phase model |
| Standings | **COMPLETE** | One table, asked per competition |
| Statistics | **COMPLETE** | Game and season, split by competition |
| League leaders | **COMPLETE** | Boards with an explicit sort control, never tappable headers |
| Injuries | **WORKING BUT NEEDS REFINEMENT** | `engine/injury.ts` is 91 lines — occurrence and duration, surfaced in news and on team screens; no treatment, no return-to-play detail, no injury screen |
| Contracts | **WORKING BUT NEEDS REFINEMENT** | Cap, expiry, dead money, re-signing all work; structure is simple (no restructures, no incentives, no guarantees model) |
| Trades | **COMPLETE** | Valuation, interest meter, counteroffers, morale, deadline, CPU-to-CPU trades, Trade Center screen |
| Free agency | **COMPLETE** | Offseason free agency *and* a separate in-season market with asking price and signing probability |
| Waivers | **COMPLETE** | Priority order, claims, resolution, deadlines, wire screen |
| Draft | **COMPLETE** | Class generation, order, user picks, CPU picks |
| Scouting | **WORKING BUT NEEDS REFINEMENT** | Real fog-of-war with calibrated confidence bands (`engine/offseason/scouting.ts`), asserted by test; it is draft-side only and has no dedicated scouting screen or scout-assignment loop |
| Playoffs | **COMPLETE** | Bracket, rounds, champion |
| Offseason | **COMPLETE** | Stepped: re-signings, free agency, draft, coaching carousel, rollover |
| Coaching / staff | **COMPLETE** | Staff model, effects, carousel, staff screen |
| Awards | **COMPLETE** | Ceremony, honours, all-league and all-star selections, records |
| Award races | **NOT IMPLEMENTED** | Nothing tracks or displays an in-season race for an award |
| News | **COMPLETE** | Detectors, templates, ledger, read state, filters, News tab |
| Historical statistics | **WORKING BUT NEEDS REFINEMENT** | Season summaries and a record book persist across seasons; there is no career-arc or franchise-history browsing surface |
| Save / load | **COMPLETE** | Slots, create, rename, delete, schema versioning |
| User-controlled team | **COMPLETE** | Full setup flow: Create GM → Select Team → Team Preview → Franchise Settings → Confirm |
| AI-controlled teams | **COMPLETE** | CPU needs, market activity, waiver claims, trades, draft |
| Preseason / training camp | **PARTIAL** | Phases, fixtures, camp evaluations, cut logic and the `camp` read are **built and tested**; the **screens do not exist** — camp dashboard, battle comparison, cut confirmation and Final 53 review are the largest unfinished slice of the game |

---

## 6. Avatar system

The most experimented-on area in the project. Read this section before touching
anything under `src/avatar/` or `supabase/functions/_shared/avatar/`.

### 6.1 Identity — settled, do not rewrite

Lives in `supabase/functions/_shared/avatar/`. It decides **who a player is**
and knows nothing about drawing.

- **`avatarSeed`** — a stored column on `players`, set by a before-insert
  trigger as `sha256(save_id || ':' || player_id)`. It is stored rather than
  derived at read time because a commissioner can edit it, and rule 3 says a
  value a user can change must be a real value, not a re-derivation.
- **`AvatarProfile`** (`profile.ts`) — splits into `AvatarIdentity` (permanent:
  skull, features, pigmentation, ancestry, natural hair colour) and
  `AvatarAppearance` (changeable: hairstyle, hair colour, facial hair, age,
  recession, greying, accessory). `AVATAR_VERSION = 1`.
- **Deterministic generation** (`seed.ts`, `generate.ts`) — every trait is drawn
  from its own **named stream** (`streamFor(seed, 'nose')`) rather than one
  sequence, so adding a field later cannot move an existing face. The RNG is a
  local splitmix32, deliberately *not* the engine's `Rng`: coupling faces to the
  simulation stream would both tie appearance to gameplay and drag the engine
  into the client bundle.
- **Heritage weighting** (`ancestry.ts`) — 19 ancestries, a league mix, and a
  22% mixed-heritage rate. Profiles are **max-merged, not averaged**, so a mixed
  player is not the midpoint of two populations. **No trait knows anything about
  ancestry** — that is the structural guarantee against presets, and it is why
  there is no "face type" enum anywhere.
- **Facial feature generation** (`traits.ts`, `morph.ts`) — a categorical trait
  vocabulary (52 base heads, 35 noses, 30 eyes, 25 lips, …) plus `faceMorph()`,
  which turns the seed into **~55 continuous dimensions** (skull width, temple
  width, cheekbone height, lid heaviness, bridge height, gonial flare, chin
  projection, five asymmetry terms, and so on). Morph is a *render-time
  derivation*: it reads age on purpose, identity stays age-free.
- **Anti-clone** (`unique.ts`) — a `signature()` built from primary structural
  components only (deliberately blind to hairstyle, hair colour and skin step,
  because those hide sameness rather than fix it), a `distance()` over them,
  `NEAR_DUPLICATE = 9` of a possible 47, and `resolveCollision()` which salts
  the seed and redraws. Asserted over 4,000 players in
  `tests/avatar/uniqueness.test.ts`.
- **Age progression** (`generate.ts`, `ageEffects`) — moves only appearance and
  a named subset of morph dimensions. `tests/avatar/morph.test.ts` asserts
  exactly which dimensions age is allowed to move.
- **Position-aware builds** (`build.ts`) — seven builds with a complete
  `Record<Build, number>` weight row per position (not `Partial`; a missing row
  once gave offensive guards a receiver's frame because absent keys inherited
  the weighted-pick default).

### 6.2 Rendering — the abstraction

`src/avatar/portrait.ts` defines `PortraitRenderer` (aliased
`AvatarRenderer`). `render()` **may return `null`**, and that is a supported
answer, not a failure: a renderer that cannot draw says so and the caller falls
back to initials. Swapping renderers is implementing this interface and changing
one constant in `src/avatar/PlayerAvatar.tsx`.

`src/avatar/v2/descriptor.ts` defines `AvatarRenderDescriptor` and `describe()`
— the single place `AvatarProfile` is read on the rendering side. Everything
downstream sees only resolved numbers, ids and hex colours.

### 6.3 Previous experiments — kept as reference, do not iterate on

| Attempt | Location | Why it was rejected |
|---|---|---|
| v1 vector SVG | `src/avatar/geometry.ts`, `svg*.tsx` | Geometric heads, identical eyes, line noses, hair as shapes on top |
| v1.5 painted raster | `src/avatar/raster/` | Hand-painted shading cannot reason about occlusion between 55 independently moving features |
| v2 procedural relief | `src/avatar/v2/` | Read as a low-poly clay mannequin; the gap was surface quality, which analytic primitives cannot supply |
| Hybrid asset compositor | `src/avatar/hybrid/` | Architecturally complete and **correct**; it needs commissioned artwork that does not exist. It returns `null` for every request today |

All four still compile, are still tested, and are kept as the record of what was
tried. `docs/AVATAR-RENDERER-ASSESSMENT.md` has the full assessment.

The hybrid path is not dead — `docs/AVATAR-ASSET-SPEC.md` is a complete artist
specification (canvas, anchors, camera, lighting, crop, colour management, layer
order, and the counts to commission), and `public/avatar-assets/` ships a valid
but empty `manifest.json`. If artwork is ever commissioned, that path is ready.
It is not the current direction.

### 6.4 CURRENT APPROVED DIRECTION

**We are keeping the existing illustrated SVG avatar architecture as the
foundation.** `src/avatar/illustrated/` is the direction. The current SVG
avatars are a **foundation, not finished artwork**.

We are **not** pursuing: photorealistic portraits; real-player likenesses;
primitive low-poly 3D; external photograph-derived faces.

The next objective is **iterative improvement of the existing renderer**, not
another complete renderer rewrite. Four rewrites have happened; a fifth is not
the answer.

Priority improvement order, in this order:

1. Believable head anatomy and proportions
2. Eyes and eyebrows
3. Noses
4. Mouths / lips and cheeks
5. Hairstyles
6. Facial hair
7. Subtle skin and shading
8. Neck / shoulder / build presentation
9. Component compatibility rules
10. Expand variation **only after** base quality improves

### 6.5 The illustrated renderer as it stands

`src/avatar/illustrated/`, organised one directory per visual family. Every
family is a list of variants behind one `Variant { id, label, draw(ctx) }`
contract, so adding a nose is adding a row to an array and the lab can render
any variant of any family without knowing which family it is.

| Family | Count | File |
|---|---|---|
| Head silhouettes | 22 | `heads/shapes.ts` |
| Eyes | 16 | `eyes/constructions.ts` |
| Eyebrows | 12 | `brows/constructions.ts` |
| Noses | 20 | `noses/constructions.ts` |
| Mouths | 16 | `mouths/constructions.ts` |
| Ears | 7 | `ears/constructions.ts` |
| Hairstyles | 62 | `hair/styles.ts` |
| Facial hair | 27 | `facialHair/styles.ts` |
| Complexion details | 18 drawn | `details/Details.tsx` |
| Accessories | 5 drawn | `details/Details.tsx` |

Hair and facial-hair counts are 62 and 27 because that is what identity can
already store. A stored id with no drawing is a player with no hair, and
`tests/avatar/illustrated.test.tsx` fails if any id loses its drawing.

Supporting files: `layout.ts` (the frame every feature draws into — the crop,
the landmark positions, the silhouette half-width at any height), `geom.ts`
(one centripetal Catmull-Rom curve builder, so 22 skulls have one curve
quality), `palette.ts` (HSL shading with the hue rotations an illustrator makes
by hand), `select.ts` (which drawing each player gets), `Portrait.tsx` (the
assembly and the only file that knows the drawing order), `renderer.tsx`
(`illustratedSvgAvatarRenderer`).

Three decisions inside it worth knowing:

- **Head selection is a lattice, not a nearest neighbour.** Nearest-match
  reached only nine of twenty-two skulls across twenty players because morph
  values cluster near the population mean. Four width bands × three length bands
  × two jaw bands with an explicit table reaches all twenty-two across a
  population. A test asserts that.
- **The hair mass is one non-self-intersecting loop.** Two earlier shapes were
  subtly wrong in ways the *fill* hid: rows of hair drew across players' eyes
  and a fade gradient washed grey over their foreheads. A test asserts the path
  has exactly one subpath.
- **Nothing is outlined.** Form comes from a shadow on one side and light on the
  other. A nose drawn with a contour reads as a symbol — the project's history
  here is an arrowhead, then a bowtie, then two lines and two dots.

### 6.6 Avatar development screens

All are development surfaces outside the navigation stack. They read no save and
write nothing.

| Route | What it shows |
|---|---|
| `/dev/illustrated-avatars` | **The current one.** Four sections: 20 complete players, 20 bald men, 12 same-skin-tone faces, and the full feature library |
| `/dev/bare` | The face-only test on its own page, drawn by the renderer wired into the game |
| `/dev/avatars` | The original Avatar Lab (ancestry rows, skin bands, same-haircut rows, career ageing) |
| `/dev/renderer` | v1.5 raster against v2 relief, same profiles |
| `/dev/portraits` | The hybrid compositor's resolved layer plan and its missing-asset report |

**Preserve the bald / clean-shaven face test.** It exists to answer one
question — whether the underlying facial identity is diverse enough — and it is
the only view that can answer it, because hair, beards and skin tone all hide
sameness. The `12 same-skin-tone faces` section is the harder version of the
same test and should be preserved for the same reason.

### 6.7 What is actually wired into the game

**`src/avatar/PlayerAvatar.tsx` still points at `rasterPortraitRenderer`.** The
illustrated renderer is *not* wired into game screens. That was deliberate —
the visual direction had not been signed off. Switching is a one-line change in
that file.

---

## 7. Important design decisions

Do not casually reverse these. Each exists because reversing it broke something
real.

**Server decides, client renders.** No simulation outcome in frontend code. A
save must reproduce exactly from its seed, for save files, golden tests and bug
reports alike.

**Missing data throws.** `?? 0` in a data-access function turns a missing column
into a plausible zero, which then propagates into standings and money and cannot
be traced back.

**Regular-season and playoff statistics never combine.** Enforced at type level
in `src/domain/competition.ts`: `CompetitionSplit<T>` has no combined field.
There is exactly **one** `<CompetitionToggle>` component; a second
implementation of that control is a defect.

**Universal entity routing.** No screen builds a navigation target by hand.
Every player, team, coach, college, game and pick goes through `<EntityLink>`
and `resolveEntityRoute`, so a player is provably the same player everywhere.

**Ability vs performance are distinguished by geometry, not colour.**
`AbilityDial` is a circular dial, `PerformanceChip` is a rectangle with a
coloured left edge. Neither takes a colour or variant prop, so the distinction
survives greyscale and colour-blindness.

**Sorting is an explicit control, never a tappable column header.** On a phone
a tappable header is an invisible affordance.

**The 400-line ceiling.** Not style. It is what has kept the codebase navigable
across 500+ files.

**`src/app/tokens.css` hex values are canonical.** Do not "improve" or normalise
any hex code there. Add additive token layers instead.

**IP policy is absolute.** `docs/IP-POLICY.md`. Original names only, real metro
areas only, no marks, no real honours, no real likenesses. Enforced by a
denylist in the architecture linter, over source, migrations, docs, the seed,
`public/`, and the filenames of binary files.

**The avatar identity layer is age-free and ancestry-blind at the trait level.**
Reversing either reintroduces the preset-face problem the whole system exists to
avoid.

**The engine is pure.** No `Math.random`, no clock reads, no I/O, no host
environment access under `_shared/engine/`. The architecture linter enforces
this.

---

## 8. Known technical debt

**Documentation drift.** `ARCHITECTURE.md` still ends with a "What does not
exist yet (end of Phase 1)" section claiming there is no database, no screens,
no simulation and no save system. All of that now exists. The three rules and
the module boundaries above it are current and correct; that final section is
stale and should be rewritten or deleted.

**Training camp is half a feature.** The API tier, phases, fixtures, evaluations
and cut logic are built and tested; the screens are not. The `camp` read returns
data nothing renders.

**No depth-chart editor.** The route exists and is called; there is no UI for
ordering players within a group.

**Four dead renderers in the tree.** `src/avatar/{geometry,svg*}`, `raster/`,
`v2/`, `hybrid/`. They compile, they are linted, they are tested, and none is
wired in except `raster/`. Kept deliberately as a record, but they are weight.

**Two representations of the league.** The engine save document and the
relational tables. Any in-season roster move must write both. This is the single
most likely source of a subtle future bug.

**`players.position_group` vs the engine's `PositionGroup`.** The seed's display
label is `'Quarterback'`; the engine's type is `'QB'`. This mismatch has caused
bugs in three separate features. There is no shared converter — each site
handles it.

**One generated first name collides with a denylisted term.** Five players in
the seed carry a first name that is also on the IP denylist as a mark, and
`scripts/lint-arch.allow.json` exempts the three files that contain them
(`legacy/seed/players.csv`, `scripts/playtest/world.json`,
`scripts/playtest/playtest.html`) with a written reason. It reads as an ordinary
surname in context rather than as a mark, but it was flagged and never decided.
Run `npm run lint:arch` after removing those three allowlist entries to see the
exact term and rows. Someone should decide whether to rename those five players
or keep the exemption.

(This document tripped that same denylist on its first draft, for naming the
term directly. The fix was to reword, not to exempt — which is the rule below.)

**Bundle size.** The production build emits a single 567 kB JS chunk (172 kB
gzipped) and Vite warns about it. No code splitting has been attempted.

**API test suite runtime.** The full Vitest run takes roughly eight minutes,
because several API suites create a save and simulate whole seasons against
Postgres. That is real coverage, not waste, but it makes the loop slow.

**Postgres has died under concurrent load in this environment.** Do not run the
Playwright suite and the API suite simultaneously against the same instance.

---

## 9. Testing

```
tests/engine      pure engine units
tests/api         handlers against a real Postgres (needs DATABASE_URL)
tests/avatar      identity, morph, uniqueness, and the renderers
tests/e2e         Playwright, five viewports (320/375/390/768/1280)
tests/parity      golden fixtures against the frozen reference engine
tests/<various>   screen and domain units
```

Commands:

| | |
|---|---|
| `npm test` | Vitest, everything except `tests/e2e` |
| `npm run test:e2e` | Playwright; starts the dev shim and the app itself |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint, `--max-warnings 0` |
| `npm run lint:arch` | The architecture and IP linter |
| `npm run preflight` | typecheck + lint + lint:arch + test |

### Status at handoff

| Check | Result |
|---|---|
| `npm run build` | **PASS** (warns: one chunk over 500 kB) |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** — 0 errors, 0 warnings |
| `npm run lint:arch` | **PASS** — 533 files checked, 0 violations |
| `npm test` | **1068 passed, 1 failed**, 6 skipped, 7 todo, across 90 files |
| `npm run test:e2e` | **155 passed, 1 failed**, 4 skipped |

### The two failures — both pre-existing, both flaky

Neither is caused by recent work. Recent work touched only `src/avatar/`,
`src/screens/Illustrated*`, avatar docs, `public/avatar-assets/`, the
architecture linter, the dev routes in `src/App.tsx`, and one colour table in
`_shared/avatar/skin.ts`. Neither failing test is in that blast radius, and both
files predate it.

**1. `tests/api/league.test.ts` — "never sums a playoff run into a
regular-season board".** A **defect in the assertion**, not in the product. The
line is:

```ts
if (post !== undefined) expect(reg?.pass_yards).not.toBe(reg!.pass_yards + post.pass_yards);
```

That can only fail when `post.pass_yards === 0` — i.e. when the regular-season
passing leader has a `PLAYOFF` row with zero passing yards. The suite creates a
fresh save and simulates a whole season on every run, so whether it trips
depends on the season that gets simulated. Verified flaky: it failed in the full
run and passed on an immediate re-run. The fix is to assert what was meant —
that the returned board value equals the `REGULAR` row and not the sum — rather
than comparing a number to itself plus zero. **Left unfixed deliberately**: this
handoff was not the place to change test semantics.

**2. `tests/e2e/market.spec.ts` at the 320 viewport — "the market filters, and
an offer opens on terms he would take".** Asserts the free-agent list has at
least one row after filtering to quarterbacks. The test does not establish that
precondition; it depends on the seeded save's free-agent pool containing an
unsigned quarterback. Verified flaky: failed in the full run, passed on an
immediate re-run of the same spec and project. The fix is for the spec to seed
or assert its own precondition.

Neither is an environment or configuration failure. Both are test-authoring
defects that surface on some simulated seasons and not others.

---

## 10. How to run the project

From a fresh clone:

```bash
# 1. Runtime
#    Node 22.x, npm 10.x, Postgres 16 (local or remote)
node -v && npm -v

# 2. Dependencies
npm install

# 3. Environment
cp .env.example .env.local
#    then fill in the values — see below

# 4. Database, from nothing: every migration, the template world, the dev user
DB=dmp_dev npm run db:fresh
#    prints the DATABASE_URL to put in .env.local

# 5. Two processes, two terminals
npm run dev:api      # the dev API shim on :8787 (needs DATABASE_URL)
npm run dev          # Vite on :5173
```

### Environment variables

Names only — `.env.example` is tracked and documents each one. **No secret
values are in the repository**, and `.env.local` is gitignored.

| Variable | Who reads it | Purpose |
|---|---|---|
| `VITE_API_URL` | Client (bundled, public) | Where the API is. `http://localhost:8787` in dev |
| `DATABASE_URL` | `scripts/dev-api.ts`, tests | libpq-style URL. `?host=` may name a socket directory |
| `DEV_USER_ID` | `scripts/dev-api.ts` | The trusted signed-in user in development only |
| `DEV_API_PORT` | `scripts/dev-api.ts` | Defaults to 8787 |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge functions **only** | Never prefix with `VITE_` — a service-role key in a `VITE_` variable ships to every user |

The dev shim trusts `DEV_USER_ID` because there is no auth server in
development. **That trust must never reach anything deployable** — the edge
function gets its database from the platform and its user from a verified JWT,
and reads neither of these variables.

### Commands

| | |
|---|---|
| Dev | `npm run dev` (plus `npm run dev:api`) |
| Build | `npm run build` (typechecks, then builds to `dist/`) |
| Preview | `npm run preview` |
| Typecheck | `npm run typecheck` |
| Lint | `npm run lint` and `npm run lint:arch` |
| Test | `npm test` (set `DATABASE_URL` first, or the API suites fail in `beforeAll` with a misleading `pipe.close()` error) |
| End-to-end | `npm run test:e2e` |
| Everything | `npm run preflight` |

Useful extras: `npm run walk` (a headless walk of the whole game loop with row
counts at each step), `npm run report:sim` / `report:drift` / `report:market` /
`report:news` (calibration reports with tracked baselines in `docs/`), and
`npm run playtest` (a standalone single-file build of the rig).

### Environment notes for Astra

- A **prebuilt Chromium** is expected at `/opt/pw-browsers/chromium` in the
  container this was developed in. `playwright.config.ts` detects it and pins
  every project to Chromium when present; elsewhere it falls back to the normal
  Playwright engines. If Playwright fails to launch, that detection is the first
  place to look.
- The **API suites need a live Postgres** and take ~8 minutes. `dmp_test` is
  the conventional database for them, `dmp_play` for end-to-end, `dmp_walk` for
  the manual walk.
- Nothing is required at runtime beyond Node and Postgres. There is no asset
  pipeline, no image tooling and no build step other than Vite.

---

## 11. Current development state

Development stopped immediately after an art-direction pass on the illustrated
SVG avatar renderer. The last three commits are all avatar work:

- `76a431b` — the face-only (bald) test moved onto its own page at a size that
  can actually answer it
- `2b2d94c` — the illustrated SVG renderer built: 22 heads, the feature
  families, the component architecture, `/dev/illustrated-avatars`
- `599946e` — the art-direction pass against a supplied reference: proportion,
  crop, presentation, cel shading, plus three real bug fixes (the hair mass
  geometry, eye colours going to CSS as words, and stubble as a flat fill)

Nothing was mid-edit. The working tree is clean and every check above was run on
the final commit.

The avatar renderer is **not wired into the game**. `PlayerAvatar.tsx` still
uses the raster renderer, deliberately, pending sign-off on the illustrated
direction.

The most recent non-avatar work was the in-season trade system. The last
substantial *unfinished* piece of game functionality is the training camp UI
(§5).

---

## 12. Recommended next steps

Prioritised. **Not implemented** — this is a plan, not a commitment.

1. **Fix the two flaky tests** (§9). Small, and they will otherwise erode trust
   in every future red run.
2. **Rewrite the stale tail of `ARCHITECTURE.md`** (§8). It actively misleads a
   new reader about what exists.
3. **Build the training camp screens.** The API tier is already there and
   tested: camp dashboard, position-battle comparison, cut confirmation, Final
   53 review. This is the largest gap between what the server can do and what a
   player can see.
4. **Continue the illustrated avatar renderer** in the priority order in §6.4.
   Iterate; do not rewrite. Judge every change on `/dev/illustrated-avatars`,
   and especially on the bald and same-skin-tone sections.
5. **Decide whether to wire the illustrated renderer into the game.** One line
   in `PlayerAvatar.tsx` once the quality bar is met.
6. **Build a depth-chart editor.** The route exists; the UI does not.
7. **Deepen injuries** — severity, treatment, return-to-play, and a surface that
   shows them.
8. **Award races.** In-season tracking and a display; the awards system it would
   feed already exists.
9. **A franchise-history surface** over the season summaries and record book
   that already persist.
10. **Code splitting** for the 567 kB bundle, once the feature surface settles.
11. **Resolve the seed-name / denylist collision** (§8).
12. **Consider deleting the three unwired legacy renderers** once the
    illustrated direction is confirmed — but keep `hybrid/` and its asset spec,
    which is the only path to a higher visual ceiling if artwork is ever
    commissioned.

---

## 13. Do not break / preserve

Files and interfaces other parts of the application depend on. Change these with
care and with the tests running.

| Path | Why |
|---|---|
| `supabase/functions/_shared/avatar/**` | Player identity. Changing generation, streams or the anti-clone signature **changes every existing player's face in every existing save**. The named-stream design exists so new fields can be added without this happening — use it |
| `supabase/functions/_shared/engine/**` | Purity is enforced and load-bearing. A save must reproduce from its seed |
| `supabase/functions/_shared/api/dispatch.ts` | The single route table. Every client call goes through it |
| `src/avatar/portrait.ts` | The renderer interface. Four renderers implement it; `render()` returning `null` is a supported answer |
| `src/avatar/v2/descriptor.ts` | The one place `AvatarProfile` is read on the rendering side. Keeping it that way is what makes renderers swappable |
| `src/domain/competition.ts` | The type-level guarantee that regular-season and playoff statistics never combine |
| `src/app/navigation*`, `resolveEntityRoute`, `<EntityLink>` | Universal entity routing. See `docs/NAVIGATION-CONTRACT.md` |
| `src/app/tokens.ts`, `tokens.css` | Canonical hex values. Additive layers only |
| `scripts/lint-arch.mjs`, `scripts/lint-arch.allow.json` | The rules above are only real because this enforces them. Loosening the denylist to admit a term is almost always the wrong fix — change the wording instead |
| `supabase/migrations/**` | Forward-only. Never edit a released migration; add a new one |
| `docs/IP-POLICY.md` | The one requirement that cannot be traded against quality or schedule |
| `tests/avatar/uniqueness.test.ts`, `tests/avatar/morph.test.ts` | They assert the two properties the identity system exists to provide |
| The bald / same-skin-tone lab sections | The only views that can tell you whether facial identity is actually diverse |

---

*Prepared as a transfer document. Every status in §5 and §9 was verified by
running the checks, not recalled.*
