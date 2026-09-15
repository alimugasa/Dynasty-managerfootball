// A face as a depth map.
//
// This is the whole difference between V2 and everything before it. V1 painted
// shadows where a face has shadows; this builds the *surface* and lets a light
// find the shadows itself. A brow ridge is not a dark smear under the brow --
// it is a raised band, and the socket behind it is dark because the geometry
// turns away from the key. Get the height field right and the shading is not
// an artistic problem any more.
//
// Everything is evaluated on a square grid in face space: x and y run 0..1
// across the portrait, height comes back in the same units. Nothing here knows
// about canvases or pixels; `shade.ts` samples it.
//
// The forms are analytic on purpose. A mesh would need vertices, topology and
// an artist; a sum of smooth primitives needs fifty-five numbers, which is
// exactly what the descriptor carries.

import type { FaceMorph } from '../../../supabase/functions/_shared/avatar/morph';

export interface Layout {
  readonly cx: number;
  readonly crownY: number;
  readonly browY: number;
  readonly eyeY: number;
  readonly noseTipY: number;
  readonly baseY: number;
  readonly mouthY: number;
  readonly chinY: number;
  readonly halfW: number;
  readonly zygW: number;
  readonly zygY: number;
  readonly jawW: number;
  readonly jawY: number;
  readonly chinW: number;
  readonly eyeGap: number;
  readonly eyeW: number;
  readonly eyeH: number;
  readonly earY: number;
  readonly earH: number;
}

/** The same proportions the painted renderer used, in 0..1 space. Kept because
 *  they were never the problem: the anthropometry was right and the *surface*
 *  was missing. */
export function layout(m: FaceMorph): Layout {
  const crownY = 0.085;
  const chinY = crownY + 0.60;
  const h = chinY - crownY;
  // Bizygomatic width runs about 0.78 of crown-to-chin. At 0.196 the head was
  // two thirds as wide as it was tall, which reads as a tall block whatever is
  // drawn on it.
  const halfW = (0.234 + m.skullWidth * 0.024) * (1 + m.skullLength * -0.03);
  const browY = crownY + h * (0.458 - m.browHeight * 0.024);
  const baseY = crownY + h * (0.716 + m.noseLength * 0.054);
  return {
    cx: 0.5,
    crownY,
    browY,
    eyeY: crownY + h * (0.516 + m.eyeLine * 0.024),
    noseTipY: baseY - h * (0.034 + m.noseProjection * 0.006),
    baseY,
    mouthY: crownY + h * (0.812 + m.philtrumLength * 0.022) + (baseY - crownY - h * 0.716) * 0.28,
    chinY,
    halfW,
    zygW: halfW * (1 + m.cheekboneWidth * 0.055),
    zygY: crownY + h * (0.524 - m.cheekboneHeight * 0.046),
    jawW: halfW * (0.805 + m.jawWidth * 0.125 + m.gonialFlare * 0.05),
    jawY: crownY + h * (0.762 + m.jawLength * 0.048),
    chinW: halfW * (0.245 + m.chinWidth * 0.09),
    eyeGap: h * (0.156 + m.eyeSpacing * 0.030),
    eyeW: h * (0.076 + m.eyeWidth * 0.017),
    eyeH: h * (0.023 + m.eyeHeight * 0.010),
    earY: crownY + h * 0.60,
    earH: h * (0.30 + m.earSize * 0.03),
  };
}

/** A smooth bump: 1 at the centre, 0 at the edge, with no hard rim. */
function bump(dx: number, dy: number, rx: number, ry: number, power = 2): number {
  const d = Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2);
  if (d >= 1) return 0;
  const t = 1 - d;
  return power === 2 ? t * t * (3 - 2 * t) : Math.pow(t, power);
}

/**
 * The silhouette half-width at a given height down the face.
 *
 * Nine control widths interpolated smoothly, not a chain of straight segments.
 * The first version was piecewise-linear with hard joins between the ranges,
 * and the result was a head shaped like a hexagonal nut -- the shading was
 * correct and the thing being shaded was a polygon.
 */
