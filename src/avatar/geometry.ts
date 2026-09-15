// Turning trait names into coordinates.
//
// The trait libraries hold roughly five hundred named options between them --
// fifty-one skulls, thirty-five noses, thirty eye shapes. Hand-tuning a set of
// numbers for every one of those is a week of work that would then have to be
// redone every time somebody adds an option, and the request is explicit that
// the library sizes are "design targets, not requirements to manually create
// hundreds of image files immediately".
//
// So this reads the names. Trait ids in this project are descriptive by
// convention -- 'ovoid-tall', 'wide-flat', 'almond-deep' -- and the words in
// them are the vocabulary a face is actually described in. Where a name says
// something this file understands, it is applied; where it says something else,
// a hash of the id supplies a small stable jitter so two traits that share
// every keyword are still not identical.
//
// The honest limitation, stated rather than buried: this gives a face that is
// genuinely determined by its traits, and it does not give the fine
// distinctions a sculptor would draw between two similar nose names. A
// higher-fidelity renderer -- layered art, pre-rendered portraits -- would
// replace this file wholesale and nothing under _shared/avatar/ would change,
// which is the point of the interface in portrait.ts.

import type { AvatarProfile } from '../../supabase/functions/_shared/avatar/profile';
import { BUILD_SHAPES } from '../../supabase/functions/_shared/avatar/build';

/** Stable 0-1 from a trait id. FNV-1a, same as the generator's, so a trait
 *  jitters the same way on every device. */
export function hashTrait(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 8) / 0x01000000;
}

/** Centred jitter: -1 to 1. */
const jitter = (id: string): number => hashTrait(id) * 2 - 1;

type Keywords = Readonly<Record<string, number>>;

/**
 * What a name says, summed.
 *
 * Every keyword that appears in the id contributes, so 'ovoid-tall-narrow'
 * gets both the tall and the narrow. Compound names are the norm in these
 * libraries and reading only the first word would flatten most of them.
 */
function keywords(id: string, table: Keywords): number {
  let total = 0;
  for (const [word, delta] of Object.entries(table)) {
    if (id.includes(word)) total += delta;
  }
  return total;
}

const WIDTH: Keywords = {
  narrow: -0.1, fine: -0.07, tapered: -0.05, oblong: -0.06, long: -0.04,
  wide: 0.1, broad: 0.09, wider: 0.09, heavy: 0.06, blocky: 0.06,
  squared: 0.05, brachy: 0.08, barrel: 0.06, full: 0.04, compact: 0.03,
};

const HEIGHT: Keywords = {
  tall: 0.09, long: 0.08, oblong: 0.07, high: 0.05, domed: 0.04,
  short: -0.08, compact: -0.07, flat: -0.05, low: -0.04, soft: -0.02,
  round: -0.03, wide: -0.03,
};

/** A value that varies with the trait's name and never leaves its band. */
function dim(id: string, table: Keywords, spread: number, base = 1): number {
  return base + keywords(id, table) + jitter(id) * spread;
}

/** 0-1 continuous traits arrive centred on 0.5; this maps them to a symmetric
 *  multiplier without letting an extreme draw produce a caricature. */
const lerp = (v: number, range: number): number => 1 + (v - 0.5) * range;

export interface Geometry {
  /* the frame */
  readonly cx: number;
  readonly cy: number;
  readonly headW: number;
  readonly headH: number;
  /* the outline, top to chin down the right side; mirrored for the left */
  readonly skullW: number;
  readonly templeW: number;
  readonly cheekW: number;
  readonly jawW: number;
  readonly chinW: number;
  readonly cheekY: number;
  readonly jawY: number;
  readonly chinY: number;
  readonly crownY: number;
  /* features */
  readonly browY: number;
  readonly browW: number;
  readonly browThick: number;
  readonly browArch: number;
  readonly eyeY: number;
  readonly eyeGap: number;
  readonly eyeW: number;
  readonly eyeH: number;
  readonly eyeTilt: number;
  readonly noseY: number;
  readonly noseW: number;
  readonly noseH: number;
  readonly noseBridge: number;
  readonly mouthY: number;
  readonly mouthW: number;
  readonly lipUpper: number;
  readonly lipLower: number;
  readonly earY: number;
  readonly earH: number;
  readonly earOut: number;
  readonly hairlineY: number;
  /* below the collar */
  readonly neckW: number;
  readonly neckY: number;
  readonly shoulderW: number;
  readonly shoulderY: number;
}

