# Dynasty Manager Pro — Lovable Prompt Book & Build Manual

**640 prompts across 18 phases.** Built from the actual uploaded project: 28-table seed schema (~25,200 rows), 2,753-line Python engine, 16 exported history CSVs (~40,000 rows), and one 638KB self-contained HTML prototype.

**This file is delivered in parts.** Part 1 below covers the Construction Manual and Prompts 0001–0092 (Phases 1–3). Say CONTINUE and the next section is appended to this same file.

---

## PROJECT REALITY AUDIT

### What is genuinely real

**Seed database — keep it, do not regenerate.** `schema_supabase.sql` declares 28 tables with real foreign keys and text primary keys. Verified counts: players 3,066 · player_attributes 3,066 · player_traits 4,333 · player_contracts 2,880 · team_rosters 2,880 · team_depth_charts 1,952 · coaches 526 · coach_attributes 526 · team_coaching_staff 480 · draft_picks 448 · draft_classes 392 · player_injuries 309 · season_schedule 272 · colleges 260 · free_agents 186 · team_needs 160 · owner_goals 96 · teams/stadiums/owners/salary_cap/franchise_finances/team_schemes/team_bye_weeks 32 each.

**Simulation engine — 2,753 lines of Python, the most valuable asset here.** offseason.py 509 · history.py 500 · season.py 451 · stats.py 321 · run.py 233 · world.py 208 · names.py 121, plus calibrate.py, sweep.py, longrun.py, diag.py, validate_history.py, test_edge_cases.py, export_history.py, award_dist.py and four run logs. The talent-drift calibration described in ENGINE.md is visible in the sweep logs.

**Generators — 1,708 lines** in `generators/` (gen_world.py 574, gen_players.py 417, validate.py 218, ref_data.py 154, write_csv.py 113, gen_sql.py 111).

**History exports — 16 CSVs.** player_season_stats 10,117 · player_season_grades 10,117 · player_team_history 10,087 · player_career_stats 3,666 · player_honors 791 · all_star_selections 480 · all_pro_selections 276 · preseason_expectations 192 · award_voting 154 · coach_season_history 90 · record_history 71 · season_leaders 66 · season_awards 35 · league_records 33, plus two 5,000-row game-log samples.

### Seven findings the UI.pdf does not tell you

1. **The UI has no backend of any kind.** No fetch, no Supabase client, no network call anywhere in index.html. The dataset is a `<script id="gamedata" type="application/json">` blob at line 201. `userTeam` is hardcoded to `"DEN"`, the header is hardcoded to "Week 18". Nothing can write anything.

2. **"17 screens" is 11 real + 6 loop-generated.** Actual handlers: home, team, player, league, allpro, allstar, award, history, records, search, inbox. The rest come from `['trade','fa','draft','txn','staff','settings'].forEach(...)` over a table of title/message pairs.

3. **Universal entity routing is a convention, not a function.** There is no `openPlayer(id)`. Primitives are `push(screen, params)`, `back()`, `replaceRoot(screen, params)`; entities open via inline `push('player',{id})` inside template-literal `onclick` strings. Correct behavior today, no seam. It will shatter silently during the split unless the contract is defined first.

4. **The schema describes the starting world, not a running game.** Searching the DDL for save/user/auth/rls/policy returns **zero hits**. Missing: users, save slots, calendar state, game results, box scores, standings, season stats, season grades, awards, honors, records, transactions, news, in-game draft classes, scouting. The ~40,000 rows of exported history have **no DDL behind them at all**. Roughly 20 tables plus the entire persistence layer are absent.

5. **The engine is Python; Supabase edge functions are Deno/TypeScript.** This is the largest under-costed item in the project. Either the calibrated engine is ported function-by-function with parity tests, or the game can never advance a week from a phone.

6. **The render architecture will not survive a long save.** Every state change rebuilds the whole view — UI.md admits search needs a `setTimeout` refocus hack to survive its own re-render.

7. **Data defects are already visible in the export.** Many profiles carry `"ovr":null,"age":null` (P-prefixed engine-generated players with no seed row). Some carry `"team":""`. Kicker `longest_fg` shows 563, 618, 720 — season sums, not a longest field goal. Fix at the engine, never in the UI.

### Preserve / rebuild / discard

**Preserve, do not let Lovable touch:** everything in `engine/` and its calibrated constants; the 28-table seed schema and CSVs; `history/` as the parity fixture; the `:root` design tokens; the OVR-dial-vs-grade-chip geometry; `push`/`back`/`replaceRoot` semantics *including UI-state restore*; the REGULAR SEASON | PLAYOFFS control as one shared component; `generators/`; and the original-names legal posture in README.md.

**Rebuild:** render layer, navigation as real routing, all six stub screens, cap screen, depth-chart reordering, search.

**Discard:** the inlined gamedata blob, template-literal string rendering, the search `setTimeout` hack, hardcoded `ME='DEN'` and Week 18.

### Principal risks

Engine port fidelity first. Edge-function timeouts during offseason processing second. Write amplification third — ~10,000 rows/season × 50 seasons is over half a million rows per save slot, forcing an early decision on what persists versus what derives on read. Then RLS correctness across ~48 tables. Then App Store policy: Apple rejects thin web wrappers, so a PWA alone will not ship — you need a Capacitor shell with real native affordances and StoreKit IAP, never Stripe.

---

## WHY 640 PROMPTS

| Phase | Prompts | Range |
|---|---:|---|
| 1 — Audit & Production Reorganization | 18 | 0001–0018 |
| 2 — GitHub, Supabase, Environment, Data Safety | 26 | 0019–0044 |
| 3 — Component Split & App Shell Stabilization | 48 | 0045–0092 |
| 4 — Save Slots, New Game, Team Selection, User State | 32 | 0093–0124 |
| 5 — Home, Team, Roster, Player Profile, Entity Routing | 40 | 0125–0164 |
| 6 — Engine Port & Advance-Week Core Loop | 72 | 0165–0236 |
| 7 — Stats, Standings, Schedules, Box Scores, Injuries, News | 44 | 0237–0280 |
| 8 — Regular Season, Playoffs, Champion, Season History | 32 | 0281–0312 |
| 9 — Offseason, Retirements, Progression, Regression, Rollover | 34 | 0313–0346 |
| 10 — Free Agency, Contracts, Cap, Extensions, Roster Rules | 42 | 0347–0388 |
| 11 — Draft, Scouting, Prospects, Rookie Gen, Draft History | 38 | 0389–0426 |
| 12 — Trade Center, Trade AI, Team Needs, Transactions | 32 | 0427–0458 |
| 13 — Coaches, Staff, Schemes, Owner Goals, Morale, Identity | 28 | 0459–0486 |
| 14 — Awards, All-Pro, All-Star, Records, Grades, History DB | 34 | 0487–0520 |
| 15 — Search, News, Inbox, Settings, Accessibility, QoL | 30 | 0521–0550 |
| 16 — Performance, Long-Save Optimization, Security, Testing | 38 | 0551–0588 |
| 17 — Monetization, Demo Limit, Unlock, PWA, App Store Prep | 30 | 0589–0618 |
| 18 — Final QA, 50-Year Testing, Bug Fixing, Release Candidate | 22 | 0619–0640 |
| **Total** | **640** | |

Not 400, because Phase 6 alone is 72 prompts — porting a calibrated 2,753-line simulation with parity tests cannot compress further without producing a simulation that *looks* right and drifts, which is exactly the bug ENGINE.md documents having already fixed once. Not 1,200, because the database, engine logic, design system, navigation semantics and six validated seasons already exist. Roughly 220 of the 640 are porting-and-parity, 180 are feature systems with no code yet, 120 are splitting and wiring what exists in the wrong shape, 120 are hardening, monetization and store readiness.

---

## THE CONSTRUCTION MANUAL

### Working rhythm

**Prompt → Lovable builds → read the diff before running it → test at 320px and 390px → verify the Supabase side → commit with the prompt number → next prompt.**

Never fire two prompts back to back without testing between them. The failure mode on a project this size is not a loud break — it is a quietly duplicated table or a reimplemented helper you discover forty prompts later. Commit messages should read literally `P0137: wire roster sort to season_stats view` so `git bisect` stays usable.

### 1. How to start in Lovable
Do not paste the archive in and ask for a plan. Create an empty Lovable project, set React + TypeScript + Vite + Tailwind, then run Prompt 0001 before uploading anything. Upload the archive only when 0002 tells you to, into a `legacy/` folder marked read-only. Upload first and Lovable will start refactoring the 638KB file on its own initiative.

### 2. When to connect GitHub
Immediately, at Prompt 0019 — before Supabase, before real code. The sync is bidirectional and you want every change in a revertible commit. Connect while the repo is nearly empty so the first sync is trivial and provably working.

### 3. When to connect Supabase
Prompt 0023, after GitHub is proven. Connect the project but let Lovable create **zero** tables. The first Supabase action in this plan is running *your* `schema_supabase.sql`, not Lovable's invented schema.

### 4. When to import or verify the database
Prompts 0026–0037. Run `schema_supabase.sql` verbatim first, then import the 28 CSVs in the exact README order: conferences, divisions, teams, owners, stadiums, colleges, coaches, coach_attributes, team_coaching_staff, team_schemes, players, player_attributes, player_contracts, player_morale, player_traits, player_injuries, team_rosters, team_depth_charts, season_schedule, team_bye_weeks, free_agents, draft_picks, draft_classes, franchise_finances, salary_cap, team_needs, owner_goals, data_provenance. The order is not cosmetic — `teams` must precede `owners` and `stadiums`, both carry FKs back to it. Count-check after every import. Off by one row, stop and find it.

### 5. When to commit/sync
After every prompt that changes code, without exception. Tag at every phase boundary: `git tag phase-03-complete`. Eighteen tags gives eighteen known-good restore points.

### 6. How to test after every prompt
Four things, in this order. Open at 320px, confirm no horizontal *page* scroll (tables scrolling inside their own containers is correct). Open at 390px and use the feature just built. Navigate three levels deep, apply a filter, open a player, press back, confirm filter and scroll position survived. Then open the Supabase table editor and confirm the rows you expected were actually written — if the prompt claimed persistence and the table is empty, the prompt failed regardless of what the UI shows.

### 7. What to do when Lovable breaks something
Do not prompt your way out. Revert the commit, re-run the same prompt with one added sentence naming what it broke and forbidding that change. Lovable responds far better to "do X, and do not modify Y" than "fix what you did to Y." Two failed revert-and-retry cycles means the prompt is too big — split it.

### 8. What to do when Lovable creates duplicates
Duplicate tables are the dangerous case: both accept writes and your data silently forks. Check the Table Editor after every schema-touching prompt for near-names — `player_stats` beside `player_season_stats`, `saves` beside `save_slots`. Drop the newcomer, revert the commit, re-run with "the table X already exists; use it and do not create a new one." For components, search the repo for the name before accepting the diff — `PlayerCard.tsx` and `PlayerCardNew.tsx` coexisting is the signature.

### 9. When to stop and fix instead of moving forward
Three hard stops. **Any wrong number anywhere** — that is a data-layer bug and every screen above it inherits the error. **Any regression in back-stack state restoration** — load-bearing across every future screen. **Any parity failure during the Phase 6 port** — simulation drift compounds invisibly and will not show up in a five-season test. Cosmetic issues batch into an end-of-phase cleanup prompt; these three do not.

### 10. How to prepare for paid release
Start at Prompt 0589, not later. The demo boundary must be enforced server-side in an edge function that checks entitlement before advancing the calendar. A client-side season counter is trivially bypassed and will get the app pulled if a reviewer notices. Three seasons free, full career paid, is the conventional shape for this genre and maps cleanly onto season-close logic.

### 11. How to prepare for PWA / App Store
Build the PWA at Prompts 0601–0612 so the web version ships and earns while the native shell is in flight. Wrap with Capacitor, not a bare web view — Apple guideline 4.2 rejects minimally-viable web wrappers. Budget the native-affordance prompts: real haptics, native share, offline save access, safe-area handling, no browser chrome. Use StoreKit for the unlock, never a web payment link. Register the bundle ID and create the App Store Connect record while Phase 17 runs; provisioning takes days you do not want to discover at the end.

---
---

# PHASE 1 — Project Audit and Production Reorganization
*Prompts 0001–0018*

---

### Prompt 0001 · Phase 1 — Project Audit and Production Reorganization
**Establish the production skeleton before importing anything**

> I am starting a mobile-first football franchise-management game called Dynasty Manager Pro. Before I upload any existing files, I want you to set up a clean production skeleton and nothing more. Configure this project as React with TypeScript in strict mode, Vite, and Tailwind, with a folder structure of `src/app` for shell and routing, `src/screens` for screen-level components, `src/components` for shared UI, `src/domain` for typed game entities, `src/data` for data access, `src/lib` for utilities, and `supabase/` for migrations and edge functions. Create a top-level `ARCHITECTURE.md` that states three rules I will hold you to for the rest of this build: no production file may exceed 400 lines, no simulation outcome may ever be decided in frontend code, and if a required table, column or relationship is missing you must stop and tell me what is missing rather than inventing placeholder data. Do not create any screens, any components, any database tables, or any sample data yet. I have an existing codebase with a working simulation engine and a validated database that I will bring in deliberately, and anything you generate speculatively now will collide with it.

**Success check:** Folder tree exists, `ARCHITECTURE.md` contains the three rules, `tsconfig.json` has `strict: true`, `src/` contains no screens or sample components.
**Do not continue until:** `npm run dev` serves a blank page with no console errors and you have confirmed no example components were created anywhere.

---

### Prompt 0002 · Phase 1 — Project Audit and Production Reorganization
**Import the existing archive as frozen reference material**

> I am uploading an archive of my existing project. It contains a Python simulation engine of about 2,750 lines, a set of 28 seed CSV files with roughly 25,200 rows, a Postgres schema file, sixteen exported history CSVs, and a single 638KB self-contained HTML prototype. Place all of it under a top-level `legacy/` directory, preserving the internal structure exactly: `legacy/engine/`, `legacy/generators/`, `legacy/history/`, `legacy/seed/` for the root CSVs and `schema_supabase.sql`, and `legacy/ui/index.html`. Add `legacy/README.md` stating that this directory is reference material and a source of truth for behavior, that nothing in it is ever imported by application code, and that nothing in `legacy/engine/` may be modified, deleted or refactored by you at any point in this project — it is the calibrated reference implementation that later work will be tested against. Do not attempt to convert, port, summarize or clean up anything yet. Do not modify the HTML file. Do not extract the embedded data from it. Just place the files and confirm what you received with a file count and total size.

