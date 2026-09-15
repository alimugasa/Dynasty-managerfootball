# The rendering decision

The first renderer drew SVG. The faces it produced were rejected, and the
rejection was right: overly geometric skulls, one eye construction repeated,
line-drawn noses, flat skin, hair that sat on the head like a cap, and beards
that were rectangles clipped to the face outline — the straight horizontal cut
across the cheeks is visible in any screenshot of it.

## Could SVG have got there?

No, and the reason is not shape count.

The target look needs *soft, overlapping, multi-pass shading*: a dozen
gradients per face, each covering a different plane, plus per-pixel grain, plus
several thousand individual hairs. In SVG every one of those is a node. A
gradient is a `<defs>` entry; softness is a `<filter>` primitive that is slow,
inconsistent between engines and unavailable on older Safari; grain is not
expressible at all. A face at the fidelity asked for would be thousands of DOM
nodes, and a fifty-row roster fifty times that.

Stacking more SVG onto it was explicitly ruled out, so the options were the
ones the brief lists.

| Approach | Verdict |
|---|---|
| Layered 2D portrait assets | Needs an artist and an asset pipeline. The project has neither, and `docs/IP-POLICY.md` rules out sourcing photographic faces. Choosing this means the feature does not ship. |
| Pre-rendered modular components | Same problem: the modules are art. |
| Lightweight 3D head | A morphable head mesh is itself an asset. Building one procedurally that reads as human is a far larger job than shading a 2D portrait, and Three.js plus a mesh costs more bundle than the quality it buys at 40px in a list. |
| **Procedural raster (Canvas 2D)** | **Chosen.** |

## Why Canvas

- **No assets.** Everything is drawn from numbers — the only construction the
  IP policy permits and the only one available without an artist.
- **It has the tools the look needs.** Real gradients, compositing, clipping,
  per-pixel noise: the exact things missing from SVG.
- **Deterministic.** Same seed, same pixels, on every device. The renderer
  avoids `ctx.filter` for this reason: it rasterises differently between
  engines, so a blurred face would not be reproducible.
- **Cheap at list scale.** A portrait is rasterised once per (seed, size) and
  cached as a data URL. A roster is fifty `<img>` sharing a cache.
- **Degrades honestly.** No 2D context — including jsdom, where the component
  tests run — means `render` returns null and the caller falls back to
  initials, so a broken face never reaches a screen.

The honest limit: this reaches a *painted portrait*, not a rendered 3D
headshot. It is a long way past the cartoon it replaces and short of a AAA
sports title. If that gap matters more than the cost, the escape hatch is the
interface below, not a rewrite.

## The seam

```
supabase/functions/_shared/avatar/     WHO a player is — renderer-independent
  traits · skin · hair · ancestry · build · seed · generate · unique
  morph.ts    ← new: ~55 continuous facial dimensions from the same seed

src/avatar/
  portrait.ts    AvatarRenderer (alias of PortraitRenderer)
  svgPortrait    the old renderer, still what every screen uses
  raster/        the new one, wired only to /dev/avatars
```

`AvatarProfile` and `FaceMorph` know nothing about any renderer. Swapping in a
3D or asset-based renderer later is implementing `AvatarRenderer` and changing
one constant; no player's identity changes, because identity never passed
through the renderer.

## What morph.ts fixed

The old renderer read trait *names* and turned them into a handful of
coordinates. Thirty-five nose names collapsed into two curves. That is the
actual reason every player looked related: the traits existed in the data and
died on the way to the screen.

`morph.ts` interprets names once, in the pure layer, and emits ~55 continuous
dimensions — skull width and length, forehead height and width, temple width,
brow ridge, cheekbone width *and height*, cheek fullness, eye width, height,
angle, spacing and depth, lid heaviness and crease, bridge width and height,
nose length, projection, tip roundness and angle, nostril width, alar flare,
mouth width, lip fullnesses, cupid's bow, philtrum length, jaw width, angle,
length and gonial flare, chin width, length and projection, ear size, length,
protrusion and lobe, plus five asymmetry terms. The renderer never sees a name.

Age is read here on purpose (cheeks hollow, lids grow heavier, nose and ears
lengthen) while `AvatarIdentity` stays age-free, so a 37-year-old is
structurally the same man as the 23-year-old. `tests/avatar/morph.test.ts`
asserts exactly which dimensions age may move and fails if that list grows by
accident.

## Status

**Live.** `PlayerAvatar` draws with the raster renderer, so every surface that
already had faces now has painted ones: the depth chart, the roster, the player
profile, the waiver wire, the free-agent pool, the transaction history, the
league leaders, the honours panels, the trade block, the draft board, the
awards night and the recap.

It sat behind `/dev/avatars` for one round while the quality was reviewed. The
revert is one line -- `RENDERER` in `src/avatar/PlayerAvatar.tsx` -- and
`svgPortraitRenderer` is deliberately still imported beside it so that revert
stays a word rather than a commit.

Known weak spots: rope hairstyles (braids, cornrows, locs) read as ribbons, and
long styles have the weakest silhouettes.