/**
 * The whole face as numbers, in a 100x100 box.
 *
 * Everything is derived and nothing is stored: a profile always produces the
 * same geometry, so this can be recomputed freely rather than cached
 * alongside the profile and kept in sync with it.
 */
export function faceGeometry(profile: AvatarProfile): Geometry {
  const i = profile.identity;
  const a = profile.appearance;
  const build = BUILD_SHAPES[a.build];

  // Age thickens a face slightly and lengthens the ear and the nose, which is
  // most of what actually reads as "older" from the front at this scale.
  const years = a.ageWear;

  const widthTraits = dim(i.baseHead, WIDTH, 0.05) * dim(i.faceShape, WIDTH, 0.04);
  const heightTraits = dim(i.baseHead, HEIGHT, 0.05) * dim(i.faceShape, HEIGHT, 0.04);

  // Clamped to what the frame can hold. Traits multiply, so the tall end of
  // one library crossed with the tall end of another produced a skull whose
  // crown sat above the viewBox and was silently cropped -- and hair is drawn
  // above the crown, so it went first. The bands are wide enough that the
  // clamp only catches the compounded extremes.
  const bound = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

  const headW = bound(46 * widthTraits * lerp(i.faceWidth, 0.22)
    * (1 + (build.fullness - 1) * 0.35) * (1 + years * 0.03), 34, 54);
  const headH = bound(56 * heightTraits * lerp(i.faceLength, 0.2), 44, 62);

  const cx = 50;
  const cy = 45;
  const crownY = cy - headH * 0.52;
  const chinY = cy + headH * 0.48;

  const cheekTrait = dim(i.cheekbones, WIDTH, 0.05);
  const jawTrait = dim(i.jaw, WIDTH, 0.05);
  const chinTrait = dim(i.chin, WIDTH, 0.06);

  const browY = cy - headH * 0.08;
  const eyeY = cy - headH * 0.01;
  // A nose that grows with age, and a philtrum that does not: the mouth stays
  // where it is and the gap above it closes, which is the real change.
  const noseY = cy + headH * 0.16 + years * 0.6;
  const mouthY = cy + headH * 0.29;

  return {
    cx, cy, headW, headH, crownY, chinY,
    skullW: headW * 0.47,
    templeW: headW * 0.485 * (1 - years * 0.01),
    cheekW: headW * 0.5 * cheekTrait * (1 + (build.fullness - 1) * 0.2),
    jawW: headW * 0.44 * jawTrait * (1 + (build.fullness - 1) * 0.3),
    chinW: headW * 0.17 * chinTrait,
    cheekY: cy + headH * 0.06,
    jawY: cy + headH * 0.3,

    browY,
    browW: headW * 0.18,
    browThick: 1.1 + i.eyebrowThickness * 2.2 + keywords(i.eyebrows, { thick: 0.6, bushy: 0.9, thin: -0.5, fine: -0.4 }),
    browArch: keywords(i.eyebrows, { arched: 1.6, high: 1.2, straight: -0.6, flat: -0.8, angled: 0.6 })
      + jitter(i.eyebrows) * 0.5,

    eyeY,
    eyeGap: headW * (0.21 + (i.eyeSpacing - 0.5) * 0.06),
    eyeW: headW * 0.15 * dim(i.eyes, { wide: 0.12, large: 0.1, round: 0.06, narrow: -0.12, small: -0.1, hooded: -0.04 }, 0.05),
    eyeH: headW * 0.052 * dim(i.eyes, { round: 0.25, large: 0.18, wide: 0.1, narrow: -0.22, hooded: -0.18, almond: -0.05 }, 0.08)
      * (1 - i.eyeDepth * 0.12) * (1 - years * 0.08),
    eyeTilt: keywords(i.eyes, { upturned: 1.5, 'up-': 1.2, downturned: -1.5, 'down-': -1.2 }) + jitter(i.eyes) * 0.6,

    noseY,
    noseW: headW * 0.13 * lerp(i.noseWidth, 0.5)
      * dim(i.nose, { wide: 0.16, broad: 0.14, flared: 0.12, flat: 0.08, narrow: -0.16, fine: -0.12, thin: -0.14 }, 0.05),
    noseH: headH * 0.17 * dim(i.nose, { long: 0.14, 'high-bridge': 0.06, short: -0.14, button: -0.16, upturned: -0.08 }, 0.05)
      * (1 + years * 0.05),
    noseBridge: dim(i.nose, { aquiline: 0.5, hooked: 0.6, roman: 0.45, convex: 0.4, concave: -0.4, scooped: -0.5, straight: 0 }, 0.12, 0) ,

    mouthY,
    mouthW: headW * 0.16 * dim(i.lips, { wide: 0.16, full: 0.06, narrow: -0.14, small: -0.12 }, 0.05),
    lipUpper: 1 + i.lipFullness * 2.4 * dim(i.lips, { full: 0.3, everted: 0.35, thin: -0.4, fine: -0.3 }, 0.06),
    lipLower: 1.4 + i.lipFullness * 3 * dim(i.lips, { full: 0.3, everted: 0.4, thin: -0.4 }, 0.06),

    earY: cy - headH * 0.02,
    earH: headH * 0.2 * (1 + years * 0.07) * dim(i.ears, { large: 0.15, long: 0.12, small: -0.15, short: -0.1 }, 0.06),
    earOut: 1 + i.earProtrusion * 2.6 + keywords(i.ears, { protruding: 1.2, flat: -0.8, pinned: -1 }),

    // Where the hair starts, before age moves it. Measured down from the
    // crown so a tall skull does not put the hairline in a different place on
    // the face than a short one does.
    hairlineY: crownY + headH * (0.19 + keywords(i.hairline, {
      high: 0.05, receded: 0.08, 'widows-peak': 0.02, low: -0.05, straight: 0, rounded: -0.01,
    })) + a.recession * headH * 0.16,

    // Half-widths. The first version stored full widths and drew them as
    // half-widths, which gave every player a neck as wide as his head.
    neckW: headW * 0.21 * build.neck,
    neckY: chinY - 3,
    shoulderW: headW * 1.05 * build.shoulders,
    // High enough that the body is a body. At 84 the collar was a band along
    // the bottom edge and every player looked like a head on a horizon.
    shoulderY: 78,
  };
}

