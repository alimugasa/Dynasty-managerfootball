// Drawing a plan.
//
// Nothing in this file knows what a player is, what a seed is, or where a
// layer came from. It is given an ordered list of images with tints and blend
// modes and it stacks them, which is the whole point of moving anatomy out of
// code and into artwork: the drawing step stops being the hard part.
//
// It draws nothing that is not in the plan. There is no fallback shape, no
// generated head, no placeholder face -- a missing image fails the composite
// and the renderer reports it, because a drawn stand-in is worse than no
// portrait at all.

import type { PlanLayer, PortraitPlan } from './plan';
import { WARP_COLS, WARP_ROWS } from './select';

/** The spec names blend modes the way an artist does; canvas names the default
 *  one differently. One table, so the two vocabularies meet in a single place. */
const GCO: Readonly<Record<PlanLayer['blend'], GlobalCompositeOperation>> = {
  normal: 'source-over', multiply: 'multiply', overlay: 'overlay', 'soft-light': 'soft-light',
};

const images = new Map<string, Promise<HTMLImageElement | null>>();

/** Cached per URL for the life of the page. The library is static, and a
 *  fifty-three-row roster asks for the same twenty files. */
export function loadImage(url: string): Promise<HTMLImageElement | null> {
  const hit = images.get(url);
  if (hit !== undefined) return hit;
  const task = new Promise<HTMLImageElement | null>((resolve) => {
    if (typeof Image !== 'function') { resolve(null); return; }
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { resolve(img); };
    img.onerror = () => { resolve(null); };
    img.src = url;
  });
  images.set(url, task);
  return task;
}

function surface(px: number): { c: HTMLCanvasElement; x: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = px;
  c.height = px;
  const x = c.getContext('2d');
  if (x === null) return null;
  x.imageSmoothingQuality = 'high';
  return { c, x };
}

/* --------------------------------------------------------- mesh warp ---- */

/**
 * The affine that carries one triangle onto another.
 *
 * Canvas can only draw an image through an affine transform, so a bilinear
 * mesh warp is done as a triangle fan: each grid quad becomes two triangles,
 * each triangle gets its own transform and its own clip. Solving it here, pure
 * and separately, because a sign error in six numbers is invisible on screen
 * and obvious in a test.
 */
export type Pt = readonly [number, number];
export type Tri = readonly [Pt, Pt, Pt];

export function affineFor(
  src: Tri, dst: Tri,
): readonly [number, number, number, number, number, number] | null {
  const [s0, s1, s2] = src;
  const [d0, d1, d2] = dst;
  const det = (s1[0] - s0[0]) * (s2[1] - s0[1]) - (s2[0] - s0[0]) * (s1[1] - s0[1]);
  if (Math.abs(det) < 1e-9) return null;
  const a = ((d1[0] - d0[0]) * (s2[1] - s0[1]) - (d2[0] - d0[0]) * (s1[1] - s0[1])) / det;
  const b = ((d1[1] - d0[1]) * (s2[1] - s0[1]) - (d2[1] - d0[1]) * (s1[1] - s0[1])) / det;
  const c = ((d2[0] - d0[0]) * (s1[0] - s0[0]) - (d1[0] - d0[0]) * (s2[0] - s0[0])) / det;
  const d = ((d2[1] - d0[1]) * (s1[0] - s0[0]) - (d1[1] - d0[1]) * (s2[0] - s0[0])) / det;
  return [a, b, c, d, d0[0] - a * s0[0] - c * s0[1], d0[1] - b * s0[0] - d * s0[1]];
}

/** Draw an image through the warp grid. With an all-zero grid this is a plain
 *  full-frame draw, and that equivalence is what the tests pin. */
function drawWarped(
  x: CanvasRenderingContext2D, img: CanvasImageSource, px: number,
  warp: readonly (readonly [number, number])[],
): void {
  const at = (col: number, row: number): Pt => {
    const s = (col / (WARP_COLS - 1)) * px;
    const t = (row / (WARP_ROWS - 1)) * px;
    const o = warp[row * WARP_COLS + col] ?? [0, 0];
    return [s + o[0] * px, t + o[1] * px];
  };
  const flat = (col: number, row: number): Pt =>
    [(col / (WARP_COLS - 1)) * px, (row / (WARP_ROWS - 1)) * px];

  for (let row = 0; row < WARP_ROWS - 1; row += 1) {
    for (let col = 0; col < WARP_COLS - 1; col += 1) {
      const quad: readonly Tri[] = [
        [[col, row], [col + 1, row], [col, row + 1]],
        [[col + 1, row], [col + 1, row + 1], [col, row + 1]],
      ];
      for (const tri of quad) {
        const src: Tri = [flat(...tri[0]), flat(...tri[1]), flat(...tri[2])];
        const dst: Tri = [at(...tri[0]), at(...tri[1]), at(...tri[2])];
        const m = affineFor(src, dst);
        if (m === null) continue;
        x.save();
        x.beginPath();
        // Half a pixel of overlap so neighbouring triangles meet without a
        // hairline of background showing through the seam.
        const cx = (dst[0][0] + dst[1][0] + dst[2][0]) / 3;
        const cy = (dst[0][1] + dst[1][1] + dst[2][1]) / 3;
        dst.forEach(([vx, vy]: Pt, i: number) => {
          const ex = vx + Math.sign(vx - cx) * 0.5;
          const ey = vy + Math.sign(vy - cy) * 0.5;
          if (i === 0) x.moveTo(ex, ey); else x.lineTo(ex, ey);
        });
        x.closePath();
        x.clip();
        x.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
        x.drawImage(img, 0, 0, px, px);
        x.setTransform(1, 0, 0, 1, 0, 0);
        x.restore();
      }
    }
  }
}

