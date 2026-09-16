// The shape of a haircut.
//
// One builder, because a hairstyle's silhouette is not free-form: it is the
// skull plus a thickness that varies down the head, cut off at a fade line,
// and bounded at the front by a hairline. Those four things are what actually
// differ between a low fade and a full afro, and authoring sixty-two outlines
// by hand would mean sixty-two chances to draw a helmet.

import { clamp, closedPath, lerp, openPath, pt, type Pt } from '../geom';
import type { FaceLayout } from '../layout';
import type { HairStyle } from './styles';

export interface HairOutline {
  /** The hair, as one non-self-intersecting loop. Safe to fill, to stroke and
   *  to clip with, under any fill rule. */
  readonly mass: string;
  /** The outer boundary as an OPEN path -- up one side, over the crown, down
   *  the other. Strokes use this rather than `mass`, whose boundary also runs
   *  along the hairline and would draw a line across the forehead. */
  readonly arc: string;
  /** Where the hairline crosses the centre line. Facial-hair and detail layers
   *  need it to know where the forehead ends. */
  readonly hairlineY: number;
  readonly topY: number;
  readonly endY: number;
  /** Half-width of the mass at a height, for scattering texture over it. */
  readonly halfAt: (y: number) => number;
}

/** Temples sit a little higher than the centre on every real hairline, so
 *  `side` is negative almost everywhere. A hairline with side at zero is a
 *  ruled line across the forehead. */
const HAIRLINE: Record<HairStyle['hairline'], { side: number; centre: number }> = {
  straight: { side: -0.030, centre: 0.010 },
  rounded: { side: -0.004, centre: -0.014 },
  widow: { side: -0.038, centre: 0.044 },
  receding: { side: -0.090, centre: 0.014 },
  irregular: { side: -0.022, centre: 0.004 },
};

const SAMPLES = 12;