**Success check:** `legacy/` mirrors the archive, engine Python files are byte-identical, Lovable reports roughly 86 files.
**Do not continue until:** You have spot-checked `legacy/engine/offseason.py` and `legacy/ui/index.html` are unmodified and nothing from `legacy/` is imported in `src/`.

---

### Prompt 0003 · Phase 1 — Project Audit and Production Reorganization
**Lift the design tokens out of the prototype**

> Open `legacy/ui/index.html` and find the `:root` block near the top of the `<style>` element. It defines the complete visual language of this game: a night-press-box palette built on cool slate ink rather than pure black, warm paper-white text, amber as the single action-and-ability accent borrowed from the first-down marker, and a six-stop performance ramp running violet for elite through teal, green, amber and orange down to red. Extract every custom property from that block into `src/app/tokens.css` exactly as written, changing no values whatsoever, and import it once at the application root. Then create `src/app/tokens.ts` exporting the same values as typed constants for the places where I will need them in TypeScript rather than CSS. Add a short comment at the top of both files recording that these values came from the prototype and are the canonical palette. Do not invent additional colours, do not "improve" or normalize any hex value, and do not introduce a Tailwind theme that shadows these tokens with slightly different numbers — Tailwind should reference the custom properties, not duplicate them.

**Success check:** `tokens.css` and `tokens.ts` hold identical values; a diff against the prototype's `:root` shows no changed hex codes.
**Do not continue until:** You have compared a rendered swatch against the prototype in a browser and confirmed the amber, slate ink and all six ramp stops match.

---

### Prompt 0004 · Phase 1 — Project Audit and Production Reorganization
**Extract the embedded snapshot into a versioned fixture**

> The prototype at `legacy/ui/index.html` contains a `<script id="gamedata" type="application/json">` block holding a complete frozen snapshot of simulated season 2031 — all 32 teams with colours and divisions, a roster, standings, award ballots, and 284 player career profiles including retired players. Extract that JSON verbatim into `legacy/fixtures/snapshot-2031.json` and leave the HTML file itself untouched. This snapshot is a test fixture and a reference for what correct output looks like; it is explicitly not application data, so add a header note in `legacy/fixtures/README.md` saying so, and state that the application will read from Supabase and never from this file. While you are in there, report back to me on three things you will find in the data: how many profiles carry a null `ovr` and null `age`, how many carry an empty string for `team`, and what the range of `longest_fg` values is for kickers. Do not fix any of them. I want the counts because they indicate defects in the export pipeline that must be repaired in the engine later, not patched in the interface.

**Success check:** Fixture parses as valid JSON with 284 profiles and 32 teams; Lovable reports non-zero null-OVR and empty-team counts and `longest_fg` values in the hundreds.
**Do not continue until:** The extracted JSON parses cleanly and `legacy/ui/index.html` is still byte-identical.

---

### Prompt 0005 · Phase 1 — Project Audit and Production Reorganization
**Produce a screen and function manifest of the prototype**

> Read through the application script in `legacy/ui/index.html` and produce `docs/PROTOTYPE-MANIFEST.md` documenting what is actually in it, because I am going to rebuild this file as components and I need an accurate map first. For every entry in the `SCREENS` object, record the screen key, whether it has a hand-written handler or is generated by the loop over the trade, free agency, draft, transactions, staff and settings keys, what parameters it accepts, what data it reads from the snapshot, and one sentence on what it displays. Separately, list every navigation call site — every place that calls `push`, `back` or `replaceRoot` — and note which of them navigate to a player, a team, or another entity. Then list every helper function defined in the file with its name and purpose. Be exact and do not smooth over what you find: if a screen is a placeholder that displays a message saying the feature is not built, say so plainly in the manifest rather than describing what it would show. This document is going to drive the component split, so an optimistic manifest will cost me real time later.

**Success check:** Manifest lists exactly eleven hand-written screens and six loop-generated placeholders, and identifies inline `push('player', …)` as the entity-navigation mechanism.
**Do not continue until:** You have read the manifest and confirmed it matches what the prototype actually does in a browser at 390px.

---

### Prompt 0006 · Phase 1 — Project Audit and Production Reorganization
**Set the file-size ceiling and module boundaries**

> My current prototype is one 638KB HTML file containing markup, styles, data and all application logic, and that shape is the single biggest obstacle to shipping this as a real product. Establish and enforce the boundaries now, before any code is written. Add ESLint configuration that fails the build when any file in `src/` exceeds 400 lines, and add a second rule that fails when any file in `src/screens/` or `src/components/` imports from `src/data/` directly rather than through a hook — screens should consume typed hooks, not raw data-access code. Document both rules in `ARCHITECTURE.md` under a section explaining that a 400-line ceiling is not stylistic preference but a hard constraint that prevents the prototype's failure mode from reappearing. Add an npm script `lint:arch` that runs these checks, and wire it so it runs on every build. Do not add exemptions or an ignore list, and do not apply the rules to `legacy/`, which is frozen reference material and is expected to violate them.

**Success check:** `npm run lint:arch` passes on the empty `src/` tree; a deliberate 500-line file in `src/components/` makes it fail.
**Do not continue until:** You have proven the rule fires by creating an oversized file, watching lint fail, and deleting it.

---

### Prompt 0007 · Phase 1 — Project Audit and Production Reorganization
**Generate the domain type layer from the real schema**

> Read `legacy/seed/schema_supabase.sql`, which declares 28 tables with foreign-key constraints, and generate a TypeScript domain model in `src/domain/` with one file per logical entity group — league structure, teams and stadiums, coaches and staff, players and their attributes, contracts and finances, schedule, and draft. Every type must mirror the SQL exactly: same column names, same nullability, text primary keys where the schema uses text. Do not add fields the schema does not have, do not rename anything into camelCase, and do not guess at columns — if a column's intent is unclear from its name, add a `// TODO: confirm` comment rather than inventing semantics. Export a `TableName` union type listing all 28 table names as string literals, since I will use it later to prevent typo-driven duplicate tables. Note in a comment at the top of the index file that this schema describes the starting world only, and that the tables required for a running game — save state, results, standings, season stats, awards, transactions and news — do not exist yet and will be added in Phase 2.

**Success check:** 28 table types exist, `tsc --noEmit` passes, `TableName` matches the CREATE TABLE list exactly.
**Do not continue until:** You have eyeballed `players`, `player_contracts` and `season_schedule` against the SQL and confirmed no invented or missing columns.

---

### Prompt 0008 · Phase 1 — Project Audit and Production Reorganization
**Lock the toolchain and add a pre-flight check**

> Configure the quality gates that everything after this will pass through. Set up ESLint with the TypeScript plugin in strict mode, Prettier with a fixed configuration committed to the repo, and a `typecheck` script running `tsc --noEmit`. Add a single `npm run preflight` script that runs typecheck, lint, the architecture rules from earlier, and the test suite in sequence, failing on the first error. Add a GitHub Actions workflow at `.github/workflows/ci.yml` that runs `preflight` on every push and every pull request. Configure it to ignore `legacy/` entirely, since that directory contains Python and a deliberately monolithic HTML file that must never be linted or reformatted. Keep the configuration minimal and readable — I would rather have twenty rules I understand than a preset with two hundred I do not. Do not add a pre-commit hook that reformats files automatically, because I want to see and approve every change you make rather than have formatting churn hide real edits in my diffs.

**Success check:** `npm run preflight` completes green; the CI workflow exists and excludes `legacy/`.
**Do not continue until:** You have pushed once and watched the Actions run go green, confirming CI is wired rather than merely present.

---

### Prompt 0009 · Phase 1 — Project Audit and Production Reorganization
**Build the mobile shell and the overflow guard**

> Create the application shell in `src/app/Shell.tsx` implementing the layout constraints this game is designed around. The baseline target is a 390px-wide phone; the content column caps at 520px and centres on wider viewports rather than stretching, so the desktop experience is a well-composed narrow column and not a broken phone layout. The critical rule is that the page itself must never scroll horizontally at any viewport width down to 320px — wide data tables are permitted and expected to scroll horizontally, but only inside their own bounded containers. Implement that as a reusable `TableScroll` component in `src/components/` that provides the overflow container, and add a development-mode guard that detects when `document.documentElement.scrollWidth` exceeds `clientWidth` and logs a loud console error naming the offending element, so I catch page-level overflow the moment it is introduced rather than three phases later. Respect iOS safe-area insets in the shell padding. Do not add navigation, screens or content yet — this prompt is the container and the guard only.

**Success check:** Shell renders an empty centred column; a deliberately 900px-wide element inside `TableScroll` scrolls the table without scrolling the page.
**Do not continue until:** Tested at 320, 390, 768 and 1280px with no page-level horizontal scroll, and the guard fires when you break it deliberately.

---

### Prompt 0010 · Phase 1 — Project Audit and Production Reorganization
**Specify the navigation contract before implementing it**

> The most valuable behavior in my prototype is its navigation stack, and it is also the thing most likely to be destroyed during a rewrite, so I want the contract written down before any code exists. Read the navigation section of `docs/PROTOTYPE-MANIFEST.md` and write `docs/NAVIGATION-CONTRACT.md` specifying the following precisely. Every stack frame stores three things: the screen identity, its parameters, and its UI state — meaning the active tab, any filter chips, the sort order and the scroll offset. Going back pops the frame and restores all three, so that navigating from the league grade leaderboard, filtering to cornerbacks, opening a player, and pressing back returns you to the cornerback filter at the exact scroll position you left. Specify the three operations — push, back, and replace-root — and define which one the bottom navigation uses, which is replace-root, because tapping a primary destination should not grow the stack indefinitely. Define what happens on hardware back on Android and on the browser back button. Do not write the implementation in this prompt; I want the specification reviewed and correct first, because every screen in the next seventeen phases depends on it.

**Success check:** Document specifies all three operations, all three components of frame state, and explicit hardware/browser back behavior.
**Do not continue until:** You have run league → grades → filter CB → open player → back in the prototype, confirmed restore, and verified the contract describes what you observed.

---

### Prompt 0011 · Phase 1 — Project Audit and Production Reorganization
**Create the universal entity routing seam**

> In my prototype, opening a player works identically from a roster row, a grade leaderboard, an MVP ballot, an All-Pro team and a news headline — but only by convention, because each of those is a hand-written inline `push('player',{id})` inside a template literal. There is no shared function, which means the guarantee will silently break the moment the file is split. Fix that structurally now. Create `src/app/entity.ts` defining an `EntityRef` discriminated union covering player, team, coach, college, game and draft-pick references, each carrying its identifier, plus a single `resolveEntityRoute(ref)` function returning the screen and parameters for that entity. Then create an `<EntityLink>` component in `src/components/` that takes an `EntityRef`, renders its children as a tappable target, and navigates through `resolveEntityRoute`. Document in `ARCHITECTURE.md` that from this point forward no screen may construct a navigation target for an entity by hand — every player, team or coach reference anywhere in the application goes through `EntityLink`, so that a player is provably the same player everywhere. Do not implement the screens themselves yet.

**Success check:** `EntityRef` covers six entity kinds, `resolveEntityRoute` is exhaustive with no default case, `EntityLink` compiles.
**Do not continue until:** Adding a new entity kind without a matching route produces a TypeScript error, proving exhaustiveness works.

---

### Prompt 0012 · Phase 1 — Project Audit and Production Reorganization
**Make the regular-season/playoff split a type-level guarantee**

> My exported data keeps regular-season and playoff production strictly separate, and a validation on the prototype confirmed zero profiles with duplicate season-and-competition rows. That separation is a core correctness property of this game — a player's 17-game regular season and his four playoff games are different records that must never be silently summed — and I want it enforced by the type system rather than by discipline. Create `src/domain/competition.ts` defining a `Competition` type as the literal union of regular season and playoffs, and a `CompetitionSplit<T>` container holding one value of each with no combined field. Any function that aggregates statistics must take a `Competition` argument explicitly; make it impossible to call an aggregate without stating which competition you mean. Then build the `<CompetitionToggle>` component that renders the REGULAR SEASON | PLAYOFFS control, styled from the tokens, as a single shared component — the same instance will be used on player stats, player grades, team stats, league grade leaderboards and the record book, and there must never be a second implementation of it. Add a note to `ARCHITECTURE.md` recording that duplicating this control is a defect.

**Success check:** No aggregation helper compiles without an explicit `Competition` argument; exactly one `CompetitionToggle` exists.
**Do not continue until:** A throwaway test that tries to total regular-season and playoff values together is rejected by the type system.

---

### Prompt 0013 · Phase 1 — Project Audit and Production Reorganization
**Build the ability dial and the performance chip**

> The signature of this interface is that overall rating and performance grade never look alike, and crucially they are distinguished by geometry rather than colour so the distinction survives colour-blindness. Build both components now, because almost every screen uses them. Ability is a circular dial with an amber arc that fills in proportion to the rating — a gauge. Performance is a rectangular chip with a coloured left edge drawn from the six-stop grade ramp running violet for elite, then teal, green, amber, orange, and red at the bottom. Read the prototype's markup and CSS for both and reproduce them faithfully from the tokens rather than approximating. Handle the real edge cases in my data: overall rating is genuinely null for a large number of engine-generated players, and the dial must render a clean empty state for that rather than a zero or a broken arc, because a zero would be a lie. Both components take a numeric value and nothing else — no colour props, no variant props that would let a future screen make a grade look like an ability. Write a small gallery route at `/dev/components` showing both across their full value ranges including null.

**Success check:** Gallery renders the dial at 0, 50, 99 and null, and the chip across all six ramp stops, shapes distinguishable in greyscale.
**Do not continue until:** You have screenshotted the gallery in greyscale and confirmed ability is still tellable from performance without colour.

---

