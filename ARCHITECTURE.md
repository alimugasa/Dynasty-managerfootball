# Architecture

## The three rules

1. **No production file exceeds 400 lines.** Not a style preference — a hard
   constraint preventing the prototype's failure mode (one 638KB file holding
   markup, styles, data and logic) from reappearing. Enforced by
   `scripts/lint-arch.mjs`.

2. **No simulation outcome is ever decided in frontend code.** Game results,
   progression, awards and financial outcomes come from the engine, server-side.
   The frontend renders them; it never computes them.

3. **Missing data is reported, never invented.** If a required table, column or
   relationship is missing, stop and say what is missing. Substituting a
   plausible value is the most serious defect that can be introduced here: it
   converts a loud failure into a number on screen that was never real.

## Module boundaries

```
src/app         shell, tokens, navigation, entity routing
src/screens     screen-level components (consume hooks only)
src/components  shared UI primitives
src/domain      typed game entities, generated from the real schema
src/data        data access (Phase 2+); the ONLY place createClient may appear
src/lib         utilities
supabase/       migrations and edge functions
legacy/         FROZEN reference material — never imported, never linted
```

- Screens and components consume typed hooks. They never import `src/data`
  directly (except `src/data/errors`).
- `createClient` may appear in exactly one file: `src/data/client.ts`.
- Data-access functions never return `?? 0`, `|| 0`, `?? '-'` or `?? []`.
  They throw `MissingData`.

## Invariants that must survive every future change

**Universal entity routing.** No screen constructs a navigation target for an
entity by hand. Every player, team, coach, college, game or draft-pick reference
goes through `<EntityLink>` and `resolveEntityRoute`. A player is provably the
same player everywhere. The prototype achieved this by convention only — inline
`push('player',{id})` in template literals — which would have shattered silently
during the split.

**Regular-season / playoff separation.** Enforced at type level in
`src/domain/competition.ts`. `CompetitionSplit<T>` has no combined field, and every
aggregate takes an explicit `Competition` argument. There is exactly **one**
`<CompetitionToggle>` component, used identically on player stats, player grades,
team stats, league grades and the record book. **A second implementation of that
control is a defect.**

**Ability vs performance.** `AbilityDial` is a circular dial with an amber arc.
`PerformanceChip` is a rectangle with a coloured left edge on a six-stop ramp.
They are distinguished by **geometry, not colour**, so the distinction survives
colour-blindness and greyscale. Neither takes a colour or variant prop, because no
future screen may make one look like the other.

**Navigation state.** See `docs/NAVIGATION-CONTRACT.md`. Every frame stores screen,
params and UI state; `back()` restores all three.

**Layout.** Mobile-first at 390px, content column capped at 520px, working down to
320px. The page never scrolls horizontally. Wide tables scroll inside
`<TableScroll>` containers. Enforced by `src/app/overflowGuard.ts` in development
and by an end-to-end assertion at four widths.

**Intellectual property.** See `docs/IP-POLICY.md`. Original names throughout, real
metro areas only, no marks. Enforced by a denylist in `scripts/lint-arch.mjs`.

## What does not exist yet (end of Phase 1)

No database connection. No screens. No navigation implementation. No simulation.
No save system. The runtime tables — save state, calendar, results, standings,
season statistics, season grades, awards, transactions, news — do not exist and are
specified in Phase 2, Prompt 0038.
