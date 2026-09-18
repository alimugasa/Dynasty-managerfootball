// Eyes, built the way an eye is built.
//
// The old renderer drew a symmetrical lens and put a circle in it, which is
// why every player had the same stare. A real palpebral fissure is not
// symmetrical in either axis: the upper lid peaks about a third of the way in
// from the inner corner, the lower lid troughs about two thirds of the way
// out, and the offset between those two is most of what the eye reads as. The
// iris is always cropped by the upper lid -- an iris floating clear of both
// lids is the single most doll-like thing a drawn face can do.
//
// Everything below is driven by the morph: width, height, angle, spacing,
// depth, lid heaviness, crease height, lower-lid fullness. Two men with
// different numbers here do not look related.

import type { FaceMorph } from '../../../supabase/functions/_shared/avatar/morph';
import type { Frame, Pt, Side } from './anatomy';
import { type Ctx, fillCurve, mix, rgba, shade, softBlob, softLine, strokeCurve, toRgb, trace, within } from './canvas';
import type { Skin } from './paintSkin';

const IRIS: Readonly<Record<string, string>> = {
  'dark-brown': '#3a2415', brown: '#5b3a1f', 'light-brown': '#7d5527',
  hazel: '#6f6134', amber: '#96682a', green: '#4a6642',
  blue: '#5d7f97', 'grey-blue': '#6f8797', grey: '#787f7e',
  heterochromic: '#5b3a1f',
};

export function eyeGap(m: FaceMorph): number {
  return 156 + m.eyeSpacing * 30;
}

/** The opening, as the two lid margins meeting at the corners. */
function fissure(f: Frame, m: FaceMorph, side: Side): {
  readonly upper: readonly Pt[]; readonly lower: readonly Pt[];
  readonly inner: Pt; readonly outer: Pt; readonly cx: number; readonly cy: number;
  readonly hw: number; readonly hh: number;
} {
  const asym = 1 + side * m.asymEye * 0.05;
  const cx = f.cx + side * eyeGap(m);
  const cy = f.eyeY + side * m.asymEye * 5;
  const hw = (76 + m.eyeWidth * 17) * asym;
  const hh = (23 + m.eyeHeight * 10) * asym;
  // A positive angle lifts the outer corner. The inner corner barely moves --
  // it is pinned to the tear duct.
  const tilt = m.eyeAngle * 11;
  const inner: Pt = [cx - side * hw, cy + tilt * 0.25];
  const outer: Pt = [cx + side * hw, cy - tilt];
  const upperPeak = cx - side * hw * 0.28;
  const lowerTrough = cx + side * hw * 0.30;
  return {
    inner, outer, cx, cy, hw, hh,
    upper: [inner, [upperPeak, cy - hh * (1 + m.eyeHeight * 0.1)], [cx + side * hw * 0.5, cy - hh * 0.72], outer],
    lower: [outer, [lowerTrough, cy + hh * 0.94], [cx - side * hw * 0.45, cy + hh * 0.64], inner],
  };
}

