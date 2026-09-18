// Where everything on a face is, in head units.
//
// The coordinate space is the fix for two separate problems at once. Everything
// here is measured in a box 1000 units tall running crown to chin, with x
// centred on 500 -- so the renderer scales by head *height* and lets width
// vary. A 330-pound lineman and a 185-pound corner then occupy the same amount
// of the frame while looking nothing alike, which is what a studio portrait
// series actually does and what the first renderer got wrong by scaling both
// axes.
//
// The landmarks are the ones portrait painters and anthropometrists use --
// trichion, glabella, nasion, zygion, gonion, subnasale, stomion, gnathion --
// because the classical proportions between them are what make a drawing read
// as a human head rather than as a face-shaped arrangement of features. The
// morph moves them; it does not invent them.

import type { FaceMorph } from '../../../supabase/functions/_shared/avatar/morph';

export type Pt = readonly [number, number];
export type Side = -1 | 1;

/** The horizontal and vertical skeleton every feature hangs off. */
export interface Frame {
  readonly cx: number;
  /* the vertical run, crown to chin */
  readonly crownY: number;
  readonly trichionY: number;
  readonly browY: number;
  readonly eyeY: number;
  readonly nasionY: number;
  readonly tipY: number;
  readonly subnasaleY: number;
  readonly stomionY: number;
  readonly gnathionY: number;
  /* the widths, as half-widths from cx */
  readonly halfSkull: number;
  readonly halfForehead: number;
  readonly halfTemple: number;
  readonly halfZygion: number;
  readonly zygionY: number;
  readonly halfGonion: number;
  readonly gonionY: number;
  readonly halfChin: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * The frame.
 *
 * The thirds are the classical ones -- hairline to brow, brow to nose base,
 * nose base to chin -- and the morph stretches each independently, which is
 * where most of the visible difference between two faces actually comes from.
 * Two men with the same features and different thirds do not look alike; two
 * with the same thirds and different features very nearly do, which is the
 * trap the first renderer fell into.
 */
export function landmarks(m: FaceMorph): Frame {
  const trichionY = 238 + m.foreheadHeight * 78;
  const browY = 458 - m.browHeight * 24 + m.foreheadHeight * 14;
  const subnasaleY = 716 + m.noseLength * 54;
  // Bizygomatic width runs about 0.78 of crown-to-chin on an adult male. The
  // first pass used 0.67, which is why every head came out as an egg.
  const halfSkull = 392 + m.skullWidth * 46;
  const halfZygion = halfSkull * (1.0 + m.cheekboneWidth * 0.055);

  return {
    cx: 500,
    crownY: 0,
    trichionY,
    browY,
    // Eyes sit a shade below the halfway line on most faces, not on the brow.
    eyeY: 516 + m.eyeLine * 24,
    nasionY: browY + 26,
    tipY: subnasaleY - 34 - m.noseProjection * 6,
    subnasaleY,
    stomionY: 812 + m.philtrumLength * 22 + (subnasaleY - 716) * 0.28,
    gnathionY: 1000,

    halfSkull,
    halfForehead: halfSkull * (0.855 + m.foreheadWidth * 0.075),
    halfTemple: halfSkull * (0.905 + m.templeWidth * 0.065),
    halfZygion,
    zygionY: 524 - m.cheekboneHeight * 46,
    halfGonion: halfZygion * (0.805 + m.jawWidth * 0.125 + m.gonialFlare * 0.05),
    gonionY: 762 + m.jawLength * 48,
    halfChin: 96 + m.chinWidth * 38,
  };
}

/**
 * The silhouette, as ten points down one side and their mirror.
 *
 * Ten rather than the previous six, and each one owned by a different morph
 * dimension: the crown by crownRound, the forehead by foreheadWidth, the
 * temple by templeWidth, the widest point by cheekboneWidth *and* its height,
 * the jaw angle by jawWidth and gonialFlare, the chin by chinWidth. That is
 * what makes two outlines differ at a glance instead of by a hash.
 *
 * `asymJaw` shifts the lower half of one side only. It is small enough that
 * nobody would call the face crooked and large enough that it stops reading as
 * a mask.
 */
export function headOutline(f: Frame, m: FaceMorph): readonly Pt[] {
  const side = (s: Side): readonly Pt[] => {
    const asym = 1 + s * m.asymJaw * 0.035;
    const zy = f.zygionY;
    const go = f.gonionY;
    return [
      // Two points across the top rather than one: a single apex with distant
      // neighbours makes the spline overshoot into a cone, which is what gave
      // the first pass its pointed skulls.
      [f.cx + s * f.halfSkull * 0.30, f.crownY + 14 - m.crownRound * 8],
      [f.cx + s * f.halfSkull * (0.66 + m.crownRound * 0.10), f.crownY + 96 - m.crownRound * 24],
      [f.cx + s * f.halfForehead, f.trichionY + 18 - m.foreheadSlope * 16],
      [f.cx + s * f.halfTemple, f.browY - 18],
      [f.cx + s * f.halfZygion * asym, zy],
      [f.cx + s * lerp(f.halfZygion, f.halfGonion, 0.58) * asym, zy + (go - zy) * 0.56],
      [f.cx + s * f.halfGonion * asym, go],
      // The angle of the jaw between gonion and chin: square jaws hold their
      // width down toward the chin, tapered ones give it up immediately.
      [f.cx + s * f.halfGonion * (0.60 + m.jawAngle * 0.14) * asym, go + (f.gnathionY - go) * 0.44],
      [f.cx + s * f.halfChin * 1.06 * asym, f.gnathionY - 58 - m.chinLength * 22],
    ];
  };
  const right = side(1);
  const left = [...side(-1)].reverse();
  return [[f.cx, f.crownY], ...right, [f.cx, f.gnathionY], ...left];
}

/** Where the hair starts, as a curve rather than a line: a hairline is a shape
 *  and its shape is most of what separates a widow's peak from a straight one. */
export function hairlineCurve(f: Frame, peak: number): readonly Pt[] {
  const y = f.trichionY;
  const w = f.halfForehead;
  return [
    [f.cx - w * 1.02, y + 118],
    [f.cx - w * 0.92, y + 26],
    [f.cx - w * 0.52, y - 8],
    [f.cx, y + peak * 34],
    [f.cx + w * 0.52, y - 8],
    [f.cx + w * 0.92, y + 26],
    [f.cx + w * 1.02, y + 118],
  ];
}

/**
 * The neck and shoulders.
 *
 * Returned as numbers rather than a path because the painter needs to shade
 * the neck's own cylinder and the shadow the jaw throws onto it, and both want
 * the edges separately. The build's whole job above the collar is here: a
 * lineman's trapezius starts climbing toward the ear, a corner's does not.
 */
export interface Body {
  readonly neckHalf: number;
  readonly neckTopY: number;
  readonly trapRise: number;
  readonly shoulderHalf: number;
  readonly shoulderY: number;
}

export function bodyShape(f: Frame, m: FaceMorph): Body {
  return {
    // A neck is roughly two thirds the width of the head it carries, and an
    // athlete's is more. The first pass drew a bottle.
    neckHalf: 216 + m.neckWidth * 92 + m.jawWidth * 16,
    neckTopY: f.gnathionY - 52,
    trapRise: 110 + m.trapSize * 150,
    shoulderHalf: 560 + m.shoulderWidth * 230,
    shoulderY: f.gnathionY + 205,
  };
}

/**
 * Catmull-Rom through a point list, as cubic control points.
 *
 * Returned as triples rather than drawn, so the same curve can be filled,
 * stroked, clipped or used as a shading boundary without recomputing it.
 */
export function smooth(points: readonly Pt[], closed: boolean): readonly (readonly [Pt, Pt, Pt])[] {
  const n = points.length;
  const at = (k: number): Pt => {
    if (closed) return points[(k + n) % n] as Pt;
    return points[Math.max(0, Math.min(n - 1, k))] as Pt;
  };
  const out: (readonly [Pt, Pt, Pt])[] = [];
  const last = closed ? n : n - 1;
  for (let k = 0; k < last; k += 1) {
    const [x0, y0] = at(k - 1);
    const [x1, y1] = at(k);
    const [x2, y2] = at(k + 1);
    const [x3, y3] = at(k + 2);
    out.push([
      [x1 + (x2 - x0) / 6, y1 + (y2 - y0) / 6],
      [x2 - (x3 - x1) / 6, y2 - (y3 - y1) / 6],
      [x2, y2],
    ]);
  }
  return out;
}