### Prompt 0014 · Phase 1 — Project Audit and Production Reorganization
**Install the stop-and-report rule as real code**

> I need a hard technical guarantee against a specific failure I have seen ruin projects like this: when data is missing, the application quietly substitutes a plausible-looking value and I lose days discovering that a number on screen was never real. Build the machinery that makes that impossible. Create a `MissingData` error type carrying the table, the column, the identifier that was being looked up, and the screen that requested it. Make every data-access function in `src/data/` throw it rather than returning a fallback, a zero, an empty array or a dash. Add a `<DataBoundary>` component that catches it and renders an explicit development-mode panel reading which table and column were missing and for which entity, and in production renders a neutral, honest message that the information is unavailable — never a fabricated value. Wire the boundary into the shell. Document in `ARCHITECTURE.md` that inventing placeholder data to satisfy a component is the single most serious defect you can introduce in this project, and that the correct response to a missing table or relationship is always to stop and tell me what is missing.

**Success check:** Requesting a nonexistent player throws `MissingData`; the boundary names table and column in dev; nothing returns a default numeric value.
**Do not continue until:** You have grepped `src/data/` for `?? 0`, `|| 0`, `?? '-'` and confirmed there are none.

---

### Prompt 0015 · Phase 1 — Project Audit and Production Reorganization
**Codify and lint the intellectual-property policy**

> This game is deliberately built on original naming throughout — every franchise nickname, player, coach, owner, stadium and college in my database is invented, and only real metropolitan area names are used, since city names are not trademarks. That posture is what makes it shippable and I need it to survive two hundred more prompts of iteration. Write `docs/IP-POLICY.md` stating the rule plainly: no real league or team names, no real team marks, logos, wordmarks or colour schemes presented as official, no real player or coach names, no real player likenesses, no stadium sponsorship names, and no copyrighted broadcast or publisher terminology. State that team identity is expressed through the metro area, the original nickname, and the two colours already stored in the `teams` table, and that generated wordmarks or geometric badges are acceptable while imitations of real marks are not. Then add a lint rule with a denylist of real franchise nicknames and league abbreviations that fails the build if any appears in `src/`, `supabase/` or asset filenames. Exclude `legacy/` from the check.

**Success check:** Policy document exists; the lint rule fails the build when a real franchise nickname is deliberately placed in a source file.
**Do not continue until:** You have tested the rule with a real team name, watched it fail, removed it, and confirmed the build recovers.

---

### Prompt 0016 · Phase 1 — Project Audit and Production Reorganization
**Bootstrap the test harness at real device widths**

> Set up the testing infrastructure that the next seventeen phases will rely on. Configure Vitest with React Testing Library for unit and component tests, and Playwright for end-to-end tests. Configure Playwright with four device profiles matching how this game will actually be used and reviewed: 320px for the smallest phones still in circulation, 390px as the primary design target, 768px tablet, and 1280px desktop. Write one initial end-to-end test that loads the shell at all four widths and asserts that `document.documentElement.scrollWidth` never exceeds `clientWidth`, since page-level horizontal overflow is a defect I want caught automatically rather than by eye. Write component tests for the ability dial and the performance chip covering their full value ranges and the null case. Add all of it to the `preflight` script. Keep the harness fast — if the suite takes more than about thirty seconds at this stage, I will stop running it, and a test suite I skip is worse than none.

**Success check:** `preflight` runs unit, component and end-to-end tests green, with the overflow assertion at all four widths.
**Do not continue until:** A deliberately 900px-wide element in the shell makes the 320px test fail, and you have removed it.

---

### Prompt 0017 · Phase 1 — Project Audit and Production Reorganization
**Build the engine parity fixture pipeline**

> Phase 6 of this project will port my calibrated Python simulation to TypeScript, and the only way that succeeds is if I can prove the port produces the same results as the original rather than merely plausible ones. Build the fixture pipeline now, while it is cheap. Write a Python script at `legacy/parity/export_goldens.py` that imports the existing modules in `legacy/engine/` without modifying any of them, runs a fixed-seed simulation, and writes deterministic golden output files to `legacy/parity/goldens/` covering these subsystems separately: a single game result, a full regular season's standings, one season of player statistics, one season of performance grades, one complete award vote tally, and one offseason's progression, regression and retirement outcomes. Each golden must be seeded and reproducible, so that running the script twice produces byte-identical files. Then create `tests/parity/` with a harness that loads a golden and compares it against a TypeScript implementation, currently stubbed as not-yet-implemented so the tests are red and pending rather than falsely passing. Do not modify anything under `legacy/engine/` to make this easier.

**Success check:** Running the export twice produces byte-identical goldens; six subsystem files exist; parity tests report pending, not passing.
**Do not continue until:** You have diffed two export runs and confirmed `git status` shows `legacy/engine/` unchanged.

---

### Prompt 0018 · Phase 1 — Project Audit and Production Reorganization
**Phase 1 exit audit and baseline tag**

> Before I connect GitHub and Supabase, audit what we have built in this phase and tell me honestly whether it is sound. Write `docs/PHASE-01-AUDIT.md` answering the following from the actual repository state rather than from what the prompts asked for. Confirm that `legacy/` is intact and that nothing in `legacy/engine/` has been modified, using git to verify rather than by inspection. Confirm that no application code imports from `legacy/`. Confirm the 400-line ceiling and the architecture lint rules genuinely fail when violated, and state how you tested that. Confirm the entity routing seam is exhaustive, the competition split cannot be bypassed, and that no data-access function returns a fallback value. List every file currently in `src/` with its line count. Then list anything you built that you are not confident in, and anything the prompts asked for that you were unable to do properly — I would rather find that here than in Phase 12. Finally, state clearly what does not yet exist: no database connection, no screens, no navigation implementation, no simulation.

**Success check:** Audit exists, reports zero modified files under `legacy/engine/`, lists every `src/` file under 400 lines, enumerates what is still missing.
**Do not continue until:** You have resolved every low-confidence item it flags, run `preflight` green, and tagged `phase-01-complete`.

---
---

# PHASE 2 — GitHub, Supabase, Environment, and Data Safety
*Prompts 0019–0044*

---

### Prompt 0019 · Phase 2 — GitHub, Supabase, Environment, Data Safety
**Connect GitHub and prove the sync is bidirectional**

> Connect this project to GitHub now, while the repository is still small enough that a failed sync is trivial to recover from. Push everything currently in the project, including the `legacy/` directory, since the engine and the seed data are as much a part of this codebase as the application code and I never want them living only in one place. After the initial push, prove the sync works in both directions rather than assuming it: make a small change here and confirm it appears in the GitHub commit history, then tell me exactly what I need to do to make a change on GitHub and have it appear here, so I know the recovery path before I need it. Confirm the `.gitignore` excludes `node_modules`, build output, and any local environment files, and confirm that nothing under `legacy/parity/goldens/` is ignored, because those golden files are test fixtures that must be version-controlled. Report the repository URL, the default branch name, and the total committed size.

**Success check:** Repository exists with all files including `legacy/`; goldens are committed; a change made here appears in GitHub history.
**Do not continue until:** You have pushed a trivial edit from the GitHub side and confirmed it flows back into Lovable.

---

### Prompt 0020 · Phase 2 — GitHub, Supabase, Environment, Data Safety
**Establish the branch, commit and tag discipline**

> Set up the version-control discipline this project will run on for the next six hundred prompts, and write it into `docs/GIT-WORKFLOW.md` so we both follow the same rules. Work happens on `main` for speed, but every phase boundary gets an annotated tag in the form `phase-NN-complete`, and I want you to create those tags rather than leaving it to me. Every commit message must begin with the prompt number in the form `P0137: short description`, because when a regression appears forty prompts later I need `git bisect` and `git log --oneline` to tell me which prompt introduced it without reading diffs. Document the recovery procedure explicitly: how to revert a single commit, how to reset to the last phase tag, and how to recover if a Lovable-generated change is pushed before I have reviewed it. Also document that any prompt that touches the database schema must produce both a code commit and a migration file in the same commit, never separately, so the schema and the code that depends on it can never drift apart in history.

**Success check:** `GIT-WORKFLOW.md` exists with the commit convention, the tag scheme, and three written recovery procedures.
**Do not continue until:** You have practised reverting a commit and resetting to the `phase-01-complete` tag, and confirmed the working tree recovers cleanly.

---

### Prompt 0021 · Phase 2 — GitHub, Supabase, Environment, Data Safety
**Define the environment and secrets structure**

> Set up the environment configuration for this project, keeping in mind that it will eventually run as a web application, an installed PWA, and a Capacitor-wrapped native app, all against the same backend. Create a `.env.example` committed to the repository listing every variable this project will need with placeholder values and a one-line comment explaining each, and ensure real `.env` files are ignored by git. Create `src/lib/env.ts` that reads and validates the environment at startup with a schema, failing loudly and immediately with a readable message naming the missing variable rather than letting the application boot half-configured and fail mysteriously three screens deep. Distinguish clearly between variables that are safe to expose in the client bundle and variables that must only ever exist server-side in edge functions, and enforce that distinction with a naming convention documented in `ARCHITECTURE.md`. Do not put any real credentials anywhere yet, and never write a service-role key into any file in `src/`.

**Success check:** `.env.example` documents every variable; `env.ts` throws a named error when a variable is missing; real `.env` is git-ignored.
**Do not continue until:** You have deliberately removed a variable, confirmed the app fails at startup with a clear message, and restored it.

---

### Prompt 0022 · Phase 2 — GitHub, Supabase, Environment, Data Safety
**Add secret scanning and a leak tripwire**

> Before any real credentials enter this project, install the safety net. Add a secret-scanning check to the `preflight` script that searches the working tree for patterns matching Supabase service-role keys, JWT-shaped strings, and anything resembling an API key committed as a literal, and fails the build if it finds one outside `.env.example`. Enable GitHub's push protection on the repository if it is available, and document in `docs/GIT-WORKFLOW.md` the exact procedure for what to do if a key is committed anyway: rotate first in the Supabase dashboard, then purge from history, in that order, because purging first while the key is still live is the wrong sequence. Add the same scan to the CI workflow so it runs on every push and not only when I remember to run preflight locally. Test the scanner by committing a fake service-role-shaped string to a scratch file, confirming the build fails, and then removing it.

**Success check:** Preflight and CI both fail on a planted fake key; the rotation-then-purge procedure is documented in the right order.
**Do not continue until:** You have planted a fake key, watched both local and CI checks fail, and removed it.

---

### Prompt 0023 · Phase 2 — GitHub, Supabase, Environment, Data Safety
**Connect Supabase without creating a single table**

> Connect this project to Supabase now, and I want to be completely explicit about a boundary: do not create any tables, columns, views, functions, policies, buckets or seed rows as part of this connection. I have an existing validated Postgres schema of 28 tables with real foreign-key constraints, and it is going in verbatim in a later prompt as the first migration. Any table you create speculatively now will collide with it, and duplicate tables are the single most damaging failure mode in this project because both will silently accept writes and my data will fork without any error appearing. So: establish the connection, wire the publishable key into the environment configuration built earlier, confirm the project reference and region, and then stop. Report back the project reference, the region, the current table count in the public schema, and confirm in writing that you created nothing. If the connection process auto-generates any table at all, tell me its name immediately rather than leaving it in place.

**Success check:** Connection is live, keys resolve through `env.ts`, and the public schema table count is zero.
**Do not continue until:** You have opened the Supabase Table Editor yourself and visually confirmed the public schema is empty.

---

### Prompt 0024 · Phase 2 — GitHub, Supabase, Environment, Data Safety
**Build the typed Supabase client as a single seam**

> Create the one and only Supabase client this application will use, at `src/data/client.ts`, exported as a singleton and configured from the validated environment. Every database call in this project goes through this module and nothing else — no component, screen or hook may construct its own client, and I want that stated in `ARCHITECTURE.md` and enforced with a lint rule that fails the build if `createClient` appears anywhere except this file. Generate the database types from the live Supabase project and wire them into the client so queries are type-checked against the real schema rather than against my hand-written domain types, and set up an npm script `db:types` that regenerates them, since I will be running it after every migration for the rest of this project. Note that the schema is currently empty, so the generated types will be empty too — that is expected and correct at this point, and confirms the pipeline works before there is anything in it to obscure a failure.

**Success check:** One client module exists, `db:types` runs and produces a types file, and the lint rule fires if a second `createClient` is added.
**Do not continue until:** You have added a second `createClient` call in a scratch file, watched lint fail, and removed it.

---

### Prompt 0025 · Phase 2 — GitHub, Supabase, Environment, Data Safety
**Establish the migration workflow and forbid dashboard edits**

> Set up a migration-first database workflow and document it in `docs/DATABASE-WORKFLOW.md`. Every schema change in this project — every table, column, index, constraint, view, function and policy — must exist as a numbered, checked-in SQL file under `supabase/migrations/`, applied through the migration tool, never typed into the Supabase dashboard. State the reason plainly in the document: a schema that lives only in the dashboard cannot be reviewed, cannot be reverted, cannot be recreated for a fresh environment, and cannot be reasoned about from the repository, and on a project with roughly forty-eight tables that becomes unrecoverable quickly. Establish the file naming convention, the rule that migrations are append-only and never edited after being applied, and the requirement that every migration ships in the same commit as the code depending on it. Add a preflight check that compares the migration files against the live schema and warns me when they have diverged, since that divergence is the earliest signal that someone edited the dashboard directly.

**Success check:** Workflow document exists, `supabase/migrations/` is set up, and the drift check runs in preflight.
**Do not continue until:** You have made a trivial change in the dashboard, watched the drift check catch it, and reverted it.

---

### Prompt 0026 · Phase 2 — GitHub, Supabase, Environment, Data Safety
**Apply the existing 28-table schema verbatim as migration 0001**

> Take `legacy/seed/schema_supabase.sql` and apply it as the first migration of this project, copied verbatim into `supabase/migrations/` with no modifications whatsoever. This file declares 28 tables with text primary keys and real foreign-key constraints, and it has already been parse-validated and used to produce a database that passed 72 integrity checks, so it is not a draft to improve. Do not change any column name, do not convert text primary keys to UUIDs, do not add timestamps or soft-delete columns, do not add indexes, and do not reorder the table definitions — the order in that file is the dependency order and altering it will break the foreign keys. If you believe any part of it should change, tell me what and why in your response, but apply it unmodified regardless and let me decide. After it applies, report the resulting table count, confirm it is exactly 28, and list any table whose foreign keys did not create successfully.

