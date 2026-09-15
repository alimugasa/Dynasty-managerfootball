// Facial hair that grows where facial hair grows.
//
// The old version drew a rectangle and clipped it to the face outline. You can
// see the result in any of the screenshots: a dead-straight horizontal line
// across both cheeks at mid-face, on every bearded player, in exactly the same
// place. It is the single most artificial mark in the old renderer.
//
// A beard has no straight edges and no uniform density. It is thickest on the
// chin and along the jaw, thins going up the cheek, stops at a line that
// follows the cheekbone rather than the horizon, and is patchy at its margins
// on almost everybody. So this works from a density field: a handful of zones
// whose influence falls off smoothly, sampled by thousands of individual
// hairs. The edges then come out soft because they are soft, not because a
// blur was applied to a rectangle.

import type { FaceMorph } from '../../../supabase/functions/_shared/avatar/morph';
import { streamFor } from '../../../supabase/functions/_shared/avatar/seed';
import type { Frame, Pt } from './anatomy';
import { type Ctx, type Rgb, rgba, shade, softBlob, strokeCurve, trace } from './canvas';
import type { Skin } from './paintSkin';

/** One region of growth: a soft ellipse with a weight. */
interface Zone {
  readonly x: number; readonly y: number;
  readonly rx: number; readonly ry: number;
  readonly w: number;
}

const DENSITY: Readonly<Record<string, number>> = {
  sparse: 0.34, light: 0.52, medium: 0.72, thick: 0.86, dense: 1,
};

/**
 * Which zones a style grows in.
 *
 * Read as anatomy rather than as a picture: a goatee is chin plus moustache, a
 * chin strap is jawline only, a full beard is all of them. Adding a style to
 * the library means naming its zones, not drawing its outline.
 */
function zones(f: Frame, m: FaceMorph, id: string): readonly Zone[] {
  const jawY = f.gonionY + (f.gnathionY - f.gonionY) * 0.55;
  const chin: Zone = { x: f.cx, y: f.gnathionY - 70, rx: f.halfChin * 1.9, ry: 100, w: 1 };
  const moustache: Zone = { x: f.cx, y: f.stomionY - 44, rx: 105 + m.mouthWidth * 20, ry: 42, w: 1 };
  const jawL: Zone = { x: f.cx - f.halfGonion * 0.82, y: jawY, rx: 150, ry: 130, w: 1 };
  const jawR: Zone = { x: f.cx + f.halfGonion * 0.82, y: jawY, rx: 150, ry: 130, w: 1 };
  const cheekL: Zone = { x: f.cx - f.halfZygion * 0.80, y: f.zygionY + 130, rx: 130, ry: 120, w: 0.85 };
  const cheekR: Zone = { x: f.cx + f.halfZygion * 0.80, y: f.zygionY + 130, rx: 130, ry: 120, w: 0.85 };
  const neck: Zone = { x: f.cx, y: f.gnathionY + 60, rx: f.halfGonion, ry: 90, w: 0.7 };
  const soul: Zone = { x: f.cx, y: f.stomionY + 62, rx: 34, ry: 28, w: 1 };
  const sideL: Zone = { x: f.cx - f.halfZygion * 0.95, y: f.browY + 70, rx: 46, ry: 120, w: 0.9 };
  const sideR: Zone = { x: f.cx + f.halfZygion * 0.95, y: f.browY + 70, rx: 46, ry: 120, w: 0.9 };

  const all = [chin, moustache, jawL, jawR, cheekL, cheekR, sideL, sideR];
  if (id === 'clean') return [];
  if (id.startsWith('stubble')) return id === 'stubble-neck' ? [...all, neck] : all;
  if (id.startsWith('beard')) {
    if (id === 'beard-patchy') return [chin, jawL, jawR, moustache];
    if (id === 'beard-short' || id === 'beard-boxed' || id === 'beard-tapered') return all;
    return [...all, neck];
  }
  if (id === 'beard-connected') return [...all, neck];
  if (id.startsWith('mustache')) return [moustache];
  if (id === 'goatee') return [chin, soul];
  if (id === 'goatee-circle' || id === 'van-dyke' || id === 'balbo') return [chin, moustache, soul];
  if (id === 'chin-strap') return [jawL, jawR, sideL, sideR, { ...chin, w: 0.8 }];
  if (id === 'chin-beard') return [chin];
  if (id === 'soul-patch') return [soul];
  if (id === 'anchor') return [chin, moustache];
  if (id === 'horseshoe') return [moustache, { ...chin, rx: 60, w: 0.9 }];
  if (id.startsWith('sideburns')) return id === 'sideburns-long' ? [sideL, sideR, jawL, jawR] : [sideL, sideR];
  return all;
}

/** How long the hairs are, which decides whether this is stubble or a beard. */
function hairLength(id: string): number {
  if (id.startsWith('stubble')) return 0;
  if (id.includes('long')) return 34;
  if (id.includes('full') || id.includes('medium')) return 20;
  if (id.includes('short') || id.includes('boxed') || id.includes('tapered')) return 12;
  return 9;
}