/* ------------------------------------------------------------- tinting -- */

/** A neutral greyscale layer, coloured. Luminance keeps the strand detail; the
 *  hex supplies the hue. Alpha is restored from the source afterwards, because
 *  multiplying a colour over transparent pixels would otherwise fill the
 *  frame. */
function tinted(img: HTMLImageElement, hex: string, px: number): HTMLCanvasElement | null {
  const s = surface(px);
  if (s === null) return null;
  s.x.drawImage(img, 0, 0, px, px);
  s.x.globalCompositeOperation = 'multiply';
  s.x.fillStyle = hex;
  s.x.fillRect(0, 0, px, px);
  s.x.globalCompositeOperation = 'destination-in';
  s.x.drawImage(img, 0, 0, px, px);
  return s.c;
}

/**
 * A painted pigment anchor, carried to a player's exact tone.
 *
 * `color` keeps the artist's luminosity and takes only hue and saturation from
 * the target, which is why the modelling survives a tone change instead of
 * flattening the way a straight multiply flattened it in the painted renderer.
 * The shift is clipped to the skin mask: tinting outside it is how an olive
 * undertone turned the whites of the eyes green.
 */
function pigmented(
  img: HTMLImageElement, mask: HTMLImageElement, hex: string, px: number,
): HTMLCanvasElement | null {
  const s = surface(px);
  if (s === null) return null;
  s.x.drawImage(img, 0, 0, px, px);

  const shift = surface(px);
  if (shift === null) return s.c;
  shift.x.drawImage(img, 0, 0, px, px);
  shift.x.globalCompositeOperation = 'color';
  shift.x.fillStyle = hex;
  shift.x.fillRect(0, 0, px, px);
  shift.x.globalCompositeOperation = 'destination-in';
  shift.x.drawImage(mask, 0, 0, px, px);

  s.x.drawImage(shift.c, 0, 0);
  return s.c;
}

/* ----------------------------------------------------------- composite -- */

export interface CompositeFailure {
  readonly kind: 'no-canvas' | 'image-failed';
  readonly url?: string;
}

export type CompositeResult =
  | { readonly ok: true; readonly dataUrl: string }
  | { readonly ok: false; readonly failure: CompositeFailure };

/**
 * Stack the plan and hand back a data URL.
 *
 * Every image is loaded before anything is drawn. A half-composited portrait
 * -- hair and no face, a collar floating in front of nothing -- is the one
 * output worse than no portrait, so a single failed load aborts the whole
 * thing and the renderer falls back to initials.
 */
export async function compositePortrait(
  plan: PortraitPlan, px: number,
): Promise<CompositeResult> {
  const out = surface(px);
  if (out === null) return { ok: false, failure: { kind: 'no-canvas' } };

  const urls: readonly string[] = [plan.maskUrl, ...plan.layers.map((l) => l.url)];
  const loaded = new Map<string, HTMLImageElement>();
  const fetched = await Promise.all(urls.map(loadImage));
  for (let i = 0; i < urls.length; i += 1) {
    const url = urls[i] as string;
    const img = fetched[i];
    if (img == null) return { ok: false, failure: { kind: 'image-failed', url } };
    loaded.set(url, img);
  }
  const mask = loaded.get(plan.maskUrl);
  if (mask === undefined) return { ok: false, failure: { kind: 'image-failed', url: plan.maskUrl } };

  for (const layer of plan.layers) {
    const img = loaded.get(layer.url);
    if (img === undefined) continue;
    const source = sourceFor(layer, img, mask, plan, px) ?? img;
    out.x.save();
    out.x.globalAlpha = layer.opacity;
    out.x.globalCompositeOperation = GCO[layer.blend];
    if (layer.masked) {
      const clipped = surface(px);
      if (clipped !== null) {
        if (layer.warped) drawWarped(clipped.x, source, px, plan.warp);
        else clipped.x.drawImage(source, 0, 0, px, px);
        clipped.x.globalCompositeOperation = 'destination-in';
        clipped.x.drawImage(mask, 0, 0, px, px);
        out.x.drawImage(clipped.c, 0, 0);
      }
    } else if (layer.warped) {
      drawWarped(out.x, source, px, plan.warp);
    } else {
      out.x.drawImage(source, 0, 0, px, px);
    }
    out.x.restore();
  }

  return { ok: true, dataUrl: out.c.toDataURL('image/png') };
}

function sourceFor(
  layer: PlanLayer, img: HTMLImageElement, mask: HTMLImageElement,
  plan: PortraitPlan, px: number,
): CanvasImageSource | null {
  if (layer.kind === 'base-albedo') return pigmented(img, mask, plan.pigmentHex, px);
  if (layer.tint === null) return null;
  return tinted(img, layer.tint, px);
}