**Success check:** Exactly 28 tables exist in the public schema; the migration file is byte-identical to the source; no FK creation errors.
**Do not continue until:** You have compared the table list in Supabase against the CREATE TABLE list in the SQL file and confirmed a one-to-one match.

---

### Prompt 0027 · Phase 2 — GitHub, Supabase, Environment, Data Safety
**Verify constraints and regenerate types against the real schema**

> Now that the schema is live, verify it properly rather than trusting that the migration reported success. Query the Postgres catalog and produce `docs/SCHEMA-VERIFICATION.md` listing every table with its column count, its primary key, and every foreign key with its referenced table, and compare that against `legacy/seed/schema_supabase.sql` line by line. Flag any constraint present in the file but absent in the database, and any constraint present in the database but absent in the file, because either direction indicates something went wrong. Confirm specifically that `teams` is referenced by `owners` and `stadiums`, since that dependency is called out in my project README as the one that breaks import order if handled wrongly. Then regenerate the TypeScript database types with the `db:types` script and reconcile them against the hand-written domain types built in Phase 1, reporting any mismatch in column name or nullability between the two, since a mismatch means one of them is wrong.

**Success check:** Verification document shows a complete match in both directions; regenerated types compile; any domain-type mismatches are listed explicitly.
**Do not continue until:** Every mismatch between the generated types and the Phase 1 domain types is resolved in favour of the real schema.

---

### Prompt 0028 · Phase 2 — GitHub, Supabase, Environment, Data Safety
**Build the seed import harness before importing anything**

> I have 28 CSV files totalling roughly 25,200 rows that must be loaded into this schema in a specific dependency order, and I want a repeatable harness rather than twenty-eight manual uploads, because I will need to re-run this whenever I reset a development database. Write an import script at `supabase/seed/import.ts` that takes a table name, reads the matching CSV from `legacy/seed/`, and inserts it in batches, reporting rows read, rows inserted, and any row rejected with the reason and the offending values. The script must refuse to run against a table that already contains rows unless I explicitly pass a flag, so I cannot double-import by accident and silently duplicate 3,066 players. It must not create tables, must not alter columns, and must not coerce or clean values — if a value does not fit the column, I want the import to fail loudly and tell me which row, because a coerced value is a data defect that will surface as a wrong number on a screen much later. Do not import anything yet; build and test the harness against a single small table.

**Success check:** Harness runs against `league_conferences` (2 rows) and reports 2 read, 2 inserted, 0 rejected; a second run without the flag refuses.
**Do not continue until:** You have confirmed the refuse-on-non-empty guard works and that no coercion of malformed values occurs.

---

### Prompt 0029 · Phase 2 — GitHub, Supabase, Environment, Data Safety
**Import league structure, teams, stadiums, owners and colleges**

> Import the first block of seed data in strict dependency order using the harness: `league_conferences` first with 2 rows, then `league_divisions` with 8, then `teams` with 32, then `owners` with 32, then `stadiums` with 32, then `colleges` with 260. The order matters and is not negotiable — `teams` must precede both `owners` and `stadiums` because those two carry foreign keys back to it, and importing them first will fail on constraint violations. After each table, report the row count and confirm it matches the expected number exactly. After the block completes, run three specific spot checks and show me the results: confirm all 32 teams resolve to a valid division and conference, confirm every stadium and owner resolves to a real team with no orphans, and confirm the two colour columns on `teams` are populated for all 32 rows, since team identity in this game is expressed entirely through metro area, original nickname and those two colours. Report anything that does not match rather than proceeding past it.

**Success check:** Counts read 2 / 8 / 32 / 32 / 32 / 260 exactly; zero orphaned owners or stadiums; all 32 teams have both colours.
**Do not continue until:** Every count matches and the three spot checks return clean, with no rows rejected.

---

### Prompt 0030 · Phase 2 — GitHub, Supabase, Environment, Data Safety
**Import coaching staff and team schemes**

> Import the coaching block next: `coaches` with 526 rows, then `coach_attributes` with 526, then `team_coaching_staff` with 480, then `team_schemes` with 32. Coaches come before attributes and staff assignments because both depend on them. After the import, verify the relationships rather than just the counts: confirm every row in `coach_attributes` matches exactly one coach with no orphans and no coaches missing attributes, and confirm every row in `team_coaching_staff` resolves to both a real coach and a real team. Report the distribution of staff roles across the 480 assignments so I can see how many head coaches, coordinators and position coaches exist per team, and confirm every one of the 32 teams has exactly one row in `team_schemes`. My simulation derives coach firings from performance measured against talent-based expectations, so an incomplete or orphaned coaching table will produce nonsense as soon as the season loop runs. Tell me about any gap you find rather than working around it.

**Success check:** Counts read 526 / 526 / 480 / 32; one attribute row per coach; zero orphaned staff assignments; all 32 teams have a scheme.
**Do not continue until:** The staff-role distribution looks sane per team and no coach lacks attributes.

---

### Prompt 0031 · Phase 2 — GitHub, Supabase, Environment, Data Safety
**Import the player core and attribute tables**

> Import the largest block: `players` with 3,066 rows, then `player_attributes` with 3,066. These two must match one-to-one — every player has exactly one attributes row and there are no attribute rows without a player. After importing, verify that pairing explicitly and report any player missing attributes or any attributes row orphaned, because a mismatch here corrupts everything downstream. Then report the distribution of overall rating across the population in bands so I can confirm the talent curve survived the import intact: my generator samples overall from a gamma distribution with a compression knee at 87.5, which produces a thick middle and a genuinely thin elite tier, and I expect roughly ten players in the 95–99 band out of 3,066. If the distribution comes back flat or uniform, something went wrong in the import and I need to know immediately rather than discovering it when every team in the league feels identical. Also report the count of distinct positions and the roster-slot distribution.

**Success check:** Both tables read 3,066; one-to-one pairing verified; the OVR histogram shows a thick middle with roughly ten players at 95+.
**Do not continue until:** The talent distribution matches the expected shape and no player lacks attributes.

---

### Prompt 0032 · Phase 2 — GitHub, Supabase, Environment, Data Safety
**Import contracts, morale, traits and injuries**

> Import the four player-detail tables in order: `player_contracts` with 2,880 rows, `player_morale` with 3,066, `player_traits` with 4,333, and `player_injuries` with 309. Note that the counts differ deliberately and that is not an error to correct: 2,880 contracts against 3,066 players is the difference between rostered players and the wider player pool, morale exists for every player, traits average more than one per player, and injuries are a small active subset. Verify that every row in all four tables resolves to a real player with no orphans. Then run the check that matters most: sum the contract cap hits per team and compare each team's total against its row in the `salary_cap` table when that arrives, and for now simply report the per-team totals so I can eyeball whether any team is wildly outside a plausible range. My contracts were normalized to a salary cap during generation, so a team sitting at triple the cap indicates an import defect rather than an interesting roster situation.

**Success check:** Counts read 2,880 / 3,066 / 4,333 / 309; zero orphans across all four; per-team contract totals cluster in a plausible band.
**Do not continue until:** No team's contract total is implausibly outside the range of the others.

---

### Prompt 0033 · Phase 2 — GitHub, Supabase, Environment, Data Safety
**Import rosters and depth charts**

> Import `team_rosters` with 2,880 rows and then `team_depth_charts` with 1,952. After importing, verify the composition rather than only the totals, because roster construction is a correctness property my generator validated and I want to confirm it survived. Report the roster size per team and confirm all 32 are consistent with each other. Report the positional composition of a typical roster — how many quarterbacks, offensive linemen, cornerbacks and so on — so I can see the shape is realistic rather than uniform. Then verify the depth chart integrity: confirm every depth-chart entry references a player who is actually on that team's roster, since a depth chart pointing at a player on another team is exactly the kind of silent corruption that produces an unexplainable lineup six phases later. Confirm every team has a depth-chart entry at every position it needs, and specifically confirm all 32 teams have a starting quarterback assigned, because my advance-week logic treats a missing starting quarterback as a hard block on progression.

**Success check:** Counts read 2,880 / 1,952; consistent roster sizes; every depth-chart entry maps to a same-team roster player; all 32 teams have a starting QB.
**Do not continue until:** No depth-chart entry points at an off-roster player and no team lacks a starter at a required position.

---

### Prompt 0034 · Phase 2 — GitHub, Supabase, Environment, Data Safety
**Import the schedule and bye weeks**

> Import `season_schedule` with 272 rows and `team_bye_weeks` with 32. Then verify the schedule properly, because a malformed schedule breaks the season loop in ways that are tedious to diagnose later. Confirm the 272 games distribute across an 18-week calendar. Confirm every one of the 32 teams appears exactly 17 times as either home or away, and report any team that does not. Confirm every team has exactly one bye week and that the bye week is consistent with the week in which that team has no scheduled game, since those two facts living in separate tables is precisely where inconsistency hides. Confirm every home and away team identifier resolves to a real team. Report the count of games per week so I can see the bye-week distribution across the calendar. If any of these checks fail, stop and tell me exactly which team and which week rather than adjusting the data — the schedule was generated and validated, so a failure here means the import is wrong, not the schedule.

**Success check:** 272 games across 18 weeks; every team appears exactly 17 times; bye weeks reconcile with the schedule gaps for all 32.
**Do not continue until:** Every team's game count is exactly 17 and every bye week matches a genuine gap in that team's schedule.

---

### Prompt 0035 · Phase 2 — GitHub, Supabase, Environment, Data Safety
**Import free agents, draft picks and draft classes**

> Import `free_agents` with 186 rows, `draft_picks` with 448, and `draft_classes` with 392. Verify each against its structure rather than only its count. For free agents, confirm every row resolves to a real player and that none of them also appear on a team roster, since a player cannot simultaneously be rostered and a free agent and that contradiction will poison free-agency logic in Phase 10. For draft picks, confirm the 448 rows distribute sensibly across rounds and that every pick is owned by a real team — my draft is the origin of every future rookie, and a pick owned by a nonexistent team will surface as a crash in Phase 11. For draft classes, report the distribution of prospects by position and the range of their ratings, so I can confirm the incoming talent pool has the same shape as the veteran population rather than being uniformly distributed. Report anything inconsistent instead of correcting it.

**Success check:** Counts read 186 / 448 / 392; no free agent also appears on a roster; every draft pick has a valid owning team; prospect ratings show a realistic curve.
**Do not continue until:** The free-agent and roster sets are provably disjoint and every pick resolves to a real team.

---

### Prompt 0036 · Phase 2 — GitHub, Supabase, Environment, Data Safety
**Import finances, cap, needs, owner goals and provenance**

> Import the final block: `franchise_finances` with 32 rows, `salary_cap` with 32, `team_needs` with 160, `owner_goals` with 96, and `data_provenance` with 27. Then run the reconciliation that has been waiting since the contracts import: for each of the 32 teams, sum the cap hits from `player_contracts` and compare the total against that team's `salary_cap` row, and report the difference for every team as both an absolute figure and a percentage. My contracts were normalized against the cap during generation, so I expect every team to land within a plausible band, and any team wildly over or under indicates an import defect. Also confirm every team has exactly one finances row and one cap row, that `team_needs` averages five per team, and that `owner_goals` averages three per team. Finally, print the contents of `data_provenance` in full — it documents where each table came from and I want it visible in the verification record rather than buried.

**Success check:** Counts read 32 / 32 / 160 / 96 / 27; every team reconciles against its cap within a plausible band; provenance is printed in full.
**Do not continue until:** No team's contract-to-cap reconciliation is an obvious outlier against the other 31.

---

### Prompt 0037 · Phase 2 — GitHub, Supabase, Environment, Data Safety
**Run the full integrity suite and freeze the seed baseline**

> All 28 seed tables are now loaded. Build a repeatable integrity suite at `supabase/seed/verify.ts` that re-runs every check we have performed across the last several prompts in one command, and write its output to `docs/SEED-VERIFICATION.md`. It must assert the exact expected row count for all 28 tables, assert zero orphaned rows across every foreign-key relationship in the schema, assert the one-to-one pairings that must hold, assert roster and depth-chart composition, assert schedule completeness, assert the free-agent and roster sets are disjoint, and assert the per-team cap reconciliation. My original project validated this database with 72 integrity checks, so I expect a comparable number here — report how many distinct assertions your suite makes. Add it to the preflight script. Then commit and tag this state as `seed-baseline`, because this is the known-good database that every future reset restores to, and I need to be able to return here from any later corruption.

**Success check:** The suite runs as one command, makes on the order of 70+ assertions, all pass, and is wired into preflight.
**Do not continue until:** The suite passes fully and the repository is tagged `seed-baseline`.

---

### Prompt 0038 · Phase 2 — GitHub, Supabase, Environment, Data Safety
**Specify the missing runtime schema before creating any of it**

> My existing 28-table schema describes the starting world of the league, but it contains nothing for a game that is actually being played — I searched it for save, user, auth and policy and found zero matches. Before you create a single table, write `docs/RUNTIME-SCHEMA-SPEC.md` proposing the missing layer, and stop there for my review. It needs to cover: user accounts and save slots, with a save being the unit that owns all mutable game state; calendar state holding season, week and phase; game results and box scores; standings; per-season player statistics and per-season performance grades held as separate concerns; awards, ballots, honours and league records; transactions covering signings, releases, trades and draft selections; news items; in-game draft classes and scouting reports; and coach employment history. For each proposed table, state its purpose, its key columns, its relationship to the seed tables, and critically its expected row growth per simulated season. Do not create anything yet. I want to review the growth estimates before committing, because at roughly ten thousand rows per season across fifty seasons this decides whether long saves are viable.

**Success check:** Spec covers all listed areas with per-season growth estimates and explicit relationships back to the 28 seed tables.
**Do not continue until:** You have read the growth estimates, summed them across 50 seasons, and decided what persists versus what derives on read.

---