/**
 * A closed, smooth outline through the points that define a face.
 *
 * Catmull-Rom through the point list, converted to cubic beziers. Written
 * rather than pulled in because it is fifteen lines and the alternative is a
 * dependency in the bundle for fifteen lines.
 */
export function smoothPath(points: readonly (readonly [number, number])[]): string {
  if (points.length < 3) return '';
  const at = (k: number): readonly [number, number] =>
    points[(k + points.length) % points.length] as readonly [number, number];
  let d = `M ${String(at(0)[0])} ${String(at(0)[1])}`;
  for (let k = 0; k < points.length; k += 1) {
    const [x0, y0] = at(k - 1);
    const [x1, y1] = at(k);
    const [x2, y2] = at(k + 1);
    const [x3, y3] = at(k + 2);
    const c1x = x1 + (x2 - x0) / 6;
    const c1y = y1 + (y2 - y0) / 6;
    const c2x = x2 - (x3 - x1) / 6;
    const c2y = y2 - (y3 - y1) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }
  return `${d} Z`;
}

/** The face outline itself: crown, temples, cheekbones, jaw, chin, mirrored. */
export function facePath(g: Geometry): string {
  const { cx } = g;
  const right: readonly (readonly [number, number])[] = [
    [cx, g.crownY],
    [cx + g.skullW, g.crownY + g.headH * 0.2],
    [cx + g.templeW, g.browY],
    [cx + g.cheekW, g.cheekY],
    [cx + g.jawW, g.jawY],
    [cx + g.chinW, g.chinY - g.headH * 0.04],
    [cx, g.chinY],
  ];
  const left = [...right].slice(1, -1).reverse().map(
    ([x, y]) => [cx - (x - cx), y] as const,
  );
  return smoothPath([...right, ...left]);
}