export function paintBeard(
  ctx: Ctx, f: Frame, m: FaceMorph, s: Skin, id: string, density: string,
  hairHex: string, seed: string, outline: readonly Pt[],
): void {
  const zs = zones(f, m, id);
  if (zs.length === 0) return;

  const rng = streamFor(seed, 'beard-render');
  const strength = DENSITY[density] ?? 0.72;
  const len = hairLength(id);
  const colour: Rgb = {
    r: parseInt(hairHex.slice(1, 3), 16),
    g: parseInt(hairHex.slice(3, 5), 16),
    b: parseInt(hairHex.slice(5, 7), 16),
  };

  // The density field at a point: the strongest zone wins, with the others
  // adding a little. Summing them all would make overlaps into hot spots.
  const at = (x: number, y: number): number => {
    let best = 0;
    let extra = 0;
    for (const z of zs) {
      const dx = (x - z.x) / z.rx;
      const dy = (y - z.y) / z.ry;
      const d = 1 - Math.min(1, Math.sqrt(dx * dx + dy * dy));
      const v = d * d * z.w;
      if (v > best) { extra += best * 0.3; best = v; } else extra += v * 0.3;
    }
    return Math.min(1, best + extra * 0.4);
  };

  ctx.save();
  ctx.beginPath();
  trace(ctx, outline, true);
  ctx.clip();

  // Shadow first: even light stubble darkens the skin under it, and that
  // shading is most of why a beard sits on a face rather than over it.
  for (const z of zs) {
    softBlob(ctx, z.x, z.y, z.rx * 0.95, z.ry * 0.95, s.deep, 0.16 * strength * z.w);
  }

  const count = len === 0 ? 5200 : 3400;
  const x0 = f.cx - f.halfSkull * 1.1;
  const span = f.halfSkull * 2.2;
  const y0 = f.browY;
  const yspan = (f.gnathionY + 140) - y0;

  for (let k = 0; k < count; k += 1) {
    const x = x0 + rng.float() * span;
    const y = y0 + rng.float() * yspan;
    const d = at(x, y) * strength;
    if (d <= 0.02 || rng.float() > d) continue;
    // Patchiness: everybody has some, and 'patchy' has a lot. A perfectly even
    // beard is the other way to look fake.
    if (id === 'beard-patchy' && rng.float() < 0.45) continue;

    const a = 0.25 + d * 0.55;
    if (len === 0) {
      ctx.fillStyle = rgba(colour, a * 0.85);
      ctx.fillRect(x, y, 2.4, 2.4);
    } else {
      // Hairs lie down and outward, following the jaw.
      const fall = len * (0.5 + rng.float() * 0.9) * (0.4 + d);
      const drift = (x - f.cx) / f.halfSkull * fall * 0.45;
      strokeCurve(ctx, [[x, y], [x + drift * 0.4, y + fall * 0.6], [x + drift, y + fall]],
        rgba(rng.float() < 0.25 ? shade(colour, 0.22) : colour, a), 2.2);
    }
  }
  ctx.restore();

  // A beard with length breaks the jaw's silhouette. Without this it still
  // reads as paint on skin however well the hairs are drawn.
  if (len >= 12 && (id.startsWith('beard') || id === 'chin-strap')) {
    const grow = len * 0.9;
    const skirt: readonly Pt[] = [
      [f.cx - f.halfGonion * 0.94, f.gonionY + 20],
      [f.cx - f.halfChin * 1.5, f.gnathionY + grow * 0.7],
      [f.cx, f.gnathionY + grow * 1.15],
      [f.cx + f.halfChin * 1.5, f.gnathionY + grow * 0.7],
      [f.cx + f.halfGonion * 0.94, f.gonionY + 20],
    ];
    ctx.save();
    ctx.beginPath();
    trace(ctx, skirt, true);
    ctx.clip();
    // Strands, not a fill. A solid shape here is the flat beard mask by
    // another name -- it is what put a black bib on every bearded player in
    // the first raster pass, having already done it in the SVG one.
    for (let k = 0; k < 4200; k += 1) {
      const x = f.cx + (rng.float() - 0.5) * f.halfGonion * 2.1;
      const y = f.gonionY - 30 + rng.float() * (grow * 1.5 + 70);
      const d = at(x, Math.min(y, f.gnathionY + 20)) * strength;
      if (d <= 0.05 || rng.float() > d + 0.35) continue;
      const fall = len * (0.6 + rng.float() * 0.8);
      strokeCurve(ctx, [[x, y], [x + (x - f.cx) * 0.05, y + fall * 0.6], [x + (x - f.cx) * 0.09, y + fall]],
        rgba(rng.float() < 0.28 ? shade(colour, 0.22) : shade(colour, -0.22), 0.45 + d * 0.4), 2.6);
    }
    ctx.restore();
  }
}
