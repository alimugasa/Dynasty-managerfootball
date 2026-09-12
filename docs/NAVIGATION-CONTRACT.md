# Navigation Contract

The most valuable behaviour in the prototype, and the thing most likely to be
destroyed in a rewrite. Specified here before implementation (Phase 3, Prompt 0045).

## Frame

A stack frame stores **three** things:

1. **Screen identity** — a registered screen key.
2. **Params** — typed, e.g. `{ id: 'DEN_QB_01' }`.
3. **UI state** — active tab, filter chips, sort order, **scroll offset**.

All three are restored on `back()`. Restoration is automatic: screens register
their UI state through a hook, so a screen cannot forget to preserve it.

## Operations

| Operation | Effect | Used by |
|---|---|---|
| `push(screen, params)` | Pushes a new frame; captures the current frame's UI state first | Drill-down, every `EntityLink` |
| `back()` | Pops; restores screen, params and UI state of the frame beneath | Back affordance, hardware back, edge swipe |
| `replaceRoot(screen, params)` | Clears the stack and starts a new root | The four flanking bottom-nav destinations |

The bottom nav uses `replaceRoot`, not `push`. Tapping Home from four levels deep
inside League must not grow the stack forever.

## Canonical acceptance test

> League → Grades → filter to CB → scroll → open a player → **back**

must return to the grade leaderboard with the **CB filter still applied**, the
**same sort order**, and the **same scroll offset**. This runs in CI on every push
for the remainder of the project.

## Same screen twice

If a screen appears twice in the stack with different filters, each frame keeps
its own UI state independently.

## Scroll offset

Captured at the moment of navigation, not continuously on scroll — a scroll
listener firing on every frame of a long virtualised roster is a performance
problem. Restored **after** the returning screen renders its content, or the
restore applies to a shorter list and lands in the wrong place. If content is now
shorter, clamp rather than leaving the user in blank space.

## Platform back

- **Android hardware back** — pops. At the root, follows platform convention
  (background), never a blank screen.
- **Browser back** — pops. History entries are synchronised with frames: push one
  on `push`, consume one on `back`. Rapid repeated presses must not desynchronise.
- **iOS edge swipe** (wrapped context) — pops.

In every case state restoration is identical to an in-app back.

## URLs

URLs are a **projection** of the stack, never the source of truth — the stack holds
UI state that does not belong in a URL. Filter and sort state stay out of URLs.
Loading a URL cold constructs a coherent stack with a sensible back path. A URL
referring to a nonexistent entity surfaces `MissingData`, not an empty profile.

## Sheets

An open sheet is dismissed by the back affordance. Back must not navigate away and
leave a sheet orphaned over a different screen.
