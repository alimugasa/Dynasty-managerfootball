// AvatarRendererV2: build the surface, light it, then dress it.
//
// The order matters and is the opposite of V1's. V1 drew a face and then
// shaded what it had drawn. This builds a surface first, lights every pixel of
// it with one rig, and only then puts hair and clothing on top -- so the face
// underneath is correct whether or not anything covers it, which is exactly
// what the face-only test checks.

import type { AvatarRenderDescriptor } from './descriptor';
import { buildSurface, light, normalAt, type Surface } from './shade';
import { albedoAt, hexRgb, type Rgb } from './albedo';
import { paintHairV2 } from './hairV2';

/** How hard the geometry is exaggerated. Skin at true relief is nearly flat in
 *  a front light; every renderer of faces pushes this, and the number is the
 *  difference between a portrait and a medical scan. */
const RELIEF = 380;

const clamp255 = (n: number): number => (n < 0 ? 0 : n > 255 ? 255 : n | 0);

/** The studio: one neutral ground, the same for every player. */
function ground(ctx: CanvasRenderingContext2D, size: number): void {
  const g = ctx.createRadialGradient(size * 0.40, size * 0.30, 0, size * 0.5, size * 0.5, size * 0.78);
  g.addColorStop(0, '#2b333c');
  g.addColorStop(1, '#11161b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

/** Shoulders, neck and collar, from the build. Drawn before the head so the
 *  jaw's shadow lands on the neck rather than the other way round. */
function body(
  ctx: CanvasRenderingContext2D, size: number, d: AvatarRenderDescriptor, s: Surface,
): void {
  const l = s.layout;
  const px = (v: number): number => v * size;
  // A neck is roughly two thirds the width of the head it carries, and an
  // athlete's more. The first pass drew a stalk.
  const neck = l.halfW * (0.60 + d.body.neck * 0.16);
  const shirt = hexRgb(d.body.shirt);
  const skin = hexRgb(d.colour.skin);

  // Neck: a lit cylinder, in deep shadow under the jaw.
  const ng = ctx.createLinearGradient(px(l.cx - neck), 0, px(l.cx + neck), 0);
  // Lit like the rest of him: the key is upper-left, so the neck's left side
  // catches it. The first pass left it in flat shadow and it read as a plinth.
  ng.addColorStop(0, `rgb(${clamp255(skin.r * 0.94)},${clamp255(skin.g * 0.92)},${clamp255(skin.b * 0.90)})`);
  ng.addColorStop(0.5, `rgb(${clamp255(skin.r * 0.76)},${clamp255(skin.g * 0.74)},${clamp255(skin.b * 0.73)})`);
  ng.addColorStop(1, `rgb(${clamp255(skin.r * 0.50)},${clamp255(skin.g * 0.48)},${clamp255(skin.b * 0.48)})`);
  ctx.fillStyle = ng;
  ctx.fillRect(px(l.cx - neck), px(l.chinY - 0.06), px(neck * 2), px(0.36));
  // The jaw's shadow on the neck: the deepest occlusion on the whole portrait,
  // and what stops a head looking balanced on a post.
  const jaw = ctx.createLinearGradient(0, px(l.chinY - 0.06), 0, px(l.chinY + 0.07));
  jaw.addColorStop(0, 'rgba(0,0,0,0.72)');
  jaw.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = jaw;
  ctx.fillRect(px(l.cx - neck), px(l.chinY - 0.06), px(neck * 2), px(0.13));

  // Trapezius climbing toward the ear on a heavy build, flat on a light one.
  const rise = 0.070 + d.body.traps * 0.055;
  const half = 0.34 + d.body.shoulders * 0.125;
  const sh = ctx.createLinearGradient(0, px(l.chinY + 0.06), 0, size);
  sh.addColorStop(0, `rgb(${clamp255(shirt.r * 1.18)},${clamp255(shirt.g * 1.18)},${clamp255(shirt.b * 1.18)})`);
  sh.addColorStop(1, `rgb(${clamp255(shirt.r * 0.55)},${clamp255(shirt.g * 0.55)},${clamp255(shirt.b * 0.55)})`);
  ctx.beginPath();
  ctx.moveTo(px(l.cx - half), size);
  ctx.bezierCurveTo(px(l.cx - half * 0.92), px(l.chinY + 0.20),
    px(l.cx - neck * 1.5), px(l.chinY + 0.12 - rise), px(l.cx), px(l.chinY + 0.10 - rise));
  ctx.bezierCurveTo(px(l.cx + neck * 1.5), px(l.chinY + 0.12 - rise),
    px(l.cx + half * 0.92), px(l.chinY + 0.20), px(l.cx + half), size);
  ctx.closePath();
  ctx.fillStyle = sh;
  ctx.fill();
}

/**
 * The face: one pass over the grid, shading every covered pixel.
 *
 * Written against an ImageData buffer rather than as canvas calls because the
 * whole idea is per-pixel: there is no shape to fill, only a surface to
 * evaluate.
 */
function face(
  ctx: CanvasRenderingContext2D, size: number, d: AvatarRenderDescriptor, s: Surface,
): void {
  const img = ctx.getImageData(0, 0, size, size);
  const data = img.data;
  const l = s.layout;
  const m = d.geometry;
  const grid = s.size;

  for (let j = 0; j < size; j += 1) {
    const y = (j + 0.5) / size;
    const gj = Math.min(grid - 1, (y * grid) | 0);
    for (let k = 0; k < size; k += 1) {
      const gk = Math.min(grid - 1, (((k + 0.5) / size) * grid) | 0);
      const gi = gj * grid + gk;
      const cover = s.mask[gi] as number;
      if (cover <= 0) continue;

      const x = (k + 0.5) / size;
      const a = albedoAt(d, l, m, x, y);
      const n = normalAt(s, gk, gj, RELIEF);
      const lit = light(n, s.ao[gi] as number, a.wet ? 0.95 : a.roughness);

      // Diffuse, plus the red that came back out of the skin, plus a sheen.
      const sub = a.wet ? 0 : lit.sub;
      const r = a.colour.r * lit.diffuse + a.colour.r * sub * 0.55 + 188 * lit.spec;
      const g = a.colour.g * lit.diffuse + a.colour.g * sub * 0.26 + 182 * lit.spec;
      const b = a.colour.b * lit.diffuse + a.colour.b * sub * 0.20 + 178 * lit.spec;

      // Blend against whatever is already there by the surface's own coverage,
      // so the outline is soft rather than stair-stepped.
      const p = (j * size + k) * 4;
      const alpha = Math.min(1, cover);
      data[p] = clamp255((data[p] as number) * (1 - alpha) + r * alpha);
      data[p + 1] = clamp255((data[p + 1] as number) * (1 - alpha) + g * alpha);
      data[p + 2] = clamp255((data[p + 2] as number) * (1 - alpha) + b * alpha);
      data[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Catchlights, last. A specular on a wet sphere is not something a height
 *  field of a face can produce, and an eye without one is dead. */
function catchlights(ctx: CanvasRenderingContext2D, size: number, s: Surface): void {
  const l = s.layout;
  for (const side of [-1, 1]) {
    const x = (l.cx + side * l.eyeGap - l.eyeW * 0.30) * size;
    const y = (l.eyeY - l.eyeH * 0.42) * size;
    const r = Math.max(1, l.eyeW * 0.20 * size);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,253,248,0.95)');
    g.addColorStop(1, 'rgba(255,253,248,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A vignette, because a studio backdrop falls off at the corners. */
function vignette(ctx: CanvasRenderingContext2D, size: number): void {
  const v = ctx.createRadialGradient(size / 2, size * 0.44, size * 0.32, size / 2, size / 2, size * 0.80);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, size, size);
}

/** Paint one V2 portrait into a context sized `size` x `size`. */
export function paintV2(
  ctx: CanvasRenderingContext2D, size: number, d: AvatarRenderDescriptor,
): void {
  // The surface grid is coarser than the output: normals and occlusion want
  // smoothness, and sampling the field per output pixel costs a lot for a
  // difference that the relief exaggeration swamps anyway.
  const surface = buildSurface(d.geometry, Math.min(256, Math.max(128, size >> 1)));

  ground(ctx, size);
  if (!d.bare) paintHairV2(ctx, size, d, surface, 'back');
  body(ctx, size, d, surface);
  face(ctx, size, d, surface);
  if (!d.bare) paintHairV2(ctx, size, d, surface, 'front');
  catchlights(ctx, size, surface);
  vignette(ctx, size);
}

export type { Rgb };