### Prompt 0039 · Phase 2 — GitHub, Supabase, Environment, Data Safety
**Create the save-slot and user-state tables**

> Implement the first part of the runtime schema as a migration, covering identity and save state only. Create tables for the user profile, for save slots owned by a user, and for the calendar state of each save holding the current season year, current week, and current phase of the league year. A save slot must record which team the user controls, when it was created, when it was last played, and enough summary metadata to render a save-select screen without loading the entire save. The critical design point is that every piece of mutable game state created from here on carries a save-slot reference, so that two saves on the same account are completely isolated and one cannot read or write the other's league. Do not add game results, statistics or transactions in this migration — those come next and I want the identity layer reviewed on its own. Do not create any table whose name is a near-duplicate of an existing one, and before creating anything, list the current 28 table names and confirm none of your proposed names collide.

**Success check:** Migration applies cleanly, the table count rises from 28 to the expected new total, and every new table carries a save-slot reference where appropriate.
**Do not continue until:** You have confirmed no new table name is a near-duplicate of a seed table name.

---

### Prompt 0040 · Phase 2 — GitHub, Supabase, Environment, Data Safety
**Create the results, standings, statistics and grades tables**

> Implement the second part of the runtime schema: game results with box scores, standings, per-season player statistics, and per-season performance grades. The single most important constraint in this migration is the regular-season and playoff separation. My exported data keeps them strictly apart and a validation confirmed zero profiles with duplicate season-and-competition rows, so every statistics and grades table must carry a competition column and a uniqueness constraint on the combination of save, player, season and competition — that constraint is what makes it structurally impossible for a later bug to merge a player's seventeen-game regular season with his four playoff games. Model statistics and grades as separate tables rather than columns on one table, because in my engine ability, statistics, performance grade, reputation and narrative are deliberately separate objects and the OVR-to-grade correlation is 0.57 by design. Match the column shape of my exported history CSVs so the existing forty thousand rows can be loaded into this schema unchanged.

**Success check:** Migration applies; the uniqueness constraint on save-player-season-competition exists; statistics and grades are separate tables matching the export column shape.
**Do not continue until:** You have attempted to insert a duplicate season-and-competition row and confirmed the database rejects it.

---

### Prompt 0041 · Phase 2 — GitHub, Supabase, Environment, Data Safety
**Create the awards, records, transactions and news tables**

> Implement the third part of the runtime schema: award voting and winners, All-Pro and All-Star selections, player honours, league and franchise records, the transaction ledger, and news items. Model award voting to hold full ballots rather than only winners, because my engine runs fifty simulated voters across seven archetypes and the ballot detail with vote bars is already a working screen in my prototype that I am not willing to lose. Model honours as a per-player, per-season, per-honour row so a player profile can list a career of honours cheaply. Model the transaction ledger as a single append-only table covering signings, releases, trades, draft selections and waiver claims with a discriminating type column, rather than five separate tables, since every one of them needs the same chronological presentation in a transactions screen. Model news items so that each carries a structured entity reference rather than only display text, because in my prototype news headlines are tappable navigation into player and team profiles and that must survive.

**Success check:** Migration applies; ballots store per-voter detail; the transaction ledger is one append-only typed table; news rows carry structured entity references.
**Do not continue until:** You have confirmed a news row can hold a player reference that the entity router can resolve, not just a string.

---

### Prompt 0042 · Phase 2 — GitHub, Supabase, Environment, Data Safety
**Load six seasons of exported history as the reference save**

> I have sixteen exported history CSVs holding roughly forty thousand rows from six validated simulated seasons — 10,117 player-season statistics rows, 10,117 grade rows, 10,087 team-history rows, 3,666 career-stat rows, 791 honours, 480 All-Star selections, 276 All-Pro selections, 192 preseason expectations, 154 award-voting rows, 90 coach seasons, 71 record-history rows, 66 season leaders, 35 season awards and 33 league records, plus two five-thousand-row game-log samples. Create a designated reference save slot and import all of it into the runtime tables built in the last three prompts. This is not a demo fixture — it is the single most valuable verification asset in the project, because it is known-good output from a calibrated engine, and every screen I build from Phase 5 onwards will be validated against it. Report the row count landed in each table and flag any column in the CSVs that has no home in the schema, since that indicates the schema is incomplete rather than the data being wrong.

**Success check:** All sixteen files import with counts matching the source; a reference save exists containing six seasons; unmapped columns are reported explicitly.
**Do not continue until:** Every unmapped column is resolved by extending the schema, never by discarding data.

---

### Prompt 0043 · Phase 2 — GitHub, Supabase, Environment, Data Safety
**Apply deny-by-default row-level security across every table**

> Secure the database now, before any application code reads from it, because retrofitting row-level security across roughly fifty tables after screens depend on them is far harder than doing it first. Enable RLS on every table in the public schema with no exceptions, and default everything to deny. Then add policies expressing the real access model: the 28 seed tables describing the starting world are readable by any authenticated user and writable by nobody through the client, since only server-side simulation may modify them; every runtime table carrying a save-slot reference is readable and writable only by the user who owns that save slot; and the reference save containing my six seasons of history is readable by everyone and writable by nobody. Write the policies as migrations, not dashboard clicks. Then write a test that authenticates as one user, creates a save, authenticates as a second user, and asserts the second cannot read or write the first's rows, and add it to preflight.

**Success check:** RLS is enabled on every public table; the cross-user isolation test passes; seed tables reject client writes.
**Do not continue until:** You have watched the isolation test fail when a policy is deliberately loosened, proving it genuinely tests something.

---

### Prompt 0044 · Phase 2 — GitHub, Supabase, Environment, Data Safety
**Phase 2 exit audit and database baseline tag**

> Audit the database layer before we start building the interface on top of it, and write `docs/PHASE-02-AUDIT.md` from the live database rather than from what the prompts requested. Report the total table count and list every table grouped as seed, runtime or system. Confirm all 28 seed tables hold their exact expected row counts. Confirm the integrity suite passes and state how many assertions it makes. Confirm RLS is enabled on every public table with no exceptions and list any table where it is not. Confirm every migration in `supabase/migrations/` has been applied and that no schema drift exists between the files and the live database. Confirm the six-season reference save is present and complete. Then tell me plainly what worries you about this schema, particularly around row growth over a fifty-season save, and list anything you were asked to do that you could not do properly. Finally, state what still does not exist: no simulation, no screens, no navigation implementation, no save creation flow.

**Success check:** Audit reports the full table inventory, exact seed counts, zero RLS gaps, zero migration drift, and a complete reference save.
**Do not continue until:** Every gap is closed, preflight is green, and the repository is tagged `phase-02-complete`.

---
---

# PHASE 3 — Component Split and App Shell Stabilization
*Prompts 0045–0092*

---

### Prompt 0045 · Phase 3 — Component Split and App Shell Stabilization
**Implement the navigation stack to contract**

> Implement the navigation stack specified in `docs/NAVIGATION-CONTRACT.md` as real code in `src/app/navigation/`. Every frame on the stack stores the screen identity, its parameters, and its UI state as three distinct concerns, and the three operations are push, back and replace-root with the semantics already documented. This is the single most load-bearing piece of code in the entire application, because every screen across the remaining fifteen phases depends on it behaving correctly, so implement it as a small, well-tested, dependency-free state machine rather than reaching for a routing library whose model does not match this contract. The UI-state portion of a frame must be extensible — screens will register their own state shape — but restoring it must be automatic rather than something each screen remembers to do, because any behavior that relies on every screen remembering will eventually be forgotten by one of them. Write unit tests covering push then back, replace-root clearing the stack, and back at the root of the stack.

**Success check:** All three operations are unit-tested; replace-root does not grow the stack; back at root is handled explicitly.
**Do not continue until:** The stack has test coverage for every operation and no screen code is required to manually restore its own state.

---

### Prompt 0046 · Phase 3 — Component Split and App Shell Stabilization
**Capture and restore scroll offset per frame**

> Extend the navigation stack so every frame captures its scroll offset when it is pushed away from and restores it exactly when it is returned to. This is the specific behavior my prototype gets right and most implementations get wrong, and it is the difference between a list feeling like a real application and feeling like a website. Capture the offset at the moment of navigation rather than continuously on scroll, since a scroll listener firing on every frame in a long virtualized roster list is a performance problem I do not want to create. Restore after the returning screen has rendered its content, not before, or the restore will apply to a shorter list and land at the wrong place. Handle the case where the returning screen's content is shorter than it was — clamp rather than leaving the user in blank space. Write an end-to-end test that scrolls a long list, navigates away, navigates back, and asserts the offset is restored within a pixel or two.

**Success check:** The end-to-end test scrolls, navigates, returns and finds the same offset; no scroll listener runs continuously.
**Do not continue until:** Restoration works on a list long enough to require real scrolling and does not flash at the top before settling.

---

### Prompt 0047 · Phase 3 — Component Split and App Shell Stabilization
**Capture and restore tabs, filters and sort order**

> Complete the frame UI-state model by capturing the remaining three components: the active tab, any applied filter chips, and the current sort order. Give screens a single hook that registers their UI state with the current frame, so that declaring the state and having it preserved are the same action and a screen cannot accidentally opt out. Then verify the exact sequence my contract calls out and which my prototype gets right: from the league grade leaderboard, filter to cornerbacks, scroll, open a player profile, and press back — the leaderboard must return with the cornerback filter still applied, the same sort order, and the same scroll position. Write that specific sequence as an end-to-end test, because it is the canonical proof that the contract is satisfied and I want it running in CI on every push for the rest of the project. Also handle a subtle case: if a screen appears twice in the stack with different filters, each frame keeps its own state independently.

**Success check:** The league → filter CB → scroll → open player → back sequence restores filter, sort and offset; the same screen twice in the stack keeps independent state.
**Do not continue until:** The canonical sequence test is in CI and passing.

---

### Prompt 0048 · Phase 3 — Component Split and App Shell Stabilization
**Build the five-destination bottom navigation**

> Build the bottom navigation exactly as my prototype defines it: five destinations arranged as Home, Team, a raised contextual centre control, League, and Inbox. The centre control is physically raised above the bar and is visually the primary action of the entire application, because it is how the game advances and everything else is inspection. The four flanking destinations use replace-root rather than push, so tapping Home from four levels deep inside League returns to Home with a clean stack rather than accumulating frames forever. Style it from the tokens, respect the iOS home-indicator safe area so the bar is not overlapped on a modern iPhone, and give every target a touch area of at least forty-four pixels square. Do not implement the centre control's label logic or its blocking behavior in this prompt — that is next, and it is more complex than it appears. For now the centre control is present, correctly styled, correctly raised, and does nothing when tapped.

**Success check:** Five destinations render, the centre control is raised, tapping a flanking destination replaces rather than grows the stack, all targets are 44px or larger.
**Do not continue until:** Tested at 320px with no overlap or truncation, and confirmed the bar clears the home indicator.

---

### Prompt 0049 · Phase 3 — Component Split and App Shell Stabilization
**Make the advance control contextual to the calendar phase**

> The raised centre control is the spine of this game and its label changes with where the league year currently sits, so build that now against the calendar state stored in the save. During the regular season it advances a week; at the end of the regular season it moves into the playoffs; through the playoffs it advances a round; after the championship it enters the offseason; and through the offseason it moves through retirements, progression, free agency, the draft and back to a new season. Read the current phase from the save's calendar row and render the appropriate label and a short secondary line giving context, such as the current week and season year. Do not hardcode a season year or a week number anywhere — my prototype has 2031 and Week 18 baked into the markup and that is exactly the shape of bug I am rebuilding to eliminate. Do not implement the actual advancement yet; this prompt is the label, the phase awareness and the disabled state only.

**Success check:** The control's label changes correctly when the calendar row is manually edited through every phase; no year or week appears as a literal in source.
**Do not continue until:** You have grepped the source for `2031` and `Week 18` and confirmed neither appears outside `legacy/`.

---

### Prompt 0050 · Phase 3 — Component Split and App Shell Stabilization
**Surface genuine blocks on progression without nagging**

> My advance control has a deliberate design rule: it interrupts only when something genuinely blocks progress, such as a missing starting quarterback or a roster-size violation, and otherwise it is a single tap with no confirmation dialogue. Build that behavior as a blocking-condition system where each condition has an identifier, a human-readable explanation of what is wrong, and a direct navigation target that takes the user to the screen where they can fix it — telling someone their roster is invalid without taking them to the roster is a hostile design. Implement two conditions now against real data: no starting quarterback on the depth chart, and a roster outside legal size limits. Render blocks as a sheet listing each problem as a tappable row. Critically, do not invent warnings that are merely advisory, and do not block on anything a competent manager might legitimately choose — an unhappy player or an unfilled need is not a block, and turning advisory information into an interruption is how a game becomes exhausting to play.

**Success check:** Deliberately clearing a team's starting QB blocks advancement with a tappable explanation; a legal roster advances with a single tap and no dialogue.
**Do not continue until:** You have confirmed no advisory-only condition blocks progression.

---

### Prompt 0051 · Phase 3 — Component Split and App Shell Stabilization
**Integrate hardware and browser back**

> Wire the platform back affordances into the navigation stack so they behave the way users expect on each platform. On Android, the hardware back button pops the stack, and at the root of the stack it follows the platform convention of backgrounding rather than exiting to a blank screen. In the browser, the back button pops the stack rather than leaving the application, which requires synchronising history entries with stack frames — push a history entry on push and consume one on back — and doing so carefully enough that the two cannot drift out of alignment and produce a state where one back press does nothing. On iOS in a wrapped context, support the edge-swipe gesture as a pop. In every case, the state restoration built earlier must apply identically, so a hardware back restores filters and scroll offset exactly as an in-app back does. Test each path explicitly, including rapid repeated presses, which is where synchronisation bugs surface.

**Success check:** Browser back pops one frame and restores state; rapid repeated presses do not desynchronise history from the stack; at root the platform convention is followed.
**Do not continue until:** You have pressed back rapidly ten times from four levels deep and confirmed the stack and history stay aligned.

---

### Prompt 0052 · Phase 3 — Component Split and App Shell Stabilization
**Give screens addressable URLs without breaking the stack**

