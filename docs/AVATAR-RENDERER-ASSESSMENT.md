# Choosing a portrait renderer

Written after the vector renderer was rejected, then rebuilt as a painted
raster renderer, then rejected again. The second rejection is the useful one,
because it rules out a whole family of approaches rather than one execution.

## The constraint that decides this

The project has three runtime dependencies (`react`, `react-dom`, `postgres`),
**zero image assets of any kind**, no asset pipeline, no 3D, no artist, and no
image-generation capability. `docs/IP-POLICY.md` forbids sourcing photographic
faces.

That is not a footnote. Every approach below that reaches the quality target
reaches it *through art a person made*. The honest question is not "which
renderer is best" but "which of these can exist here, and what does the best
one actually cost".

## Why the painted 2D renderer failed, specifically

Not because the painting was careless. Because of a structural limit worth
stating, since it also rules out doing the same thing harder:

**Hand-painted shading cannot reason about occlusion between features.** When a
brow ridge overhangs an eye socket, or a nose casts onto a lip, or a cheekbone
shadows the hollow beneath it, a painter has to *know* that and place the
shadow. Every one of those is a separate hand-authored mark, tuned by eye, and
the moment two features move independently — which is the entire point of a
morph system with fifty-five dimensions — the hand-placed shadow is wrong for
most of the combinations.

Geometry plus a light does not have this problem. It gets occlusion, falloff
and the terminator for free, correctly, for every combination.

That is the architectural case for moving from "paint a face" to "build a face
and light it", and it is why option C cannot be fixed by more effort.

## The options

| | A. Layered raster art | B. Pre-rendered modular components | C. Procedural 2D raster *(current)* | D. Geometry + real lighting | E. Pre-generated portrait library | F. Hybrid base + modular overlays |
|---|---|---|---|---|---|---|
| **Visual quality** | Excellent — this is what shipping sports games do | Excellent | **Ceiling reached; rejected twice** | Good to very good; real light solves sockets, brows, noses, cheekbones by construction | Potentially excellent | Excellent |
| **3,000 active players** | Excellent (composite once, cache) | Excellent | Excellent | Excellent (render once, cache a bitmap — never per frame) | Good | Excellent |
| **Tens of thousands historical** | Excellent | Excellent | Excellent | Excellent | Poor — storage scales with players | Excellent |
| **Deterministic identity** | Excellent (layer ids from seed) | Excellent | Excellent | Excellent (morph → geometry) | Weak — a fixed portrait cannot be a unique person | Excellent |
| **Storage** | 20–60 MB of layers | Similar, plus a 3D pipeline | ~0 (code) | ~0 procedural; moderate with a base mesh | Very large | Depends on base |
| **Runtime / mobile** | Excellent | Excellent | Excellent | Good; one render per player, cached | Excellent | Excellent |
| **Memory** | Moderate (decoded layers) | Moderate | Low | Low | High | Moderate |
| **Dev complexity** | Low in code | Moderate | Low | **High** | Low | Moderate |
| **Aging** | Good (overlay layers) | Good | Excellent | Excellent (parameters, not pixels) | **Impossible** — a baked portrait cannot age | Excellent |
| **Hair / facial-hair change** | Excellent (separate layers) | Excellent | Excellent | Excellent | **Impossible** | Excellent |
| **Commissioner editing** | Excellent | Excellent | Excellent | Excellent | None | Excellent |
| **Offline** | Needs assets bundled; kills the single-file rig | Same | Excellent | Excellent | Poor | Depends |
| **Licensing** | Clean *if commissioned* | Clean if commissioned | Clean | Clean | **Unsettled** for generated faces; IP-POLICY is strict | Depends on base |
| **Available here** | ✗ no artist | ✗ no artist, no pipeline | ✓ (rejected) | ✓ | ✗ no image model | partial |

## Recommendation

**Two answers, because the honest one has two parts.**

### For the finished commercial game: F built on A

Commission a modular portrait kit — base heads across the pigment range, layered
features, hair, facial hair, ageing overlays — and composite it deterministically
from `AvatarProfile`. This is what sports titles actually ship and it is the
only path that reliably lands between roster photography and semi-realistic
game rendering.

It costs an artist. There is no version of this that does not. If the target is
genuinely the stated one for a product being sold, that is the line item, and
the architecture below is designed so the kit drops in without touching a single
line of identity code.

### To build today, with no artist: D

Procedural geometry with real per-pixel lighting.

Look at the quality list in the brief: *eyelids and eye sockets, visible brow
structure, three-dimensional noses, realistic nostrils and nose tips,
cheekbone structure, cheek volume, realistic light and shadow*. Every one of
those is a lighting-from-geometry problem. They are precisely what 2D painting
cannot do and what geometry gets for nothing.