export function hairOutline(l: FaceLayout, s: HairStyle, recession: number): HairOutline {
  const topY = l.crownY - l.faceH * s.top;
  const fadeY = l.crownY + l.faceH * s.fadeT;
  /* The mass ends at the fade line, not at the ear. Taking the larger of the
     two left a band of full-strength hair below where the fade gradient
     stopped, and that band is why every short cut rendered as a slab with a
     ruled bottom edge. */
  const endY = fadeY + l.faceH * s.fall;
  const rec = clamp(recession, 0, 1);

  const hl = HAIRLINE[s.hairline];
  const baseT = 0.150 + rec * 0.105;
  const hairlineY = l.crownY + l.faceH * (baseT + hl.centre);
  const sideY = l.crownY + l.faceH * (baseT + hl.side - rec * 0.055);

  const thickness = (y: number): number => {
    const t = clamp((y - topY) / Math.max(1e-6, fadeY - topY), 0, 1);
    // Smooth, so a fade is a fade and not a step. The taper starts below the
    // ear line, which is where a barber starts it.
    const k = t < 0.42 ? 0 : Math.pow((t - 0.42) / 0.58, 1.4);
    const drop = s.fade * k;
    const past = y > fadeY ? clamp((y - fadeY) / Math.max(1e-6, l.faceH * 0.22), 0, 1) : 0;
    return l.faceH * s.volume * Math.max(0, 1 - drop) * (1 - past * (s.fall > 0.02 ? 0.25 : 0.9));
  };

  const skull = (y: number): number => l.halfAt(clamp(y, l.crownY + 1, l.chinY - 1));
  /* Below the ear the mass has to come in, or a style with any fall at all
     renders as two rectangular slabs beside the head. Hair that hangs narrows
     and ends; it does not stop square. */
  const taperAt = (y: number): number => {
    const past = clamp((y - l.earY) / Math.max(1e-6, l.faceH * 0.55), 0, 1);
    return 1 - past * past * 0.55;
  };
  const outerHalf = (y: number): number => (skull(y) + thickness(y)) * taperAt(y);

  /* The outer edge, per construction.
   *
   * Skull-plus-thickness gives every family the same smooth outline, and a
   * smooth outline is a helmet however it is textured. What actually separates
   * an afro from a fade in silhouette is the edge: curls scallop, locs and
   * twists notch, a grown-out crop is irregular, a barbered cut is clean. This
   * is bounded -- it modulates the thickness, never the skull. */
  const wob = stream(`${s.id}:edge`);
  const wobbles = Array.from({ length: SAMPLES + 1 }, () => wob());
  const edge = (i: number, thick: number): number => {
    const r = wobbles[i] ?? 0.5;
    switch (s.family) {
      case 'curls':
      case 'afro':
        return thick * (0.62 + 0.62 * Math.abs(Math.sin(i * 1.9 + r))) ;
      case 'locs':
      case 'twists':
      case 'braids':
        return thick * (i % 2 === 0 ? 1.20 : 0.74);
      case 'crop':
      case 'sweep':
      case 'long':
        return thick * (0.86 + r * 0.32);
      default:
        return thick;
    }
  };

  const outer: Pt[] = [];
  for (let i = 0; i <= SAMPLES; i += 1) {
    const y = lerp(topY, endY, i / SAMPLES);
    outer.push(pt(l.cx + skull(y) * taperAt(y) + edge(i, thickness(y) * taperAt(y)), y));
  }

  const inner: Pt[] = [];
  for (let i = SAMPLES; i >= 0; i -= 1) {
    const y = lerp(sideY, endY, i / SAMPLES);
    // The inner edge follows the skull, and below the jaw it follows the jaw
    // in, so the two boundaries close into a point rather than a box.
    const past = clamp((y - l.earY) / Math.max(1e-6, l.faceH * 0.55), 0, 1);
    inner.push(pt(l.cx + skull(y) * (0.985 - past * 0.10), y));
  }

  // The hairline itself, right to left across the forehead.
  const hairSpan = skull(hairlineY) * 0.90;
  const front: Pt[] = s.hairline === 'irregular'
    ? [
        pt(l.cx + hairSpan * 0.92, sideY),
        pt(l.cx + hairSpan * 0.58, hairlineY + l.faceH * 0.007),
        pt(l.cx + hairSpan * 0.26, hairlineY - l.faceH * 0.005),
        pt(l.cx, hairlineY + l.faceH * 0.004),
        pt(l.cx - hairSpan * 0.30, hairlineY - l.faceH * 0.003),
        pt(l.cx - hairSpan * 0.62, hairlineY + l.faceH * 0.008),
        pt(l.cx - hairSpan * 0.92, sideY),
      ]
    : [
        pt(l.cx + hairSpan * 0.94, sideY),
        pt(l.cx + hairSpan * 0.62, hairlineY),
        pt(l.cx, hairlineY),
        pt(l.cx - hairSpan * 0.62, hairlineY),
        pt(l.cx - hairSpan * 0.94, sideY),
      ];

  const mirror = (p: Pt): Pt => pt(2 * l.cx - p.x, p.y);
  // Domes the crown. Without it the hair is cut flat across the top, which is
  // the helmet look in one line of geometry.
  const apex = pt(l.cx, topY - l.faceH * s.volume * 0.55 - l.faceH * 0.004);

  /* One simple loop, traced the long way round: up the left outside, over the
     crown, down the right outside, in and up the right inside, across the
     hairline, down the left inside, closed.
   *
   * Two earlier shapes failed here and both failures were invisible in the
   * fill and obvious everywhere else. A single winding crescent nonzero-filled
   * the forehead; splitting it into a cap and a punched-out hole fixed the
   * fill but left the clip and the mask disagreeing with it, so the texture
   * pass drew rows of hair straight across players' eyes. A loop that does not
   * cross itself needs no fill rule, no mask and no even-odd anything: it
   * clips the way it looks. */
  const points: Pt[] = [
    ...[...outer].reverse().map(mirror),
    apex,
    ...outer,
    ...inner,
    ...front,
    ...[...inner].reverse().map(mirror),
  ];

  const mass = closedPath(points, 0.95);
  const arc = openPath([...[...outer].reverse().map(mirror), apex, ...outer], 0.95);

  return {
    mass,
    arc,
    hairlineY,
    topY,
    endY,
    halfAt: outerHalf,
  };
}

/** A tiny deterministic stream, so scattered texture lands in the same place
 *  every render. Nothing here may reach for Math.random: a portrait that
 *  reshuffles its curls on a rerender is a portrait of a different man. */
export function stream(seed: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193) >>> 0;
  }
  return () => {
    h = (h + 0x9e3779b9) >>> 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