> Add URL synchronisation so screens are addressable, which I need for testing, for deep links from notifications later, and for reloading during development without losing my place. Each screen and its parameters map to a URL, and loading that URL directly constructs a sensible stack rather than a single orphaned frame with no way back — landing on a player profile from a cold URL should produce a stack that allows backing out to something coherent. Keep the URL as a projection of the stack rather than the source of truth, because the stack holds UI state that does not belong in a URL and inverting that relationship will break the restoration behavior built earlier. Do not put filter and sort state into the URL. Handle unknown or malformed URLs by landing on a known screen rather than crashing, and handle a URL referring to an entity that does not exist by surfacing the missing-data boundary honestly rather than rendering an empty profile.

**Success check:** Reloading on a deep screen restores that screen with a coherent back path; filters do not appear in URLs; a malformed URL lands somewhere sane.
**Do not continue until:** A URL for a nonexistent player id shows the missing-data boundary rather than a blank profile.

---

### Prompt 0053 · Phase 3 — Component Split and App Shell Stabilization
**Build the typed screen registry**

> Replace my prototype's pattern of a `SCREENS` object holding functions that return HTML strings with a properly typed screen registry in `src/app/screens.ts`. Each screen registers an identifier, a typed parameter shape, its React component, and its title-resolution logic. Make the parameter types genuinely enforced, so that navigating to a player screen without a player id is a compile error rather than a runtime blank page — my prototype passes parameters as untyped object literals inside template strings and that class of bug is invisible until someone taps the wrong row. Include all seventeen screen identifiers from the prototype manifest so the registry is complete from the start, with components that render an explicit not-yet-built state for the ones we have not reached. Wire the registry into the navigation stack so pushing an unregistered identifier is a compile error too. Do not implement screen content in this prompt; this is the registry, the typing and the wiring.

**Success check:** All seventeen identifiers are registered; pushing a screen with wrong or missing parameters fails to compile; unregistered identifiers fail to compile.
**Do not continue until:** You have deliberately pushed a player screen with no id and confirmed TypeScript rejects it.

---

### Prompt 0054 · Phase 3 — Component Split and App Shell Stabilization
**Guard screens that require a loaded save**

> Almost every screen in this game is meaningless without a loaded save, since the roster, the calendar and the standings all belong to a save slot rather than to the application. Build a guard in the shell that checks for a loaded save before rendering any screen that requires one, and routes to save selection when there is none, preserving the intended destination so the user lands where they were going after loading. Distinguish clearly between three states that are easy to conflate and produce confusing behavior: no user is authenticated, a user is authenticated but has no saves, and a save exists but is not currently loaded. Each needs a different response, and rendering the same empty state for all three will confuse both me and the eventual player. Mark in the screen registry which screens require a save, and make that a required field so a future screen cannot be added without the question being answered.

**Success check:** Requiring a save routes to save selection and returns to the intended screen after load; the three states produce three distinct behaviors.
**Do not continue until:** Adding a screen to the registry without declaring its save requirement fails to compile.

---

### Prompt 0055 · Phase 3 — Component Split and App Shell Stabilization
**Extract the screen header as a component**

> My prototype builds its header inline in every screen as a template literal, producing a coloured team accent bar, a title line, a subtitle line and one or two icon buttons. Extract that into a single `<ScreenHeader>` component with a typed interface taking a title, an optional subtitle, an optional accent colour, an optional back affordance and an optional set of actions. Reproduce the prototype's proportions and typography faithfully — the title uses the condensed scoreboard face and the subtitle uses the body face, and that pairing is deliberate. The accent bar takes its colour from the team's primary colour in the `teams` table, which is how team identity is expressed in this project since we use no marks or logos. Handle long titles by truncating rather than wrapping to a second line and shifting the layout. The back affordance appears when the stack has depth and disappears at the root, driven by the stack rather than by a prop each screen passes, so no screen can get it wrong.

**Success check:** One header component serves every screen; the accent reads from real team colour data; the back affordance is stack-driven, not prop-driven.
**Do not continue until:** A very long team name truncates cleanly at 320px without shifting the header layout.

---

### Prompt 0056 · Phase 3 — Component Split and App Shell Stabilization
**Build the list row primitive**

> Nearly every screen in this game is a list of rows — roster players, standings teams, leaderboard entries, news items, transactions, ballot placements. Build one `<ListRow>` primitive that serves all of them, with slots for a leading element such as a rank or position badge, a primary line, a secondary line, a trailing value area, and an optional chevron indicating navigation. Make it composable rather than configuration-driven: I would rather assemble rows from small pieces than pass fifteen boolean props to one component that renders every variant. Ensure the entire row is a single touch target of at least forty-four pixels in height when it navigates, and that it renders as a non-interactive element when it does not, because a row that looks tappable and is not is a real usability failure on a phone. Make it work with `EntityLink` so a row that opens a player, team or coach goes through the universal entity router rather than constructing a route by hand.

**Success check:** One row primitive composes into roster, standings and leaderboard shapes; navigating rows go through `EntityLink`; touch targets are 44px minimum.
**Do not continue until:** No screen has its own row implementation and non-navigating rows are visibly distinct from navigating ones.

---

### Prompt 0057 · Phase 3 — Component Split and App Shell Stabilization
**Build the section and card primitives**

> Build the two container primitives that structure every screen: a `<Section>` with a heading and optional trailing action for grouping related content, and a `<Card>` as the raised surface my prototype uses for dashboard panels. Take the surface colours, borders and elevation from the tokens rather than inventing new values, since the palette deliberately distinguishes the base ink, the panel surface and the raised surface, and blurring those levels will flatten the interface. Sections need a consistent vertical rhythm between them so screens do not need to manage their own spacing, and cards need to handle a header, a body and an optional footer without each usage reinventing the arrangement. Neither may set a fixed width; both fill their container and inherit the 520px shell cap. Add both to the component gallery route so I can see them in isolation, and confirm they compose sensibly when a card contains a table that scrolls horizontally inside its own container.

**Success check:** Section and card render from tokens with consistent rhythm; a card containing a wide table scrolls the table without scrolling the page.
**Do not continue until:** Neither primitive sets a fixed width and both look correct at 320px and 520px.

---

### Prompt 0058 · Phase 3 — Component Split and App Shell Stabilization
**Build the statistics table primitive**

> Build the `<StatTable>` component that presents dense numeric data, which this game does constantly — season statistics, career lines, box scores, grade breakdowns. It always renders inside the `TableScroll` container so wide tables scroll within their own bounds and never scroll the page, and it must support a frozen first column holding the row label, because a season table scrolled to its rightmost columns is useless if you can no longer see which season each row is. Use tabular figures so numbers align vertically down each column; proportional digits in a statistics table look wrong in a way people feel without being able to name. Support right-aligned numerics and left-aligned labels, per-column formatting, and an optional emphasis on a leading or best value. Handle null explicitly and visibly, since a large number of my players carry a genuinely null overall rating and displaying that as a zero would state something false. Add it to the gallery with a deliberately wide example.

**Success check:** A twelve-column table scrolls inside its container with the first column frozen; digits align; nulls render as an explicit unavailable state, not zero.
**Do not continue until:** Tested at 320px with the page not scrolling horizontally and the frozen column staying legible.

---

### Prompt 0059 · Phase 3 — Component Split and App Shell Stabilization
**Build the tab control and register its state**

> Build the `<Tabs>` primitive used on screens that segment content, most importantly the player profile with its Overview, Stats, Grades, Career and Honours sections. The active tab is part of frame UI state, so the component must register with the navigation stack automatically rather than requiring each screen to remember to preserve it — that is exactly the sort of per-screen obligation that gets forgotten and produces a back button that loses your place. Tabs must be horizontally scrollable when they exceed the viewport width at 320px, scrolling within their own bounds. Give the active tab a clear indicator drawn from the tokens and make each tab a proper touch target. Keep it distinct from the competition toggle built in Phase 1 — that control is a separate, single-purpose component for the regular-season and playoff split, and merging the two would eventually let someone render a competition selector that behaves like a generic tab set.

**Success check:** Tab state survives navigation away and back without screen-level code; tabs scroll within their bounds at 320px; the competition toggle remains separate.
**Do not continue until:** A screen with tabs restores its active tab automatically after a push and a back.

---

### Prompt 0060 · Phase 3 — Component Split and App Shell Stabilization
**Build the filter chip row**

> Build the `<FilterChips>` primitive for the filtering my prototype uses on grade leaderboards and roster views, most notably filtering by position. Like tabs, active filters are frame UI state and must register with the navigation stack automatically, since the canonical restoration sequence in my contract is precisely filtering to cornerbacks, opening a player, and coming back to find the filter intact. Support both single-select and multi-select modes, since filtering to one position and filtering to a group of positions are both real needs. The chip row scrolls horizontally within its own bounds when it exceeds the viewport, which it will with a full position list at 320px. Show clearly when a filter is active and make clearing it a single obvious action. Make the component agnostic about what it filters — it takes options and reports selection, and the screen owns the filtering logic, so the same component serves positions, seasons, conferences and transaction types without modification.

**Success check:** Filter selection survives navigation automatically; the chip row scrolls within bounds at 320px; clearing is one action.
**Do not continue until:** The canonical filter-restoration test from Prompt 0047 passes using this component.

---

### Prompt 0061 · Phase 3 — Component Split and App Shell Stabilization
**Build the sort control**

> Build the `<SortControl>` primitive for the sorting my prototype offers, including the roster's four sort modes. Sort state is frame UI state and registers with the navigation stack automatically, consistent with tabs and filters. Present sorting as an explicit control rather than tappable column headers, because tappable headers work poorly on a phone where columns are narrow and precise taps are hard, and because a header that sorts one table and navigates on another teaches the user nothing reliable. Show the current sort field and direction plainly, and make reversing direction one tap. Keep the component agnostic about the data — it takes a list of sortable fields with labels and reports the selection, while the screen performs the sort — so the same control serves the roster, standings, leaderboards and the record book. Ensure sorting is stable, so that rows with equal values do not shuffle unpredictably each time the sort is reapplied.

**Success check:** Sort state survives navigation automatically; direction reverses in one tap; equal values maintain stable relative order.
**Do not continue until:** Applying the same sort twice produces identical row order both times.

---

### Prompt 0062 · Phase 3 — Component Split and App Shell Stabilization
**Build the bottom sheet**

> Build the `<Sheet>` primitive that replaces my prototype's `menuSheet`, as the standard way this application presents secondary actions, contextual menus and short forms on a phone. It rises from the bottom edge, dims the content behind it, dismisses on backdrop tap and on downward swipe, and traps focus while open so keyboard and screen-reader navigation cannot wander into the content underneath. It must interact correctly with the navigation stack: an open sheet is dismissed by the back affordance rather than the back affordance navigating away and leaving the sheet orphaned over a different screen, which is a bug that appears immediately if the two systems do not know about each other. Support a compact size for short action lists and a taller size for content that needs room. Respect the safe area at the bottom edge. Add it to the gallery with both sizes and confirm behavior at 320px where vertical space is tight.

**Success check:** The sheet dismisses on backdrop tap, swipe and back; focus is trapped while open; back does not navigate away with a sheet open.
**Do not continue until:** Opening a sheet and pressing hardware back closes the sheet and leaves the screen unchanged.

---

### Prompt 0063 · Phase 3 — Component Split and App Shell Stabilization
**Build the toast and inline alert**

> Build two feedback primitives with clearly different purposes. A `<Toast>` for transient confirmations of completed actions — a contract signed, a trade sent — appearing briefly and dismissing itself without demanding attention, positioned to clear the raised centre control rather than sitting under it. An `<InlineAlert>` for persistent conditions belonging to a specific place on a screen, such as a warning that a player's contract expires after this season, rendered in place next to what it concerns rather than floating. Draw the severity styling from the tokens using amber for caution and red for problems, and make severity legible from more than colour alone through an icon and the wording, since colour-only severity fails for a meaningful share of players. Never use a toast for anything the user must act on, and never use either for simulation results, which belong in the news feed and the inbox where they persist and can be reviewed.

**Success check:** Toasts clear the raised centre control and self-dismiss; inline alerts render in place; severity is legible in greyscale.
**Do not continue until:** No blocking condition or required action is communicated through a toast.

---

### Prompt 0064 · Phase 3 — Component Split and App Shell Stabilization
**Build honest empty and unavailable states**

> Build the `<EmptyState>` primitive and establish the rule it enforces. There are three genuinely different situations that lazy implementations collapse into one and thereby lie to the user: there is legitimately nothing here yet, such as a transaction ledger in the first week of a save; the feature exists but is not built yet, which is true of six screens in my prototype; and the data should exist but is missing, which is a defect. Each gets a visually distinct treatment and honest wording. My prototype's approach to unbuilt features is to say so plainly rather than fake depth with placeholder rows, and I want that preserved exactly — a trade centre showing invented offers would be worse than one that says the trade engine is not built yet. Wire the third case to the missing-data boundary from Phase 1 so it names the table and column in development. Never render a plausible-looking fabricated row in any of the three cases.

**Success check:** Three distinct states render distinctly; the unbuilt state states so plainly; the missing state names the table and column in development.
**Do not continue until:** No empty state anywhere renders sample or placeholder data rows.

---

### Prompt 0065 · Phase 3 — Component Split and App Shell Stabilization
**Build loading skeletons that match final layout**

> Build a `<Skeleton>` primitive and skeleton variants matching the shapes of the list row, the card and the statistics table, so loading states occupy the same space the real content will and the layout does not shift when data arrives. Layout shift on arrival is one of the most noticeable quality failures on a phone and it is entirely avoidable. Establish the timing rules and document them: content that resolves quickly should not flash a skeleton at all, since a skeleton appearing and vanishing within a fraction of a second reads as a glitch rather than as feedback, so introduce a short delay before showing one; and once shown, a skeleton stays visible for a minimum duration to avoid the same flicker on the way out. Respect reduced-motion preferences by rendering a static placeholder rather than a shimmer. Never show a skeleton for content that has failed — a failure is a boundary state, and a skeleton that never resolves is indistinguishable from a hang.

**Success check:** Skeletons match final layout with no shift on arrival; fast content shows no skeleton; reduced motion disables the shimmer.
**Do not continue until:** A simulated failure shows the error boundary rather than an indefinite skeleton.

