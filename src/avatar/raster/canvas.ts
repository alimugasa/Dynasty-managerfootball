// The painting tools.
//
// Everything soft in this renderer is a gradient with a transparent outer
// stop, not a blur filter. `ctx.filter` is the obvious way to shade a face and
// the wrong one here: it is unsupported on older Safari, slow enough to matter
// at fifty portraits a screen, and it rasterises differently between engines,
// which would make a deterministic seed produce visibly different faces on
// different devices. A radial gradient does the same job everywhere and costs
// nothing.
//
// The other thing this file owns is the grain. Skin without it reads as
// plastic, and a per-player noise field would be sixty thousand random draws a
// face. One tile, generated once, tiled under an overlay composite: texture is
// not identity, so nobody needs their own.

import type { Pt } from './anatomy';
import { smooth } from './anatomy';

export type Ctx = CanvasRenderingContext2D;

/** A Catmull-Rom path through the points, laid into the current path. */
export function trace(ctx: Ctx, points: readonly Pt[], closed: boolean): void {
  if (points.length < 2) return;
  const first = points[0] as Pt;
  ctx.moveTo(first[0], first[1]);
  for (const [c1, c2, to] of smooth(points, closed)) {
    ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], to[0], to[1]);
  }
  if (closed) ctx.closePath();
}

export function fillCurve(ctx: Ctx, points: readonly Pt[], fill: string | CanvasGradient): void {
  ctx.beginPath();
  trace(ctx, points, true);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function strokeCurve(
  ctx: Ctx, points: readonly Pt[], stroke: string, width: number, closed = false,
): void {
  ctx.beginPath();
  trace(ctx, points, closed);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/* ------------------------------------------------------------- colour ---- */

export interface Rgb { readonly r: number; readonly g: number; readonly b: number }

export function toRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

const byte = (n: number): number => Math.max(0, Math.min(255, Math.round(n)));

export const rgba = (c: Rgb, a: number): string =>
  `rgba(${String(byte(c.r))},${String(byte(c.g))},${String(byte(c.b))},${a.toFixed(3)})`;

/**
 * Move a colour along its own value.
 *
 * Toward white for a highlight and toward a warm dark for a shadow -- not
 * toward black, which greys out deep skin and turns light skin muddy. Real
 * shadow on skin keeps its hue and loses luminance, and the warm bias is the
 * subsurface red that makes a shaded cheek look like flesh rather than paint.
 */
export function shade(c: Rgb, amount: number): Rgb {
  if (amount >= 0) {
    return {
      r: c.r + (255 - c.r) * amount * 0.92,
      g: c.g + (255 - c.g) * amount * 0.88,
      b: c.b + (255 - c.b) * amount * 0.82,
    };
  }
  // The channels fall at nearly the same rate, with only a slight warm bias.
  // The first pass dropped blue almost a third faster than red, which turned
  // every olive undertone green as soon as it was shaded.
  const t = -amount;
  return {
    r: c.r * (1 - t * 0.74),
    g: c.g * (1 - t * 0.79),
    b: c.b * (1 - t * 0.82),
  };
}

export const mix = (a: Rgb, b: Rgb, t: number): Rgb => ({
  r: a.r + (b.r - a.r) * t,
  g: a.g + (b.g - a.g) * t,
  b: a.b + (b.b - a.b) * t,
});

/* -------------------------------------------------------------- shapes --- */

/**
 * A soft blob: full strength at the centre, gone by the edge.
 *
 * The workhorse. Cheek shading, eye sockets, the highlight on a forehead and
 * the shadow under a jaw are all this function with different numbers, which
 * is why the face holds together as one lighting setup instead of a dozen.
 */
export function softBlob(
  ctx: Ctx, x: number, y: number, rx: number, ry: number,
  colour: Rgb, alpha: number, rotation = 0, falloff = 0.42,
): void {
  const r = Math.max(rx, ry);
  const g = ctx.createRadialGradient(x, y, r * falloff, x, y, r);
  g.addColorStop(0, rgba(colour, alpha));
  g.addColorStop(1, rgba(colour, 0));
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(rx / r, ry / r);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

/** A soft line: a stroked curve whose alpha dies off along its width. Used for
 *  the nasolabial fold, the lid crease, the shadow under the lower lip. */
export function softLine(
  ctx: Ctx, points: readonly Pt[], colour: Rgb, alpha: number, width: number,
): void {
  ctx.save();
  for (let pass = 3; pass >= 1; pass -= 1) {
    strokeCurve(ctx, points, rgba(colour, alpha / (pass * 1.6)), width * pass * 0.8);
  }
  ctx.restore();
}

/* --------------------------------------------------------------- grain --- */

let grainTile: HTMLCanvasElement | null = null;

/**
 * One 96px noise tile, built the first time anybody asks and reused forever.
 *
 * Deliberately not seeded per player. Grain is the difference between skin and
 * vinyl; it is not a thing anybody is identified by, and giving every player
 * their own would cost nine thousand draws a face for a texture nobody could
 * tell apart.
 */
function tile(): HTMLCanvasElement | null {
  if (grainTile !== null) return grainTile;
  if (typeof document === 'undefined') return null;
  const size = 96;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d');
  if (g === null) return null;
  const img = g.createImageData(size, size);
  // A small xorshift rather than Math.random: the tile is then identical on
  // every device, which keeps two screenshots of the same player comparable.
  let s = 0x9e3779b9;
  for (let k = 0; k < img.data.length; k += 4) {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    const v = 128 + ((s & 0xff) - 128) * 0.5;
    img.data[k] = v; img.data[k + 1] = v; img.data[k + 2] = v;
    img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

/** Lay grain over whatever has been painted, inside the current clip. */
export function grain(ctx: Ctx, x: number, y: number, w: number, h: number, alpha: number): void {
  const t = tile();
  if (t === null) return;
  const pattern = ctx.createPattern(t, 'repeat');
  if (pattern === null) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = pattern;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

/** Clip everything drawn by `body` to a curve. */
export function within(ctx: Ctx, points: readonly Pt[], body: () => void): void {
  ctx.save();
  ctx.beginPath();
  trace(ctx, points, true);
  ctx.clip();
  body();
  ctx.restore();
}
