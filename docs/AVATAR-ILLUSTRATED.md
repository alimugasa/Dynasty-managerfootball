# The illustrated SVG avatar system

Original 2D illustration, drawn entirely in SVG from the identity system that
already exists. No photographs, no external artwork, no commissioned assets, no
3D. `/dev/illustrated-avatars` is where it is judged.

## Why this and not the other three

Three earlier renderers tried to synthesise a convincing face from primitives
and all three fell short of photoreal-adjacent quality for the same structural
reason, recorded in `docs/AVATAR-RENDERER-ASSESSMENT.md`. This one is not
trying: the target is a **clean, mature illustrated portrait** that a person
immediately reads as a drawing. That changes what quality means. It comes from
proportion, silhouette, feature diversity, layering and consistent art
direction rather than from surface realism, and all five of those are things
SVG is good at.

## What is drawn

| Family | Count | Where |
|---|---|---|
| Head silhouettes | 22 | `heads/shapes.ts` |
| Eye constructions | 16 | `eyes/constructions.ts` |
| Eyebrows | 12 | `brows/constructions.ts` |
| Noses | 20 | `noses/constructions.ts` |
| Mouths | 16 | `mouths/constructions.ts` |
| Ears | 7 | `ears/constructions.ts` |
| Hairstyles | 62 | `hair/styles.ts` |
| Facial hair | 27 | `facialHair/styles.ts` |
| Complexion details | 18 drawn | `details/Details.tsx` |
| Accessories | 5 drawn | `details/Details.tsx` |

The hair and facial-hair counts are 62 and 27 because that is what the identity
system can already store, and a stored id with no drawing is a player with no
hair. `tests/avatar/illustrated.test.tsx` fails if any id loses its drawing.

## The pieces

```
layout.ts      the frame: where the crown, eyes, nose, mouth and chin are,
               and how wide the silhouette is at any height
geom.ts        one curve builder, so twenty-two skulls have one curve quality
palette.ts     shading in HSL, with the hue rotations an illustrator makes
types.ts       DrawContext and Variant: the contract every family implements
select.ts      which drawing each player gets, from his morph
Portrait.tsx   the assembly, and the only file that knows the drawing order
renderer.tsx   IllustratedSvgAvatarRenderer, the same PortraitRenderer as the rest
```

Every family is a list of variants and a draw function. Adding a nose is adding
a row to an array; there is no file with hundreds of conditional branches, and
the lab can render any variant of any family without knowing what family it is.

## The things that decide whether it works

**A head shape is its own landmark set, not the average head rescaled.** A
profile is ten half-widths at ten fixed heights, plus its own vertical
proportions. A rectangle holds its width from temple to jaw; a diamond peaks at
the cheekbone; a tapered face loses width monotonically below the eye line.
Those are different curves. Scaling one silhouette is what the two rejected
renderers effectively did, and it is why a "broad" player and a "narrow" one
read as the same man at two sizes.

**Selection is a lattice, not a nearest neighbour.** Nearest-match was the first
attempt and it reached nine of the twenty-two skulls across twenty players,
because morph dimensions cluster near the population mean and the shapes at the
edges were never anybody's nearest. Skull width bands into four, length into
three, jaw into two, and an explicit table says which drawing belongs in each
of the twenty-four cells. The other families still use nearest-match, because
their parameters are directly comparable to the morph dimensions they express.

**Shading is gradients, not shapes.** The first pass laid low-opacity shapes on
the temple, cheek and jaw. Even at ten per cent a hard-edged shape reads as a
patch, and twenty faces came back blotched. Every shadow is now a shape filled
with a gradient that fades to nothing, there are four of them, and they are all
clipped to the silhouette.

**Layer order is art direction.** The beard is drawn under the mouth, so a
region covering the whole lower face *is* a full beard once the lips go on top
and no beard has to cut a hole for them. Ears go under hair. Shading goes over
skin and under features. The jersey goes over everything. Every one of those was
a visible bug in an earlier renderer before it was a rule here.

**Nothing is outlined.** A nose drawn with a contour reads as a symbol -- an
arrowhead, then a bowtie, then two lines and two dots, which is the actual
history of this project. What reads as a nose is shadow down one side of the
bridge, light along the other, a tip with volume and two wings. The skin
underneath is the lit plane and nothing draws it.

**Hair is silhouette plus treatment.** A silhouette on its own is a helmet.
Waves get curved rows following the skull, locs get separate rounded strands,
cornrows get visible parts between directional rows, curls get clustered
shapes that break the outer edge, and every style with no fall dissolves into
the skin at the bottom rather than stopping on a ruled line.

## What it does not change

`supabase/functions/_shared/avatar/` is untouched except for one colour: the
olive undertone shift, which was pushing medium and deep steps toward khaki.
That is a hex table, not identity -- the stored value is still `olive` and the
step. AvatarProfile, the seed, deterministic generation, ancestry weighting,
age progression, builds and the anti-clone registry are all as they were.

## Matching the reference

A reference grid set the bar, and closing the distance to it was mostly four
changes, none of them about adding detail:

**Proportion.** A head four fifths as wide as it is tall reads as a cartoon
head; the reference sits nearer three fifths. Everything else looked wrong
largely because it was sitting on a head of the wrong shape. `WIDTH_SCALE` in
`layout.ts` is that number.

**Crop.** The frame is portrait, not square, and the crop is fixed: chin at
four fifths of the height, crown a seventh down from the top, shoulders in
what is left. The renderer takes a width and derives the height, because a
square viewport either letterboxes the drawing or squashes it.

**Presentation.** A flat dark navy ground rather than a vignette -- twenty
vignetted portraits in a grid look like twenty spotlights -- a jersey a shade
above it, and a light collar. The collar earns its place: without it the
portrait ends in an undifferentiated dark mass.

**Cel shading.** Flat skin, one plane down the shadow side, a wedge under the
cheekbone, the underside of the jaw, a socket under each brow, and a darker rim
just inside the silhouette. The rim does the most work of any single element
here: a vector portrait without one looks like a sticker.

## Status

**Prototype, not wired into the game.** `PlayerAvatar.tsx` still points at the
raster renderer. `illustratedSvgAvatarRenderer` implements `PortraitRenderer`
and switching to it is a one-line change, deliberately not made until the
visual direction has been approved.

Known weak areas, in the order they are worth attention:

1. **Hair silhouettes.** Each family now perturbs its own outer edge -- curls
   and afros scallop, locs and twists notch, a grown-out crop is irregular, a
   barbered cut stays clean -- and every style with no fall dissolves into the
   skin rather than stopping on a ruled line. It is much better than a helmet
   and still the largest remaining gap: the reference's hair is *drawn*, this
   is *derived*.
2. **Facial hair** follows the jaw and the mouth and no longer starts on a
   ruled line across the cheeks, but it reads as texture over a region rather
   than as a shape with its own edge.
3. **Ear variety** is the thinnest family at seven.

Three bugs found here are worth not repeating, because each was invisible in
one place and obvious in another:

- The hair mass was a self-intersecting crescent. Its *fill* looked right, so
  it survived two rounds; the clip built from the same path did not agree with
  it, and the texture pass drew rows of hair straight across players' eyes
  while the fade gradient washed grey over their foreheads. The shape is now
  one non-self-intersecting loop, and a test asserts it has exactly one
  subpath.
- Eye colour ids went straight to an SVG fill. CSS makes `brown` a red and
  `dark-brown` nothing at all, so every eye in the first draft was wrong.
- Stubble was a flat fill over the lower face. At any opacity that showed, it
  desaturated the jaw into a grey trapezoid with hard edges.
