# The play-test build

One HTML file that plays the game: the engine, the seed world and the app's own
components, with nothing to fetch and no server.

```bash
npm run playtest        # -> scripts/playtest/playtest.html (about 900KB)
```

## What it is, and what it is not

The product is a client that reads rows a handler wrote. `ARCHITECTURE.md`
rule 2 is that no simulation outcome is decided in frontend code, and
`scripts/lint-arch.mjs` rule 6 keeps the engine out of `src/` entirely.

This rig breaks that rule on purpose, and pays for it by living here rather
than there. It sits under `scripts/` with the other engine harnesses
(`drift-report`, `market-report`, `sim-report`) because it is one: a way to
run the engine and look at what comes out. Nothing in it ships in the product,
and `src/` imports none of it.

It exists because "is this fun yet" cannot be answered by a row count. The
answer needs a phone, a thumb and twenty minutes.

## Fidelity

The rig calls the same code the server calls, in the same order:

| | Server | Rig |
|---|---|---|
| World | `loadCareerWorld` over the save's rows | `loadCareerWorld` over the packed seed |
| Streams | `gameStream` / `newsStream` / `offseasonStream` | the same functions |
| Week | `simulateGame` per fixture, `MissingUnitError` reported | the same |
| News | `generateWeeklyNews` with a season ledger | the same |
| Offseason | `runOffseason` | the same |
| Save | the versioned document in `save_documents` | the versioned document in `localStorage` |

Two deliberate differences, both stated on screen where they show:

- **The offseason list.** The rig shows what the offseason did to your club.
  The product writes those rows to `transactions` and has no screen for them
  yet; the rig is previewing that screen.
- **The bracket's news.** Both play the same four rounds from the same engine
  module; the rig keeps the round's stories in the same feed, where the
  product writes them to `news` under the `PLAYOFFS` phase.

Everything else the rig lacks, the product lacks too: no in-season signing, no
awards, an offseason that runs itself.