function halfWidthAt(l: Layout, m: FaceMorph, t: number): number {
  const z = l.zygW / l.halfW;
  const j = l.jawW / l.halfW;
  const c = l.chinW / l.halfW;
  // crown ... cranium ... temples ... cheekbones ... jaw ... chin
  // The crown starts wide. A near-zero first stop makes the spline overshoot
  // into a cone above the skull -- the same overshoot that gave the vector
  // renderer pointed heads, arrived at from the other direction.
  const stops = [0.46, 0.62, 0.86, 0.97, 1.00, z, z * 0.97, j, j * 0.72, c, 0.10];
  const at = (k: number): number => stops[Math.max(0, Math.min(stops.length - 1, k))] as number;
  const pos = [-0.06, 0.02, 0.12, 0.26, 0.42, 0.545, 0.64, 0.775, 0.885, 0.972, 1.04];
  let k = 0;
  while (k < pos.length - 2 && t > (pos[k + 1] as number)) k += 1;
  const a = pos[k] as number;
  const b = pos[k + 1] as number;
  const u = Math.min(1, Math.max(0, (t - a) / (b - a)));
  // Catmull-Rom through the four surrounding stops: smooth, and it keeps the
  // widest point where the cheekbone actually is instead of rounding it off.
  const p0 = at(k - 1); const p1 = at(k); const p2 = at(k + 1); const p3 = at(k + 2);
  const w = 0.5 * ((2 * p1) + (-p0 + p2) * u
    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u
    + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
  // The chin's corner is square on some men and pointed on others.
  const squared = t > 0.86 ? Math.pow(Math.max(0, (t - 0.86) / 0.14), 1.4) * m.jawAngle * 0.10 : 0;
  return l.halfW * Math.max(0, w + squared);
}

/**
 * Coverage: 1 well inside the silhouette, 0 outside, soft across the edge.
 *
 * Soft matters. A binary mask gives a stair-stepped outline that no amount of
 * good shading recovers, because the jaggies sit exactly where the eye looks
 * for the shape.
 */
export function inside(l: Layout, m: FaceMorph, x: number, y: number): number {
  const h = l.chinY - l.crownY;
  const t = (y - l.crownY) / h;
  if (t < -0.05 || t > 1.07) return 0;
  const w = halfWidthAt(l, m, t);
  if (w <= 0) return 0;
  const side = x > l.cx ? 1 : -1;
  const wide = w * (1 + side * m.asymJaw * 0.016);
  const dx = Math.abs(x - l.cx);
  const edge = h * 0.006;
  if (dx >= wide + edge) return 0;
  if (dx <= wide - edge) return 1;
  const u = (wide + edge - dx) / (edge * 2);
  return u * u * (3 - 2 * u);
}

/** How far across the head a point is, 0 at the midline and 1 at the
 *  silhouette. The cross-section uses this rather than the coverage, so the
 *  soft edge does not flatten the sides of the skull. */
function across(l: Layout, m: FaceMorph, x: number, y: number): number {
  const t = (y - l.crownY) / (l.chinY - l.crownY);
  const w = halfWidthAt(l, m, t);
  return w <= 0 ? 1 : Math.min(1, Math.abs(x - l.cx) / w);
}

/**
 * The surface, at one point.
 *
 * Read it as a sculptor's order of operations: the cranium as a mass, then the
 * planes of the face cut into it, then the features added on top. Every
 * coefficient is a morph dimension, so two players are not the same surface
 * with different paint.
 */
export function height(l: Layout, m: FaceMorph, x: number, y: number): number {
  if (inside(l, m, x, y) <= 0) return 0;

  const dx = x - l.cx;
  const adx = Math.abs(dx);
  const h = l.chinY - l.crownY;
  const t = (y - l.crownY) / h;

  // The cranial mass as an ellipsoid: a circular cross-section at every height,
  // scaled by how far down the head you are. sqrt(1 - r^2) is a sphere; the
  // previous sqrt-of-coverage was a cone with a flat top.
  const r = across(l, m, x, y);
  const round = Math.sqrt(Math.max(0, 1 - r * r));
  // Front-to-back profile: deepest around the brow, tapering to crown and chin.
  const profile = Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.46) / 0.68, 2)));
  let z = round * profile * (0.30 + m.skullWidth * 0.02);

  // The face is flatter than the skull. Planing the front down is what stops a
  // head reading as a ball with features stuck on it.
  z -= bump(dx, y - (l.browY + l.chinY) / 2, l.halfW * 1.15, h * 0.42) * 0.055;

  // Brow ridge: a band above the eyes, heavier toward the middle.
  z += bump(dx, y - l.browY, l.halfW * 0.92, h * 0.030)
    * (0.020 + m.browRidge * 0.016) * (1 - adx / (l.halfW * 1.4));

  // Eye sockets, cut behind the ridge. Deep-set eyes cut harder.
  for (const s of [-1, 1]) {
    z -= bump(dx - s * l.eyeGap, y - (l.eyeY - h * 0.006), l.eyeW * 1.9, h * 0.050)
      * (0.016 + m.eyeDepth * 0.010);
    // The eyeball fills most of the socket back. Too deep a socket and the
    // occlusion term buries the whole eye, which is what turned them into
    // black slots on the first pass.
    z += bump(dx - s * l.eyeGap, y - l.eyeY, l.eyeW * 1.25, l.eyeH * 3.8) * 0.024;
  }
  // The nasion: the bridge root dips between the sockets on everybody.
  z -= bump(dx, y - (l.browY + h * 0.028), h * 0.038, h * 0.022) * 0.012;

  // Temples hollow, cheekbones rise, the hollow under them cuts back.
  for (const s of [-1, 1]) {
    z -= bump(dx - s * l.halfW * 0.86, y - (l.browY - h * 0.03), l.halfW * 0.22, h * 0.07)
      * (0.012 - m.templeWidth * 0.004);
    z += bump(dx - s * l.zygW * 0.66, y - l.zygY, l.halfW * 0.38, h * 0.075)
      * (0.020 + m.cheekboneWidth * 0.014);
    z -= bump(dx - s * l.zygW * 0.60, y - (l.zygY + h * 0.10), l.halfW * 0.32, h * 0.08)
      * (0.014 - m.cheekFullness * 0.012);
    // Cheek volume sits lower and forward on a full face.
    z += bump(dx - s * l.zygW * 0.50, y - (l.zygY + h * 0.12), l.halfW * 0.34, h * 0.09)
      * Math.max(0, m.cheekFullness) * 0.018;
  }

  // The nose: a dorsum running root to tip, a lobule, and two wings.
  const bridgeW = h * (0.030 + m.bridgeWidth * 0.010);
  const noseUp = l.browY + h * 0.020;
  if (y > noseUp - h * 0.02 && y < l.baseY + h * 0.02) {
    const t = Math.min(1, Math.max(0, (y - noseUp) / (l.noseTipY - noseUp)));
    const lean = m.asymNose * 0.004 * t;
    const along = Math.sin(Math.min(1, t) * Math.PI * 0.62);
    z += bump(dx - lean, 0, bridgeW * (0.8 + t * 0.7), 1, 3)
      * (0.020 + m.bridgeHeight * 0.016) * (0.35 + along * 0.65);
  }
  const tipR = h * (0.042 + m.tipRound * 0.011);
  z += bump(dx, y - l.noseTipY, tipR, tipR * 0.80) * (0.034 + m.noseProjection * 0.012);
  const alar = h * (0.062 + m.nostrilWidth * 0.020 + m.alarFlare * 0.011);
  for (const s of [-1, 1]) {
    z += bump(dx - s * alar * 0.78, y - (l.baseY - h * 0.016), alar * 0.55, h * 0.026) * 0.022;
    // Nostril openings: the only places on a face that go properly dark.
    z -= bump(dx - s * alar * 0.50, y - (l.baseY - h * 0.008),
      h * (0.012 + m.nostrilWidth * 0.005), h * 0.008) * 0.050;
  }

  // Philtrum: two ridges with a groove between them.
  z += bump(dx, y - (l.baseY + l.mouthY) / 2, h * 0.026, (l.mouthY - l.baseY) * 0.5) * 0.010;
  z -= bump(dx, y - (l.baseY + l.mouthY) / 2, h * 0.008, (l.mouthY - l.baseY) * 0.45) * 0.009;

  // Lips: two volumes with the stomion cut between them.
  const mw = h * (0.098 + m.mouthWidth * 0.024);
  const upH = h * (0.016 + m.upperLip * 0.010);
  const loH = h * (0.020 + m.lowerLip * 0.012);
  const mx = dx - m.asymMouth * 0.003;
  z += bump(mx, y - (l.mouthY - upH * 0.55), mw, upH) * (0.014 + m.lipProtrusion * 0.008);
  z += bump(mx, y - (l.mouthY + loH * 0.60), mw * 0.92, loH) * (0.018 + m.lipProtrusion * 0.010);
  z -= bump(mx, y - l.mouthY, mw * 0.98, h * 0.005) * 0.022;
  // The sulcus under the lower lip, and the chin rising in front of it.
  z -= bump(mx, y - (l.mouthY + loH * 1.7), mw * 0.72, h * 0.016) * 0.014;
  z += bump(dx, y - (l.chinY - h * 0.075 - m.chinLength * 0.012), l.chinW * 1.5, h * 0.055)
    * (0.020 + m.chinProjection * 0.016);
  if (m.chinCleft > 0.3) {
    z -= bump(dx, y - (l.chinY - h * 0.07), h * 0.008, h * 0.030) * m.chinCleft * 0.014;
  }

  // The jaw's own edge: a ridge running from the chin back toward the ear.
  for (const s of [-1, 1]) {
    z += bump(dx - s * l.jawW * 0.80, y - l.jawY, l.halfW * 0.22, h * 0.055)
      * (0.010 + m.gonialFlare * 0.010);
  }

  return z;
}

/** Ears live outside the silhouette and so outside `height`: they are their own
 *  little surfaces, added by the shader after the head. */
export function earHeight(l: Layout, m: FaceMorph, s: -1 | 1, x: number, y: number): number {
  const out = 0.004 + (m.earProtrusion + 1) * 0.0045;
  const ex = l.cx + s * (l.halfW * 0.90 + out);
  const ew = l.earH * (0.40 + m.earSize * 0.04) * 0.5;
  const dx = x - ex;
  const dy = y - l.earY;
  const shell = bump(dx, dy, ew, l.earH * 0.5);
  if (shell <= 0) return 0;
  // Helix rim raised, concha bowl sunk: the contrast between those two is what
  // makes an ear read as an ear rather than a lump.
  const rim = bump(Math.abs(dx) - ew * 0.62, dy, ew * 0.34, l.earH * 0.42);
  const bowl = bump(dx + s * ew * 0.18, dy - l.earH * 0.02, ew * 0.46, l.earH * 0.22);
  return shell * 0.016 + rim * 0.012 - bowl * 0.014;
}
