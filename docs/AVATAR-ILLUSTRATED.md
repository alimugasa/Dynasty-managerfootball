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
| Eye constructions | 14 | `eyes/constructions.ts` |
| Eyebrows | 12 | `brows/constructions.ts` |
| Noses | 18 | `noses/constructions.ts` |
| Mouths | 14 | `mouths/constructions.ts` |
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

## Status

**Prototype, not wired into the game.** `PlayerAvatar.tsx` still points at the
raster renderer. `illustratedSvgAvatarRenderer` implements `PortraitRenderer`
and switching to it is a one-line change, deliberately not made until the
visual direction has been approved.

Known weak areas, in the order they are worth attention:

1. **Hair silhouettes.** The generated outline is correct but generic --
   several styles that should be visibly different come out as the same cap at
   different thicknesses. This is the largest remaining gap to the reference.
2. **Facial hair** reads as texture over a region rather than as a drawn shape
   with its own edge.
3. **Noses** are readable but soft; the tip and wings need more separation.
4. **Ear variety** is the thinnest family at seven.
