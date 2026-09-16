# Portrait asset specification

The contract between an artist and the game.

Everything in this document describes files that **do not exist yet**. The
repository contains no portrait artwork of any kind — see
[What we do not have](#what-we-do-not-have). This is the specification those
files must satisfy so that adding them is a drop-in, with no change to player
identity, to the generator, or to any game screen.

---

## 1. Why this exists

Three renderers have now tried to synthesise a convincing human face out of
primitives — vector paths, then painted raster, then a procedural height
field. All three failed in the same place, and the reason is structural rather
than a question of effort: the thing that makes a face read as a person is
surface irregularity that nothing in the parameter set knows about. A skull is
easy to parameterise. The skin over it is not.

So the strategy changes. Anatomy stops being computed and starts being
**authored**. The procedural system keeps doing the thing it is good at —
deciding *who* a player is, permanently, from a seed — and hands that decision
to a compositor that assembles authored artwork.

```
AvatarProfile          who he is, permanently          (unchanged)
   │  describe()
AvatarRenderDescriptor what to draw                    (unchanged)
   │  selectLayers()
PortraitSelection      which assets, which tints       (new)
   │  planPortrait()
PortraitPlan           an ordered, resolved layer stack (new)
   │  composite()
Portrait               a cached image                   (new)
```

Nothing above `selectLayers()` changes when the artwork arrives. Nothing below
it exists without artwork.

## 2. What we do not have

Stated plainly, because the request asked for it to be:

- **Zero image assets.** `find` over the working tree for `png`, `jpg`,
  `jpeg`, `webp`, `avif`, `svg`, `ktx2`, `glb`, `gltf` returns nothing.
- **Three runtime dependencies**: `react`, `react-dom`, `postgres`. No image
  library, no 3D library, no texture tooling, no asset pipeline.
- **No artist, and no image generation in this project.** Nothing in this
  repository can author a photoreal or semi-real human face.
- **`docs/IP-POLICY.md` forbids the shortcut.** Real player likenesses,
  photographs and derived portraits are prohibited without exception, so
  scraped or photo-derived faces are not an option at any quality level.

The consequence is the honest one: **the target quality cannot be reached
inside this repository today.** What this repository can do — and what has
been built alongside this document — is the architecture, the specification,
and a renderer that will produce the target quality the day the files in
section 6 land in `public/avatar-assets/`.

## 3. Canvas, camera, light, crop

Every layer of every kind obeys all of this. A layer that does not is a bug in
the asset, not something the compositor corrects.

### 3.1 Canvas

| | |
|---|---|
| Authoring size | **1024 × 1024** px, square |
| Delivery sizes | 1024, 512, 256, 128 (power-of-two mips, same framing) |
| Format | PNG-24 with straight (un-premultiplied) alpha; WebP lossless accepted |
| Bit depth | 8 bits per channel |
| Colour space | **sRGB IEC61966-2.1**, embedded profile, no other profile |
| Alpha | Every layer transparent outside its own coverage. The background layer is the only opaque one. |

Mips are authored or downsampled by the artist, not by the browser: a beard
downsampled by the browser turns to mud at 64 px, and a hairline downsampled
by hand does not.

### 3.2 Head anchors

These five numbers are the whole reason a hair layer painted for one base face
sits correctly on another. They are fractions of canvas size and they are not
negotiable per asset.

| Anchor | Value | Meaning |
|---|---|---|
| `crownY` | 0.155 | top of the skull, hair excluded |
| `eyeY` | 0.395 | horizontal line through both pupil centres |
| `chinY` | 0.665 | lowest point of the chin |
| `eyeCentreX` | 0.500 | midpoint between pupils |
| `eyeSpanX` | 0.175 | pupil-to-pupil distance |
| `shoulderY` | 0.920 | top of the trapezius at the neck |

Tolerance: ±2 px at 1024. Head tilt: none — the interpupillary line is
horizontal to within 0.5°.

### 3.3 Camera

Straight-on. Yaw 0°, pitch 0°, roll 0°. Long lens — 85 mm full-frame
equivalent or longer, subject about 2 m out — so the nose does not gain the
enlargement a short lens gives it. Focus on the near eye, effectively
everything in the head sharp. No lens distortion, no chromatic aberration, no
depth-of-field falloff across the face.

### 3.4 Light

One rig, used for every asset in the library, so that a beard painted in
January composites onto a base face painted in June without a seam.

| Lamp | Azimuth | Elevation | Relative intensity |
|---|---|---|---|
| Key | 30° camera-left | 20° above the eye line | 1.00 |
| Fill | 55° camera-right | at the eye line | 0.33 |
| Rim | 140° camera-right, behind | 35° above | 0.45 |

Colour temperature 5600 K on all three, no gels, no practicals, no coloured
bounce. Soft sources: the key is a large softbox, the shadow edge under the
nose is soft rather than cut. Catchlights land at roughly 10 o'clock in each
eye — the compositor does not add catchlights, they are painted.

### 3.5 Crop and background

Head-and-shoulders. The crown sits at `crownY`, the shoulders leave the frame
at the bottom edge. The background is a dark neutral studio sweep, slightly
brighter behind the head than at the corners, and it is a **layer** — no asset
of any other kind may contain background pixels.

## 4. The layer stack

Composited in this order, back to front. The ordering is not cosmetic: the
hair mass behind the skull and the hair falling in front of it are different
files precisely because a single hair layer put a player's fringe behind his
own forehead in an earlier renderer.

| # | Kind | Directory | Notes |
|---|---|---|---|
| 0 | background | `background/` | The only opaque layer |
| 1 | shoulders (back) | `clothing/` | Indexed by build; behind the neck |
| 2 | hair (back) | `hair/` | The mass behind the skull silhouette |
| 3 | **base face** | `base-faces/` | Albedo + shading + mask, see §5 |
| 4 | complexion | `complexion/` | Freckling, moles, scarring, blotch |
| 5 | age | `age/` | Lines, weathering, hollowing |
| 6 | facial hair | `facial-hair/` | Tintable greyscale, see §5.3 |
| 7 | hair (front) | `hair/` | Hairline, fringe, fall in front of the ear |
| 8 | accessories | `accessories/` | Eye black, headband, chin strap |
| 9 | clothing (front) | `clothing/` | Collar, jersey neckline |
| 10 | grade | — | Compositor-side vignette and contrast, no file |

## 5. Base faces, and how millions of players come out of dozens of them

### 5.1 The base face is a coordinate, not a player

A base face is not "player #4127's face". It is a point in a small, structured
space that the artist covers evenly. Three axes:

**Structure family** — 12 skull-and-jaw archetypes, indexed `s0`…`s11`. The
compositor picks one by quantising the four morph dimensions that dominate the
silhouette onto a 2 × 2 × 3 lattice: `skullWidth` (2 buckets), `skullLength`
(2), and `jawWidth` and `cheekboneWidth` averaged into one midface-breadth axis
(3). Jaw and cheekbone share an axis rather than getting one each because a
wide jaw under fine cheekbones is a difference the overlays and the warp can
carry, while a long narrow skull and a short broad one are not. Every family is
a distinct person, not the same head at different widths.

**Pigment anchor** — 3 points on the 36-step skin scale: `deep` (step 5),
`mid` (step 18), `light` (step 30). Painted rather than tinted, because deep
and light skin differ in specular behaviour and in shadow hue, not only in
lightness. The compositor tints the short remaining distance to the player's
exact step and undertone; it never tints across anchors.

**Age band** — `prime` (≤ 32) and `veteran` (33+). Fine progression is the
`age/` overlay's job; the band exists because a veteran's face is set
differently, not merely lined.

Full coverage is therefore 12 × 3 × 2 = **72 base sets**.

### 5.2 What a base set contains

`base-faces/<familyId>-<pigment>-<age>/` holds three files:

| File | Content |
|---|---|
| `albedo.png` | The portrait. Shaved head, no facial hair, neutral expression, bare neck and shoulders at the reference build. Full colour, lit per §3.4. |
| `shading.png` | Greyscale, neutral hue. Form shadow, occlusion, specular. Multiplied and screened back over a retinted albedo so pigment changes do not flatten the modelling. |
| `mask.png` | Coverage alpha. White where skin is tintable, black elsewhere (eyes, lips interior, nostril, background). Tinting outside this mask is what turns an olive complexion green. |

The face is painted **without** hair, facial hair, eye black or collar. Every
one of those is a layer, and a base face that has them baked in cannot be
reused across the thousands of players who wear something else.

### 5.3 Tintable layers

Hair and facial hair are authored as **neutral greyscale with alpha** —
luminance carries the strand detail, the compositor carries the colour. One
`fade-low` file therefore serves all 17 hair colours and every greying level,
and a hair colour changing mid-career is a tint change rather than a new file.
Accessories and clothing are authored in full colour except where the manifest
marks them tintable (a jersey collar is tintable to club colours; a chin strap
is not).

### 5.4 The identity arithmetic

The obvious objection to authored anatomy is that 72 faces cannot carry a
league. They do not have to, because the base face is one factor among many:

| Factor | Count |
|---|---|
| base set | 72 |
| pigment step within the anchor's band, × undertone | 36 × 4 |
| micro-warp envelope (§5.5) | continuous, ≈ 10³ discernible |
| hairstyle × hair colour | 62 × 17 |
| facial hair × density | 26 × 5 |
| complexion overlay | 22 |
| age overlay | continuous, ≈ 4 discernible |
| accessory | 8 |
| shoulder build | 7 |

The product is in the tens of billions, which is a silly number to quote and
is not the honest one. The honest one is this: **visual distinguishability is
bounded by the base-face count.** Two players who land on the same base set,
the same pigment band and the same haircut will read as brothers. With 72 base
sets that happens rarely enough not to be noticed across a 53-man roster; with
the 12-set minimum in §6 it will be noticed, and that is the reason the
minimum is a first delivery rather than the destination.

### 5.5 The micro-warp

To stop two players on the same base set being literally identical, the
compositor applies a small per-seed mesh warp to layers 3–7 together, driven
by the morph dimensions the base-face lattice quantised away.

It is deliberately and visibly bounded: **no control point moves more than 3%
of head width**, the warp is smooth (a 5 × 7 bilinear grid, no local
pinching), and it never crosses the anchors in §3.2 — the eye line stays a
line, the chin stays the chin. It exists to break identity, not to sculpt
anatomy. Anything larger starts deforming an artist's work into something the
artist would not sign, and the answer to "these two still look alike" is
another base set, never a wider envelope.

## 6. What needs to be commissioned

Counts below are files to author, at 1024 with mips. Tier 1 is enough to judge
the pipeline on real artwork; tier 3 is the shippable library.

### Tier 1 — evaluation set (48 files)

| Kind | Count | Coverage |
|---|---|---|
| base sets | 12 (× 3 files = 36) | 4 structure families × 3 pigment anchors, `prime` only |
| hair | 4 (× 2 files = 8) | one per texture family, mid length, back + front |
| facial hair | 2 | full beard, stubble |
| clothing | 1 | one shoulder/collar pair at the median build |
| background | 1 | the studio sweep |

### Tier 2 — playable set (≈ 190 files)

| Kind | Count |
|---|---|
| base sets | 36 (× 3 = 108) — 12 families × 3 pigments, `prime` only |
| hair | 24 (× 2 = 48) — covering all four texture families at four lengths, plus fades, locs, braids, twists |
| facial hair | 14 |
| complexion | 8 |
| age | 4 |
| clothing | 5 builds |
| accessories | 4 |
| background | 1 |

### Tier 3 — full library (≈ 400 files)

Tier 2 plus the `veteran` age band across all 36 base sets (108 more files),
the remaining hairstyles to cover all 62 ids, the remaining facial-hair styles
to cover all 26, all 22 complexion overlays, all 7 builds and all 8
accessories.

### Non-negotiable brief for whoever makes them

Every asset must be an **original fictional** work. No reference to, tracing
of, or derivation from a photograph of a real person, and no likeness of any
identifiable individual. No real club marks, colours, wordmarks or logos on
any clothing layer. This is `docs/IP-POLICY.md`, and it is the one requirement
that cannot be traded against quality or schedule.

## 7. Naming and the manifest

Files live under `public/avatar-assets/`, whose runtime URL is exactly
`/avatar-assets/`. A directory with art in it but no manifest entry is
invisible to the game — the manifest is the index, not the filesystem.

```
public/avatar-assets/
  manifest.json
  base-faces/   s0-deep-prime/{albedo,shading,mask}.png …
  hair/         fade-low/{back,front}.png …
  facial-hair/  beard-full.png …
  complexion/   freckles-light.png …
  age/          lines-heavy.png …
  accessories/  eye-black-wide.png …
  clothing/     build-median/{back,front}.png …
  background/   studio.png
```

Ids are lower-kebab-case and match the trait ids already in
`supabase/functions/_shared/avatar/` wherever one exists — a hair entry names
the hairstyle ids it serves, so 62 styles can map onto 24 files without the
compositor guessing.

The manifest schema is defined and enforced in
`src/avatar/hybrid/manifest.ts`. It is validated strictly: a missing anchor, a
missing file path or an unknown layer kind makes the whole manifest invalid
and the renderer reports that it cannot draw, rather than filling in a
plausible default. That is rule 3 of `ARCHITECTURE.md` applied to artwork —
missing data is reported, never invented.

## 8. What happens until then

`src/avatar/hybrid/hybridRenderer.ts` is built and tested against this
specification. With `public/avatar-assets/` empty it does exactly one thing:
it returns `null`, which `PortraitRenderer` documents as a supported answer,
and the caller falls back to initials. It does not draw a placeholder face.
`/dev/portraits` shows the resolved layer plan for twelve players — which
assets each one would load, and which of them are missing — so the selection
logic can be verified as deterministic before a single pixel has been painted.