---

### Prompt 0066 · Phase 3 — Component Split and App Shell Stabilization
**Scope error boundaries per screen and per section**

> Extend the `<DataBoundary>` from Phase 1 into a proper two-level error architecture. A screen-level boundary catches failures that make the whole screen meaningless, and a section-level boundary catches failures confined to one panel — so if the news panel on the home dashboard fails, the standings and the record beside it still render, rather than the entire dashboard collapsing because of one query. Each boundary reports what failed with enough specificity to act on: which screen, which section, which table and column, and which entity was being resolved. Add a retry affordance that re-runs only the failed query rather than reloading the whole application, since a full reload on a phone loses the navigation stack and the user's place. Log failures with the current screen and parameters attached so I can reproduce them from a report. In production keep the wording honest and neutral, never inventing an explanation and never implying the data is merely still loading.

**Success check:** A failing section leaves the rest of the screen intact; retry re-runs only that query; failure logs carry screen and parameters.
**Do not continue until:** You have forced a single panel to fail and confirmed the surrounding screen and the navigation stack are unaffected.

---

### Prompt 0067 · Phase 3 — Component Split and App Shell Stabilization
**Establish the typography scale**

> Establish the typographic system properly, since my prototype pairs two faces deliberately and the pairing carries meaning. Barlow Condensed is the scoreboard face used for numbers and screen titles; Inter is the body face used for prose and tabular data. Define a scale in `src/app/typography.ts` with named roles rather than raw sizes — screen title, section heading, row primary, row secondary, statistic value, statistic label, caption — so that screens reference roles and I can retune the scale globally without touching two hundred components. Self-host both faces with only the weights actually used, and preload them, because a font swap on a statistics-dense screen produces visible reflow. Ensure numerals are tabular wherever numbers align in columns. Set line heights that suit a dense information display rather than an article, and confirm the smallest role remains legible at 320px on a real device rather than only in a desktop browser scaled down.

**Success check:** Roles are named rather than sized at call sites; both faces self-host with minimal weights; tabular numerals align in tables.
**Do not continue until:** No visible font swap occurs on load and the smallest role is legible on an actual phone.

---

### Prompt 0068 · Phase 3 — Component Split and App Shell Stabilization
**Build the number and unit formatting layer**

> Build `src/lib/format.ts` centralising every numeric presentation in this game, because inconsistent formatting across screens is one of those flaws that reads as amateurism without the player being able to say why. Cover: overall ratings as integers with an explicit unavailable state for the null case that a large part of my player population carries; performance grades to one decimal; percentages consistently; contract values and cap figures in a compact readable form; yardage and counting statistics; win-loss records; and dates and season years. Then handle the case my exported data proves is real: my kicker rows carry `longest_fg` values in the hundreds because a season sum was written into a field meant to hold a single longest attempt. The formatter must never disguise that. Add a development-mode range check that flags a value implausible for its field, so defects surface as loud warnings during development rather than as quietly wrong numbers on screen. Fix the underlying data in the engine later, never in the formatter.

**Success check:** All numeric formatting routes through one module; nulls render as unavailable, never zero; the range check flags a 720-yard longest field goal.
**Do not continue until:** You have confirmed the formatter warns rather than silently reformatting the known-bad kicker values.

---

### Prompt 0069 · Phase 3 — Component Split and App Shell Stabilization
**Build team identity without marks or logos**

> Build the `<TeamIdentity>` component expressing a team visually from what my database actually contains and what my IP policy permits: the metro area, the original nickname, and the two colours stored on the `teams` table. Provide three sizes — a compact form for list rows showing an abbreviation and a colour accent, a medium form for headers, and a large form for the team screen. Generate the visual mark procedurally from the two colours and the abbreviation as a geometric badge or wordmark. Do not fetch, embed, generate or approximate any real team logo, and do not produce a mark that resembles one. Handle the contrast problem honestly: several teams in my data carry very dark or near-white secondary colours, so compute contrast at render time and adjust the foreground rather than assuming, or some teams will render illegibly. Verify every one of the 32 teams renders legibly at every size before you consider this done.

**Success check:** All 32 teams render legibly at all three sizes; marks are generated procedurally; no external logo asset exists anywhere.
**Do not continue until:** You have viewed all 32 teams at compact size and confirmed none is illegible or low-contrast.

---

### Prompt 0070 · Phase 3 — Component Split and App Shell Stabilization
**Build the player identity row**

> Build the `<PlayerIdentity>` component that presents a player consistently everywhere he appears — the roster, the depth chart, leaderboards, ballots, All-Pro teams, search results, news. My prototype's most important navigational guarantee is that a player is the same player everywhere, and a shared identity component is what makes that visible as well as structurally true. It shows the name, the position badge, the team accent, and either the ability dial or the performance chip depending on context, never both at once and never one styled to look like the other. It routes through `EntityLink` so every appearance opens the same profile. Handle the real data: players with a null overall rating render the dial's unavailable state, and players with an empty team value are retired or unsigned and must render as such rather than showing a blank accent that looks like a rendering failure. Support compact and full densities.

**Success check:** One component serves every player appearance; null OVR and empty team render as explicit states; every instance routes through `EntityLink`.
**Do not continue until:** A retired player with no team renders as clearly retired rather than as a broken row.

---

### Prompt 0071 · Phase 3 — Component Split and App Shell Stabilization
**Build the position badge**

> Build the `<PositionBadge>` component for the position labels appearing on virtually every player row. Read the actual set of positions from the `players` table rather than hardcoding a list, since my database is the authority on what positions exist in this game and a hardcoded list will drift the moment the engine generates something unexpected. Group positions into offence, defence and special teams and give each group a subtle distinguishing treatment drawn from the tokens, so a roster list is visually scannable by unit without the user reading every label. Keep the badge compact enough for a dense list row at 320px while remaining legible. Do not colour badges using the grade ramp — that ramp means performance and reusing it for position would break the visual language the whole interface depends on. Confirm every position present in the seed data renders correctly, including the ones with longer labels that are most likely to overflow a fixed-width badge.

**Success check:** The position set derives from the database; groups are visually distinguishable; the grade ramp is not reused; every real position renders without overflow.
**Do not continue until:** You have rendered every distinct position in the seed data and confirmed none truncates or overflows.

---

### Prompt 0072 · Phase 3 — Component Split and App Shell Stabilization
**Build the injury and availability indicator**

> Build the `<AvailabilityIndicator>` component surfacing a player's status from the `player_injuries` table, which currently holds 309 active rows. Availability is a distinct concept from ability and from performance and must therefore be a third visual language, not a variation on the dial or the chip — the interface already teaches that circles mean ability and left-edged chips mean performance, and a third meaning wearing either shape would corrupt both. Show severity and expected duration where the data provides them, and make status legible without colour alone. Distinguish honestly between a player who is out, a player who is limited, and a player whose status is genuinely unknown, and never render unknown as healthy, because a lineup decision made on a false healthy indicator is a real betrayal of the player's trust. Handle the majority case efficiently: most players have no injury row at all, and the absence of a row means available, which must not trigger the missing-data boundary.

**Success check:** Availability uses a third distinct visual language; unknown is distinguishable from healthy; players with no injury row render as available without a boundary error.
**Do not continue until:** You have confirmed all 309 injury rows render and that uninjured players do not trip the missing-data path.

---

### Prompt 0073 · Phase 3 — Component Split and App Shell Stabilization
**Establish the icon system**

> Establish the icon system with the constraint that everything must be original or properly licensed for commercial use, since this application is going to be sold. Choose one openly licensed icon set with a permissive licence, or generate a small original set, and record the licence in `docs/IP-POLICY.md` alongside the naming rules. Use a single consistent stroke weight and optical size — mixing icon families is one of the most visible signs of an assembled rather than designed product. Keep the set deliberately small: navigation destinations, back, close, search, menu, sort, filter, and a handful of status marks. Do not use any icon that depicts a real league mark, a real team mark, or a recognisable branded object. Icons are never the sole carrier of meaning; every one is accompanied by a label or has an accessible name, because an unlabelled icon is a puzzle. Render them as inline SVG components sized from the typography scale so they align optically with adjacent text.

**Success check:** One family, one stroke weight, licence recorded; every icon has an accessible name; no icon resembles a real mark.
**Do not continue until:** You have confirmed the licence permits commercial use in a paid application and written it into the IP policy.

---

### Prompt 0074 · Phase 3 — Component Split and App Shell Stabilization
**Define the screen scaffold pattern**

> Before we build seventeen screens, define the pattern every one of them follows and write it into `docs/SCREEN-PATTERN.md` with a reference implementation. A screen is a component under `src/screens/` that declares its parameters through the registry, obtains data exclusively through hooks in `src/data/`, registers its UI state with the navigation frame, renders inside a section-level error boundary, and stays under the 400-line ceiling by delegating to components. A screen never constructs a Supabase query inline, never constructs a navigation target for an entity by hand, never formats a number without the formatting layer, and never renders a fallback value when data is missing. Provide the reference implementation as a real working screen with a trivial data dependency, so the pattern is demonstrated rather than only described. Every screen prompt after this one will refer back to this document, so make it precise and short enough that I will actually reread it.

**Success check:** The pattern document exists with a working reference screen that satisfies every stated rule.
**Do not continue until:** The reference screen passes the architecture lint rules and stays well under 400 lines.

---

### Prompt 0075 · Phase 3 — Component Split and App Shell Stabilization
**Set up the data-fetching layer**

> Set up the data layer that every screen will consume, using a query library configured for the specific characteristics of this application. Game data is unusual: it is almost entirely immutable within a week, since a completed season's statistics never change, but it invalidates in large coordinated sweeps when the calendar advances. Configure caching to reflect that — long stale times for historical data, aggressive invalidation keyed on the calendar advancing. Establish a query-key convention that includes the save slot in every key without exception, because a key that omits it will serve one save's data to another and that is a catastrophic and very confusing bug. Put every query in `src/data/` behind a typed hook, so screens never touch the client directly, per the lint rule from Phase 1. Wire the missing-data error type through so a query for a nonexistent entity throws to the boundary rather than resolving to undefined and rendering an empty screen.

**Success check:** Every query key includes the save slot; screens consume only hooks; a missing entity throws to the boundary rather than resolving empty.
**Do not continue until:** You have confirmed by inspection that no query key can be constructed without a save slot.

---

### Prompt 0076 · Phase 3 — Component Split and App Shell Stabilization
**Define the invalidation policy for calendar advancement**

> Define and implement the cache invalidation policy, because advancing a week changes a great deal at once and getting this wrong produces the worst class of bug in this application: a screen showing last week's numbers with no indication anything is stale. Write `docs/CACHE-POLICY.md` classifying every kind of data into one of three tiers. Static reference data such as teams, stadiums, colleges and the league structure effectively never changes within a save and can cache indefinitely. Season-scoped data such as completed weeks' results and finalised statistics is immutable once written and caches until the season rolls over. Live data such as the current week's state, the calendar, standings, rosters and cap figures invalidates on every advancement. Implement a single invalidation function called once when advancement completes, rather than scattering invalidation calls across the codebase where one will inevitably be forgotten. Add a development assertion that flags a query reading live data without participating in advancement invalidation.

**Success check:** The policy document classifies every data kind; one invalidation function handles advancement; the development assertion catches an unregistered live query.
**Do not continue until:** You have added a live query outside the policy and confirmed the assertion fires.

---

### Prompt 0077 · Phase 3 — Component Split and App Shell Stabilization
**Decide pagination and virtualization thresholds**

> Decide how large lists are handled before any of them exist, because retrofitting this across a dozen screens is far more expensive than deciding once. Write `docs/LIST-STRATEGY.md` grounded in my actual data volumes rather than in general advice: a roster is around ninety rows, the full league is 3,066 players, search covers 284 profiles today but every player who ever existed in a long save, a season of statistics is 10,117 rows, and a fifty-season save will exceed half a million statistics rows. For each of those, state whether it loads fully, paginates, virtualizes, or is queried in a narrowed form, and justify each choice with the number. Then decide where the boundary sits between filtering in the database and filtering in the client, since filtering 3,066 rows in the client is fine and filtering half a million is not. This document determines whether a fifty-season save remains playable on a phone, so be concrete and use real numbers.

**Success check:** The strategy document covers every real data volume with a specific decision and a numeric justification for each.
**Do not continue until:** You have checked the fifty-season projections and confirmed no screen is planned to load an unbounded result set.

---

### Prompt 0078 · Phase 3 — Component Split and App Shell Stabilization
**Build the virtualized list**

> Build the `<VirtualList>` component implementing the virtualization decisions from the list strategy, since several screens in this game will present thousands of rows on a phone. Render only what is visible plus a modest overscan, and support variable row heights, because a roster row and a transaction row are different heights and forcing them equal will make one of them look wrong. Integrate it with the scroll-restoration behavior from earlier so that returning to a virtualized list restores the same offset and therefore the same rows — this is the hardest interaction in the navigation contract, because the content at a given offset is not mounted until it is scrolled to, and a naive restore will land in the wrong place or at the top. Support sticky section headers for grouped lists such as a roster grouped by position. Test with ten thousand rows on a throttled mobile profile and report the frame rate during a fast scroll.

**Success check:** Ten thousand rows scroll smoothly under mobile throttling; variable heights work; restoring an offset lands on the same rows, not the top.
**Do not continue until:** Scroll restoration into a virtualized list is verified at a deep offset, not just near the top.

---

### Prompt 0079 · Phase 3 — Component Split and App Shell Stabilization
**Scaffold the home screen**

> Scaffold the home screen following the pattern document, as the structural skeleton only with no data wiring, since Phase 5 does the wiring. My prototype's home is a contextual command centre showing the user's team with its record, the current week and season, conference standings context, and a news area, with search and menu affordances in the header. Reproduce that structure as composed components: a header with the team accent, a record and standing summary card, a section for upcoming or recent games, a section for news, and a section for anything requiring attention. Every data-dependent region renders a skeleton, and every section sits inside a section-level error boundary so one failing panel does not take the screen with it. Do not hardcode the season year, the week number or the team — my prototype has DEN and Week 18 baked into the markup and eliminating exactly that is why we are rebuilding. Keep the file under the ceiling by delegating each section to its own component.

