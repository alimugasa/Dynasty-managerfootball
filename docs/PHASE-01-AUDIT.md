# Phase 1 Exit Audit

Fill this in from the actual repository state before tagging `phase-01-complete`.
Answer from `git` and from running the checks, not from what the prompts asked for.

## Integrity of frozen material

- [ ] `git status` shows **zero** modified files under `legacy/engine/`.
- [ ] No file in `src/` imports from `legacy/`.
- [ ] `legacy/ui/index.html` is byte-identical to the uploaded original.

## Enforcement actually fires

- [ ] 400-line ceiling — tested by creating an oversized file. Result: _____
- [ ] Screens/components may not import `src/data` — tested. Result: _____
- [ ] IP denylist — tested with a real franchise nickname. Result: _____
- [ ] No fallback values in `src/data` — `grep` for `?? 0`, `|| 0`, `?? '-'`. Result: _____

## Invariants

- [ ] `resolveEntityRoute` is exhaustive; adding an `EntityRef` kind without a
      route is a compile error. Verified: _____
- [ ] Aggregates cannot be called without an explicit `Competition`. Verified: _____
- [ ] Exactly one `CompetitionToggle` implementation exists. Count: _____
- [ ] `AbilityDial` and `PerformanceChip` are distinguishable in greyscale.
      Screenshot: _____

## Layout

- [ ] No page-level horizontal scroll at 320 / 390 / 768 / 1280px.
- [ ] Overflow guard fires when deliberately broken. Verified: _____

## File inventory

| File | Lines |
|---|---|
| _(list every file in `src/` with its line count; none may exceed 400)_ | |

## Parity pipeline

- [ ] `legacy/parity/export_goldens.py` produces byte-identical output on two runs.
- [ ] Six subsystem goldens exist.
- [ ] Parity tests report **pending**, not passing.

## Honest assessment

**What I am not confident in:**

**What I could not do properly:**

## What does not exist yet

No database connection. No screens. No navigation implementation. No simulation.