**Implementation choice inside D: a height-field relief renderer, not a mesh.**

Build a depth map of the face from the morph, derive surface normals from it,
compute cavity occlusion from it, and shade every pixel with one physical
lighting model. This is real geometry and real light without a mesh, UVs,
rigging, a `three.js` dependency, or anything that would break the offline
single-file build. If it proves out, promoting it to a true mesh in WebGL is
the *same descriptor* feeding a different renderer — which is the point of the
abstraction.

**The honest risk:** procedurally generated heads with no artist in the loop
tend toward the mannequin. Real light on merely adequate geometry can read as a
shop dummy — which is a different failure from a cartoon, not automatically a
better one. That is the thing to judge on the comparison screen.

## The mandated separation

```
AvatarProfile            WHO he is      — seed, traits, ancestry, age, build
      ↓  describe()
AvatarRenderDescriptor   WHAT to draw   — pure numbers, no renderer concepts
      ↓
AvatarRenderer           HOW to draw it — v1 vector · v1.5 painted · v2 relief
      ↓
Portrait output          cached raster
```

`AvatarRenderDescriptor` is the contract. It carries geometry, colour, hair,
facial hair, age and build as plain numbers and ids, and knows nothing about
canvases, meshes, SVG or image layers. A renderer may not reach past it to the
profile. A commissioned art kit (A/F) consumes the same descriptor as the
relief renderer, which is what makes the upgrade path real rather than
aspirational.

## What the V2 prototype actually produced

Built and visible at `/dev/renderer`. The honest read, written after looking at
it rather than before:

**What works.** The depth is real and the light is real. Brow ridges throw
shadows into sockets because they overhang them; noses have a lit side and a
shadowed side because they are raised; cheekbones catch the key and the hollows
beneath them fall away; the philtrum, the crease under the lower lip and the
nostrils all appear out of the occlusion term without anybody drawing them.
Twenty bare faces differ in skull, jaw, brow, nose and mouth in a way the
painted renderer could not manage. The *mechanism* is right.

**What does not.** It reads as a clay bust, not a photograph of a person. This
is the mannequin risk named above, and it landed. Analytic primitives summed
into a height field give anatomically plausible but characterless surfaces:
cheeks read as smooth mounds, the brow as a shelf, the ears as attached lumps.
Real light on adequate geometry is a different failure from a cartoon, not
automatically a nearer one.

**What that means.** The remaining gap is not lighting and not parameters. It
is *surface quality* — the thousand small irregularities that make a face a
face rather than a form. Those come from a sculptor or from scanned data. No
amount of further analytic primitives will supply them, which is the same
category of finding as "more SVG paths will not fix the vector renderer", one
level further in.

So the recommendation stands unchanged and is now evidenced twice: **the path
to the stated target runs through commissioned art.** V2 is worth keeping as
the proof that the descriptor abstraction works and that geometry-driven
lighting is the right substrate — a commissioned modular kit would composite
through exactly the same seam.

---

## Decision: the hybrid data-driven portrait system

The recommendation above was accepted, and the strategy has changed
accordingly. Anatomy is no longer computed. It is authored, and the code's job
shrinks to deciding *which* artwork a player needs and stacking it.

```
AvatarProfile          who he is, permanently         unchanged
AvatarRenderDescriptor what to draw                   unchanged
PortraitSelection      which assets, which tints      src/avatar/hybrid/select.ts
PortraitPlan           an ordered, resolved stack     src/avatar/hybrid/plan.ts
Portrait               a cached image                 src/avatar/hybrid/composite.ts
```

Nothing under `supabase/functions/_shared/avatar/` changed to make this work,
which was the whole argument for building the descriptor seam first.

**Option F, revised.** The assessment's option F was "commissioned modular art
composited at runtime", scored highest on quality and lowest on feasibility
because nobody had specified the assets. That specification now exists at
`docs/AVATAR-ASSET-SPEC.md`, and the consumer of it is built and tested. The
feasibility objection is now a procurement question rather than an engineering
one: 48 files buys an evaluation, about 190 buys a playable league, about 400
buys the full library.

**The three earlier renderers stay in the tree.** v1 vector, v1.5 painted and
v2 relief are all still importable and all still implement `PortraitRenderer`.
They are kept as the record of what was tried and why it did not work, not as
fallbacks: `PlayerAvatar.tsx` still points at the raster renderer and will keep
pointing at it until the hybrid library has artwork in it and that artwork has
been approved.