**Success check:** Home renders as composed sections with skeletons and per-section boundaries; the file is well under 400 lines; no hardcoded team, year or week.
**Do not continue until:** You have grepped the file for `DEN`, `2031` and `18` and found no literals.

---

### Prompt 0080 · Phase 3 — Component Split and App Shell Stabilization
**Scaffold the team screen**

> Scaffold the team screen with its tab structure, unwired. My prototype's team screen covers the roster with four sort modes, the depth chart, and team statistics, and it must work for any team rather than only the user's — tapping an opponent in the standings opens that team's roster, which is why universal entity routing exists. Build the tab set using the tabs primitive so tab state is preserved by the frame automatically, and place the sort control on the roster tab and the competition toggle on the statistics tab, since team statistics split by regular season and playoffs exactly as player statistics do. Take the team identifier as a typed screen parameter with no default, so the screen cannot render without knowing which team it is showing. Include a placeholder region on the depth chart tab for the reordering interaction, which my prototype does not implement — tapping currently opens the profile instead of swapping — and which is built later.

**Success check:** Tabs are registered with the frame, the team id is a required parameter, and the competition toggle appears on the statistics tab only.
**Do not continue until:** Pushing the team screen without a team id fails to compile.

---

### Prompt 0081 · Phase 3 — Component Split and App Shell Stabilization
**Scaffold the player profile with five tabs**

> Scaffold the player profile, the most important screen in the application because every entity route in the game terminates here. My prototype gives it five tabs — Overview, Stats, Grades, Career and Honours — and the profile must render identically regardless of where it was opened from, whether a roster row, a grade leaderboard, an MVP ballot, an All-Pro team, a search result or a news headline. Build all five tabs with the tabs primitive, place the shared competition toggle on both the Stats and Grades tabs since both split by competition, and place the ability dial in the header area with performance chips appearing in the grades content, never mixing the two geometries. Take the player id as a required parameter. Handle the states my data actually contains: a player with a null overall rating, a player with an empty team value who is retired or unsigned, a player with a single season, and a player with a season split across two teams after a mid-season trade.

**Success check:** All five tabs render, the competition toggle appears on exactly two of them, and null OVR, empty team, single-season and traded-season cases all render sensibly.
**Do not continue until:** You have opened the profile from three different entry points and confirmed identical rendering.

---

### Prompt 0082 · Phase 3 — Component Split and App Shell Stabilization
**Scaffold the league screen**

> Scaffold the league screen, which in my prototype is the hub for league-wide information: standings at three scopes covering division, conference and overall, grade leaderboards filtered by position, award winners, All-Pro and All-Star selections, the record book, and league history by season. That is a lot of surface, so structure it as a hub with clear entry points rather than one screen cramming everything in, since a dense league screen at 390px becomes unusable quickly. Build the standings section with a scope selector registered as frame UI state, and build the grade leaderboard section with the position filter chips, since that leaderboard is the origin of my canonical navigation-restoration test and the filter must survive opening a player and coming back. Every entry point navigates through the registry with typed parameters, and every player and team reference goes through `EntityLink`. Leave the sections unwired; Phase 5 and Phase 14 supply the data.

**Success check:** The hub structure renders, the standings scope selector and the position filter both register as frame state, and every reference uses `EntityLink`.
**Do not continue until:** The canonical league → filter CB → open player → back test passes on this screen's real structure.

---

### Prompt 0083 · Phase 3 — Component Split and App Shell Stabilization
**Scaffold the inbox**

> Scaffold the inbox, the fifth navigation destination and the place where the game speaks to the player. Distinguish two things my prototype partly conflates: the news feed, which is league-wide reporting of what happened, and the inbox proper, which is messages directed at the user — an owner's expectations, a coach's request, a contract demand, an offer received. Both are chronological lists of items carrying structured entity references so that a headline about a player is tappable navigation into that player's profile, which is behavior my prototype already has and which must survive the rebuild. Build the shared row presentation, the read and unread distinction, and grouping by week or date. Do not build a message-composition interface, since the player never writes messages in this game. Leave it unwired. Ensure an unread count can be surfaced on the navigation bar without loading the full inbox, since that count is read on every screen.

**Success check:** News and inbox are distinguishable concerns, rows carry entity references, and an unread count is obtainable without loading full contents.
**Do not continue until:** A news row's entity reference resolves through the entity router rather than being display text only.

---

### Prompt 0084 · Phase 3 — Component Split and App Shell Stabilization
**Rebuild search correctly and kill the setTimeout hack**

> Scaffold the search screen and fix the known defect my prototype documents. In the prototype, the entire view re-renders on every state change, which destroys the input's focus, and it is patched by re-focusing the input on each keystroke through a setTimeout — it works, but it is the wrong pattern and it will not survive a larger dataset. Build it properly: the input is uncontrolled or the render is incremental, so focus, cursor position and selection are never lost mid-typing, and typing remains smooth. Search covers every player who has ever existed in the save, including retired ones, which is 284 profiles in my current export but will grow into the thousands over a long save, so debounce the query and push filtering to the database per the list strategy rather than filtering a growing array in the client. Support searching players, teams and coaches with grouped results, each row routing through `EntityLink`. Leave the query unwired.

**Success check:** Typing never loses focus or cursor position, no setTimeout refocus exists anywhere, and results are grouped by entity type.
**Do not continue until:** You have typed a long query rapidly and confirmed no dropped characters and no focus loss.

---

### Prompt 0085 · Phase 3 — Component Split and App Shell Stabilization
**Scaffold the record book**

> Scaffold the record book, which in my prototype presents league records and is one of the five screens using the shared competition toggle — records are kept separately for the regular season and the playoffs and must never be merged. Structure it by record category with a single-season and career distinction, since those are different kinds of achievement and combining them is a category error. Every record holder is a player reference routed through `EntityLink`, so tapping a record opens that player's profile. Include the season in which each record was set and, where the data supports it, the previous holder, because a record book that shows only current holders loses the history that makes it interesting. My export contains 33 league records and 71 record-history rows, so the history is genuinely there. Leave it unwired. Confirm the competition toggle here is the same component instance used on player stats, player grades, team stats and league grades, with no second implementation.

**Success check:** Single-season and career records are separated, the competition toggle is the shared component, and every holder routes through `EntityLink`.
**Do not continue until:** You have confirmed by search that only one competition toggle implementation exists in the codebase.

---

### Prompt 0086 · Phase 3 — Component Split and App Shell Stabilization
**Scaffold league history by season**

> Scaffold the league history screen presenting the league season by season, which my export supports with six validated seasons and which will grow to fifty or more in a long save. Each season entry shows the champion, the major award winners, the notable statistical leaders and a way into that season's fuller detail, so the screen is a chronological index rather than a wall of numbers. Structure it as a reverse-chronological list with the most recent season first, since that is what a player checks most often. Every reference — champion team, award winner, statistical leader — routes through `EntityLink`. Plan for length: fifty seasons of entries is a list that needs the virtualization decisions from the list strategy rather than a naive full render. Provide a path from a season entry into that season's standings, awards and leaders. Leave it unwired, but structure the components so that adding a season adds a row and nothing else needs to change.

**Success check:** Reverse-chronological structure renders, every reference uses `EntityLink`, and the list follows the strategy document for length.
**Do not continue until:** You have confirmed the structure handles fifty synthetic entries without a layout or performance problem.

---

### Prompt 0087 · Phase 3 — Component Split and App Shell Stabilization
**Scaffold awards, All-Pro and All-Star**

> Scaffold the three honours screens, which in my prototype are genuinely wired and among the most distinctive parts of the game. The awards screen shows winners and, critically, the full voting ballots with vote bars — my engine runs fifty simulated voters across seven archetypes, and the ballot detail is what makes an award feel argued over rather than assigned. The All-Pro screen shows first and second teams by position. The All-Star screen shows the selections by conference. All three are heavy in player references, so every single one routes through `EntityLink`, and all three are season-scoped, so each needs a season selector registered as frame UI state. Build the vote-bar presentation as a reusable component since it appears for every award. Structure the All-Pro and All-Star screens around position groups. Leave them unwired; Phase 14 supplies the data. Keep each file under the ceiling by extracting the shared position-group presentation.

**Success check:** All three render with season selectors registered as frame state, the vote bar is one reusable component, and every player reference routes through `EntityLink`.
**Do not continue until:** Each file is under 400 lines and the position-group presentation is shared rather than duplicated three times.

---

### Prompt 0088 · Phase 3 — Component Split and App Shell Stabilization
**Convert the six loop-generated placeholders into honest screens**

> My prototype generates six screens — trade centre, free agency, draft, transactions, staff and settings — from a single loop over a table of title-and-message pairs, each displaying an honest message that the feature is not built rather than faking depth. That honesty is a deliberate choice I want preserved, but the loop is not a structure I can build on, so replace it with six real registered screens that each render the unbuilt empty state with wording specific to that feature. Each should state plainly what will live there and, where it is true, that the underlying engine logic already exists but is not yet connected — my contract engine exists and is not wired to the cap screen, and my free-agency market runs in the simulation but has no interface, and saying so is more useful than a generic placeholder. Register all six properly so the navigation targets resolve, the back stack behaves, and each becomes a real screen in later phases by replacing its body rather than by being created from nothing.

**Success check:** Six independently registered screens exist with feature-specific honest wording; the generating loop is gone; all six navigation targets resolve.
**Do not continue until:** No screen among the six displays invented data of any kind.

---

### Prompt 0089 · Phase 3 — Component Split and App Shell Stabilization
**Run the accessibility pass on the shell**

> Run a genuine accessibility pass over everything built in this phase, before there are seventeen screens rather than seventeen scaffolds and the work multiplies. Verify that every interactive element is reachable and operable by keyboard, that focus order follows visual order, and that focus is visible against the dark palette — a focus ring tuned for a light interface commonly disappears entirely on slate ink. Verify that the sheet traps focus and returns it to the trigger on dismiss. Give every icon-only control an accessible name. Verify colour contrast across the palette, paying particular attention to the muted and dim text tokens against the panel and raised surfaces, and report any pairing that fails the AA threshold rather than quietly adjusting my palette. Confirm the ability and performance components remain distinguishable in greyscale, since geometry rather than colour is the entire point of that design. Announce screen changes to assistive technology on navigation, since this is a single-page application where a screen change is otherwise silent.

**Success check:** Full keyboard operability, visible focus on dark surfaces, named icon controls, a contrast report per token pairing, and screen-change announcements.
**Do not continue until:** Every failing contrast pairing is reported to me for a decision rather than silently changed.

---

### Prompt 0090 · Phase 3 — Component Split and App Shell Stabilization
**Handle motion and reduced-motion preferences**

> Establish the motion system, which on a phone is a substantial part of whether an application feels solid. Define a small set of durations and easings in the tokens and use only those, since inconsistent motion timing reads as sloppiness even when nobody can identify it. Cover the motions this application actually needs: screen push and pop with a directional relationship so pushing and going back feel like opposites, the sheet rising and dismissing, and the skeleton shimmer. Keep durations short — a phone interface that animates slowly feels slow, and this is a game where the player will advance a week hundreds of times, so any animation on that path must be nearly instantaneous or it becomes an obstacle. Then honour the reduced-motion preference properly: not by disabling all feedback, which leaves the interface feeling broken, but by substituting crossfades for movement and static placeholders for shimmer, so the interface still responds while nothing slides.

**Success check:** All motion uses the shared token set, push and pop are directional opposites, and reduced motion substitutes crossfades rather than removing feedback.
**Do not continue until:** You have enabled reduced motion at the OS level and confirmed the interface still feels responsive rather than inert.

---

### Prompt 0091 · Phase 3 — Component Split and App Shell Stabilization
**Set and measure the shell performance budget**

> Set a performance budget now and measure against it, because this is the cheapest point in the project to establish one and the shell is what every future screen loads on top of. Write `docs/PERFORMANCE-BUDGET.md` with concrete numbers for the initial JavaScript bundle, time to interactive on a mid-range Android profile with throttled CPU and network, and the frame rate during a fast scroll of a virtualized list. Measure the current state and record it as the baseline. Add a bundle-size check to CI that fails when the budget is exceeded, since a budget nobody enforces is a wish. Report what is currently largest in the bundle and whether the two self-hosted font families and the query library are proportionate. Note explicitly that the simulation engine port in Phase 6 will add substantially to this and must be code-split away from the initial load, so the budget should reserve headroom rather than being consumed entirely by the shell.

**Success check:** The budget document holds real measured numbers, CI fails on exceeding the bundle budget, and the largest contributors are itemised.
**Do not continue until:** You have deliberately added a large dependency, watched CI fail on budget, and removed it.

---

### Prompt 0092 · Phase 3 — Component Split and App Shell Stabilization
**Phase 3 exit audit and shell baseline tag**

> Audit the shell before we start wiring real data, and write `docs/PHASE-03-AUDIT.md` from the actual codebase rather than from what the prompts asked for. List every file in `src/` with its line count and confirm none exceeds 400. Confirm every one of the seventeen screens is registered with typed parameters and a declared save requirement. Confirm the navigation contract is satisfied by running the canonical league-to-player-and-back sequence and reporting the result. Confirm no screen constructs a Supabase query directly, no screen constructs an entity route by hand, no number is formatted outside the formatting layer, and no component renders a fallback value for missing data. Confirm exactly one competition toggle implementation exists. Confirm the search screen contains no setTimeout refocus. Then measure against the performance budget and report the numbers. Finally, tell me what in this shell you are least confident about, and what you expect to break first when real data arrives in Phase 5.

**Success check:** The audit confirms every rule with evidence, the canonical navigation test passes, and performance sits within budget.
**Do not continue until:** Every violation found is fixed, preflight is green, and the repository is tagged `phase-03-complete`.

---
---

**END OF PART 1 — Prompts 0001–0092 delivered (Phases 1–3 complete).**

Next section begins at **Prompt 0093 — Phase 4: Save Slots, New Game, Team Selection, and User State** and runs through Prompt 0164 (Phase 5).

Say **CONTINUE** and the next section will be appended to this file.