/** One eye. */
function paintEye(
  ctx: Ctx, f: Frame, m: FaceMorph, s: Skin, side: Side, irisHex: string,
): void {
  const e = fissure(f, m, side);
  const opening: readonly Pt[] = [...e.upper, ...e.lower.slice(1, -1)];

  // The socket the eyeball sits in, painted before the eye so the lids read as
  // sitting on top of something.
  softBlob(ctx, e.cx, e.cy - 6, e.hw * 1.5, e.hh * 3.4, s.deep, 0.16 + m.eyeDepth * 0.12);

  within(ctx, opening, () => {
    // Sclera: never white. A white sclera in a shaded face looks like a hole.
    const sclera = mix(s.base, { r: 246, g: 242, b: 236 }, 0.86);
    ctx.fillStyle = rgba(sclera, 1);
    ctx.fillRect(e.cx - e.hw * 1.2, e.cy - e.hh * 2, e.hw * 2.4, e.hh * 4);
    // Corners fall into shadow, the inner one hardest.
    softBlob(ctx, e.inner[0], e.inner[1], e.hw * 0.5, e.hh * 1.3, s.deep, 0.34);
    softBlob(ctx, e.outer[0], e.outer[1], e.hw * 0.42, e.hh * 1.2, s.deep, 0.24);

    // Iris. Sits high enough that the upper lid always crops it.
    const ir = e.hw * 0.42;
    const iy = e.cy - e.hh * 0.10;
    const base = toRgb(IRIS[irisHex] ?? IRIS['dark-brown'] ?? '#3a2415');
    const g = ctx.createRadialGradient(e.cx - ir * 0.25, iy - ir * 0.3, ir * 0.1, e.cx, iy, ir);
    g.addColorStop(0, rgba(shade(base, 0.26), 1));
    g.addColorStop(0.62, rgba(base, 1));
    g.addColorStop(1, rgba(shade(base, -0.45), 1));
    ctx.beginPath();
    ctx.arc(e.cx, iy, ir, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    // Striations, then the limbal ring that makes an iris read as wet.
    ctx.save();
    ctx.beginPath(); ctx.arc(e.cx, iy, ir, 0, Math.PI * 2); ctx.clip();
    ctx.strokeStyle = rgba(shade(base, -0.3), 0.30);
    ctx.lineWidth = ir * 0.07;
    for (let k = 0; k < 14; k += 1) {
      const a = (k / 14) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(e.cx + Math.cos(a) * ir * 0.30, iy + Math.sin(a) * ir * 0.30);
      ctx.lineTo(e.cx + Math.cos(a) * ir, iy + Math.sin(a) * ir);
      ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(e.cx, iy, ir * 0.94, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(shade(base, -0.62), 0.75);
    ctx.lineWidth = ir * 0.17;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(e.cx, iy, ir * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(14,10,8,0.95)';
    ctx.fill();

    // The shadow the upper lid throws across the top of the eyeball. Without
    // it the eye sits in front of the face instead of inside it.
    softBlob(ctx, e.cx, e.cy - e.hh * 1.15, e.hw * 1.1, e.hh * 1.25, s.deep, 0.5, 0, 0.05);

    // Catchlight, upper-left, because the key light is upper-left for everyone.
    ctx.beginPath();
    ctx.arc(e.cx - ir * 0.34, iy - ir * 0.36, ir * 0.20, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,253,248,0.92)';
    ctx.fill();
  });

  // Lash line: thick along the upper margin, thin and broken along the lower.
  const lash = mix(s.deep, { r: 26, g: 18, b: 14 }, 0.72);
  strokeCurve(ctx, e.upper, rgba(lash, 0.92), 6.5 + m.lidHeavy * 2.2);
  strokeCurve(ctx, e.lower, rgba(lash, 0.34), 2.6);

  // The lid itself, as a plane above the lash line. Heavier lids hang lower
  // and hide more of the crease.
  const lidDrop = m.lidHeavy * 9;
  const lidTop: readonly Pt[] = e.upper.map(([x, y]) => [x, y - 26 + lidDrop] as Pt);
  softBlob(ctx, e.cx, e.cy - e.hh - 16 + lidDrop, e.hw * 1.05, 20,
    s.sh, 0.20 + m.lidHeavy * 0.18);

  // Crease. A monolid gets none; a deep-set double lid gets a clear one.
  if (m.lidCrease > -0.35) {
    const h = 30 + m.lidCrease * 16 - m.lidHeavy * 10;
    const crease: readonly Pt[] = [
      [e.inner[0] + side * 8, e.inner[1] - h * 0.55],
      [e.cx - side * e.hw * 0.2, e.cy - e.hh - h],
      [e.outer[0] - side * 10, e.outer[1] - h * 0.62],
    ];
    softLine(ctx, crease, s.deep, 0.18 + m.lidCrease * 0.12, 4);
  }

  // Lower lid ridge: a thin lit edge under the eye, then the fullness above it.
  softLine(ctx, e.lower.map(([x, y]) => [x, y + 9] as Pt), s.hi, 0.22, 3);
  if (m.lowerLid > 0) {
    softBlob(ctx, e.cx, e.cy + e.hh + 14, e.hw * 0.9, 14, s.hi, m.lowerLid * 0.18);
  }

  // Tear duct.
  softBlob(ctx, e.inner[0] + side * 5, e.inner[1] + 2, 9, 7, s.warm, 0.55, 0, 0.2);
  void lidTop;
}

export function paintEyes(ctx: Ctx, f: Frame, m: FaceMorph, s: Skin, irisHex: string): void {
  paintEye(ctx, f, m, s, -1, irisHex);
  paintEye(ctx, f, m, s, 1, irisHex);
}

/**
 * Brows, as tapered shapes with hairs on them.
 *
 * A stroked arc -- what the old renderer drew -- has one thickness end to end,
 * which is why every player had the same caterpillar. A real brow has a blunt
 * head, a thick body, an arch and a thin tail, and the position of that arch
 * along its length is as individual as a nose.
 */
export function paintBrows(ctx: Ctx, f: Frame, m: FaceMorph, hairHex: string): void {
  const colour = toRgb(hairHex);
  for (const side of [-1, 1] as Side[]) {
    const gap = eyeGap(m);
    const hw = 76 + m.eyeWidth * 17;
    const lift = 44 + m.browHeight * 20 - m.lidHeavy * 6 + side * m.asymBrow * 6;
    const y = f.browY - lift;
    const head: Pt = [f.cx + side * (gap - hw * 1.02), y + 16 + m.browCurve * 4];
    const arch: Pt = [f.cx + side * (gap + hw * 0.18), y - 12 - m.browCurve * 16];
    const tail: Pt = [f.cx + side * (gap + hw * (1.05 + m.browLength * 0.16)),
      y + 8 - m.browCurve * 2 + m.browTaper * 8];
    const t = 11 + m.browThickness * 7;

    const spine: readonly Pt[] = [head, arch, tail];
    const top: readonly Pt[] = [
      [head[0], head[1] - t * 0.8], [arch[0], arch[1] - t], [tail[0], tail[1] - t * 0.30],
    ];
    const bottom: readonly Pt[] = [
      [tail[0], tail[1] + t * 0.18], [arch[0], arch[1] + t * 0.72], [head[0], head[1] + t * 0.86],
    ];
    fillCurve(ctx, [...top, ...bottom], rgba(shade(colour, -0.12), 0.88));

    // Hairs, lying the way brow hairs lie: up and out at the head, flat over
    // the arch, down along the tail.
    ctx.save();
    ctx.beginPath();
    trace(ctx, [...top, ...bottom], true);
    ctx.clip();
    ctx.strokeStyle = rgba(shade(colour, 0.22), 0.5);
    ctx.lineWidth = 1.6;
    for (let k = 0; k < 26; k += 1) {
      const u = k / 25;
      const px = head[0] + (tail[0] - head[0]) * u;
      const py = head[1] + (arch[1] - head[1]) * Math.sin(u * Math.PI) + (tail[1] - head[1]) * u * 0.4;
      const rise = (1 - u) * 16 - u * 6;
      ctx.beginPath();
      ctx.moveTo(px, py + t * 0.5);
      ctx.lineTo(px + side * 10, py - rise);
      ctx.stroke();
    }
    ctx.restore();
    void spine;
  }
}
