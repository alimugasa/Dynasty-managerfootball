// Hair that is made of hair.
//
// The screenshots showed the failure exactly: a solid cap sitting on top of a
// skull, identical in construction whether the player had a buzz cut or an
// afro. Two styles differed by silhouette alone, and a silhouette is not what
// anybody actually reads hair by.
//
// So hair here has three constructions, not one shape with different outlines:
//
//   stipple  short cuts. Thousands of points over the scalp with a density
//            that falls off down the sides -- which is literally what a fade
//            is, and cannot be drawn as an outline at all.
//   loose    everything worn with length. A mass, then strands flowing from
//            the part or crown out to the silhouette, with curvature set by
//            the texture: straight lies, wavy undulates, curly loops, coily
//            is drawn as coils rather than as lines.
//   rope     locs, twists, braids, cornrows. Segmented ropes running back
//            over the skull along their own partings.
//
// Which one a style uses comes from the library's own `length` plus the words
// in its id, so adding a style to hair.ts gets a construction for free.

import type { FaceMorph } from '../../../supabase/functions/_shared/avatar/morph';
import { HAIRSTYLES, textureFamily } from '../../../supabase/functions/_shared/avatar/hair';
import { streamFor, type FaceRng } from '../../../supabase/functions/_shared/avatar/seed';
import { type Frame, type Pt, hairlineCurve } from './anatomy';
import { type Ctx, type Rgb, fillCurve, rgba, shade, softBlob, strokeCurve, trace } from './canvas';

type Family = 'straight' | 'wavy' | 'curly' | 'coily';

export interface HairPlan {
  readonly kind: 'none' | 'stipple' | 'loose' | 'rope';
  readonly family: Family;
  /** How far the mass stands off the skull, in head units. */
  readonly volume: number;
  /** How far it falls past the ear. */
  readonly fall: number;
  /** 0 = uniform, 1 = shaved to skin at the bottom of the sides. */
  readonly fade: number;
  readonly part: number;
}

export function hairPlan(styleId: string, texture: string): HairPlan {
  const style = HAIRSTYLES.find((h) => h.id === styleId);
  const len = style?.length ?? 'short';
  const family = textureFamily(texture);
  const has = (w: string): boolean => styleId.includes(w);

  if (len === 'none') return { kind: 'none', family, volume: 0, fall: 0, fade: 0, part: 0 };

  const rope = has('locs') || has('braid') || has('twist') || has('cornrow');
  const shortCut = len === 'short'
    && !has('afro') && !has('curls') && !has('waves') && !has('messy') && !has('side-part')
    && !has('comb') && !has('crop') && !has('ivy') && !has('top');

  const byFamily = { straight: 1, wavy: 1.5, curly: 2.3, coily: 3.0 }[family];
  const byLength = { none: 0, short: 1, medium: 2.1, long: 3.2 }[len];

  return {
    kind: rope ? 'rope' : shortCut ? 'stipple' : 'loose',
    family,
    volume: (has('afro') ? 46 : 12) + byFamily * byLength * 9,
    fall: len === 'long' ? 330 : len === 'medium' ? 120 : 0,
    fade: has('fade') || has('taper') ? 1 : has('buzz') || has('crew') ? 0.35 : 0,
    part: has('side-part') || has('comb') ? 0.6 : 0,
  };
}

/** Where the hair meets the forehead, with recession pulling the temples back
 *  into an M before it touches the middle -- which is the order it actually
 *  happens in, and the reason a receding player reads as older rather than as
 *  a different haircut. */
function hairline(f: Frame, plan: HairPlan, recession: number): readonly Pt[] {
  const peak = plan.part > 0 ? 0.4 : 0;
  const base = hairlineCurve(f, peak);
  const lift = recession * 120;
  return base.map(([x, y], k) => {
    // Smaller y is closer to the crown, so subtracting lift is what makes the
    // forehead grow. The outer points lose more than the middle, which is the
    // M a hairline actually recedes into.
    const edge = k <= 1 || k >= base.length - 2 ? 1 : k === 2 || k === base.length - 3 ? 0.78 : 0.26;
    return [x, y - lift * edge] as Pt;
  });
}

/** The mass: the skull's own curve, pushed out by the volume. */
function cap(f: Frame, m: FaceMorph, plan: HairPlan, recession: number): readonly Pt[] {
  const v = plan.volume;
  const line = hairline(f, plan, recession);
  const w = f.halfSkull;
  const over: readonly Pt[] = [
    [f.cx + w * 1.02 + v * 0.5, f.browY - 40],
    [f.cx + w * (0.62 + m.crownRound * 0.08) + v * 0.6, f.crownY + 60 - v * 0.5],
    [f.cx, f.crownY - v],
    [f.cx - w * (0.62 + m.crownRound * 0.08) - v * 0.6, f.crownY + 60 - v * 0.5],
    [f.cx - w * 1.02 - v * 0.5, f.browY - 40],
  ];
  return [...line, ...over];
}

/* ------------------------------------------------------------- stipple --- */

function stipple(
  ctx: Ctx, f: Frame, plan: HairPlan, colour: Rgb, rng: FaceRng, recession: number,
): void {
  const shape = cap(f, { crownRound: 0 } as FaceMorph, plan, recession);
  ctx.save();
  ctx.beginPath();
  trace(ctx, shape, true);
  ctx.clip();
  const top = f.crownY - plan.volume;
  const bottom = f.browY;
  const n = 2600;
  for (let k = 0; k < n; k += 1) {
    const x = f.cx + (rng.float() - 0.5) * f.halfSkull * 2.6;
    const y = top + rng.float() * (bottom - top + 120);
    // Density falls off toward the bottom of the sides. With fade at 1 that is
    // a skin fade; at 0.35 it is the softer edge of a buzz.
    const down = (y - top) / (bottom - top);
    const outward = Math.abs(x - f.cx) / f.halfSkull;
    const keep = 1 - plan.fade * Math.max(0, down * 0.75 + outward * 0.45 - 0.35);
    if (rng.float() > keep) continue;
    const a = 0.5 * keep + 0.25;
    ctx.fillStyle = rgba(rng.float() < 0.3 ? shade(colour, 0.18) : colour, a);
    ctx.fillRect(x, y, 2.6, 2.6);
  }
  ctx.restore();
}

/* --------------------------------------------------------------- loose --- */

function strands(
  ctx: Ctx, f: Frame, plan: HairPlan, colour: Rgb, rng: FaceRng, shape: readonly Pt[],
): void {
  ctx.save();
  ctx.beginPath();
  trace(ctx, shape, true);
  ctx.clip();

  const originX = f.cx + plan.part * f.halfSkull * 0.55;
  const originY = f.crownY + 40 - plan.volume * 0.5;
  const wob = { straight: 3, wavy: 12, curly: 20, coily: 8 }[plan.family];
  const period = { straight: 1, wavy: 2.2, curly: 3.6, coily: 5.5 }[plan.family];
  const n = plan.family === 'coily' ? 260 : 190;

  for (let k = 0; k < n; k += 1) {
    const a = -Math.PI * 0.05 + rng.float() * Math.PI * 1.1;
    const reach = (f.halfSkull + plan.volume) * (0.75 + rng.float() * 0.55);
    const drop = plan.fall * (0.5 + rng.float() * 0.7);
    const pts: Pt[] = [];
    const steps = 7;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const px = originX - Math.cos(a) * reach * t;
      const py = originY + Math.sin(a) * reach * t * 0.85 + drop * t * t;
      const phase = t * Math.PI * period + k;
      pts.push([px + Math.sin(phase) * wob * t, py + Math.cos(phase) * wob * t * 0.5]);
    }
    const bright = rng.float();
    ctx.globalAlpha = 0.5 + bright * 0.4;
    strokeCurve(ctx, pts, rgba(bright > 0.7 ? shade(colour, 0.26) : shade(colour, -0.10), 1),
      plan.family === 'coily' ? 5.5 : 3.4);
  }

  // Coils read as coils, not as wiggly lines: a scatter of small rings over
  // the mass is what separates an afro from a bob at a glance.
  if (plan.family === 'coily') {
    ctx.globalAlpha = 0.5;
    for (let k = 0; k < 520; k += 1) {
      const x = f.cx + (rng.float() - 0.5) * (f.halfSkull + plan.volume) * 2.3;
      const y = f.crownY - plan.volume + rng.float() * (f.browY - f.crownY + plan.volume + plan.fall);
      const r = 5 + rng.float() * 6;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 1.7);
      ctx.strokeStyle = rgba(rng.float() < 0.35 ? shade(colour, 0.24) : shade(colour, -0.16), 1);
      ctx.lineWidth = 3.2;
      ctx.stroke();
    }
  }
  ctx.restore();
}

/* ---------------------------------------------------------------- rope --- */

function ropes(
  ctx: Ctx, f: Frame, plan: HairPlan, colour: Rgb, rng: FaceRng, shape: readonly Pt[],
): void {
  ctx.save();
  ctx.beginPath();
  trace(ctx, shape, true);
  ctx.clip();
  const lanes = 13;
  for (let k = 0; k < lanes; k += 1) {
    const u = (k + 0.5) / lanes;
    const x0 = f.cx + (u - 0.5) * f.halfSkull * 2.0;
    const pts: Pt[] = [];
    // The lane hugs the skull and runs backward rather than fanning out from a
    // point: cornrows follow partings, they do not radiate.
    const crown = Math.cos((u - 0.5) * Math.PI);
    for (let i = 0; i <= 6; i += 1) {
      const t = i / 6;
      pts.push([x0 + (x0 - f.cx) * t * 0.10,
        f.trichionY - 20 - crown * 90 + t * (plan.fall * 0.5 + 150)]);
    }
    strokeCurve(ctx, pts, rgba(shade(colour, -0.28), 1), 15);
    // Segments: the beads that make a rope read as twisted rather than drawn.
    for (let i = 0; i <= 16; i += 1) {
      const t = i / 16;
      const px = x0 + (x0 - f.cx) * t * 0.10 + (rng.float() - 0.5) * 3;
      const py = f.trichionY - 20 - crown * 90 + t * (plan.fall * 0.5 + 150);
      ctx.beginPath();
      ctx.ellipse(px, py, 7.5, 5, 0, 0, Math.PI * 2);
      ctx.fillStyle = rgba(i % 2 === 0 ? shade(colour, 0.14) : shade(colour, -0.06), 0.85);
      ctx.fill();
    }
  }
  ctx.restore();
}

/* -------------------------------------------------------------- public --- */

/** Length that hangs behind the head. Drawn before the face. */
export function paintHairBack(ctx: Ctx, f: Frame, plan: HairPlan, hex: string): void {
  // Ropes carry their own length and silhouette; a mass behind them is a black
  // blob with braids drawn on it, which is what the first pass rendered.
  if (plan.fall <= 0 || plan.kind === 'rope') return;
  const c = hexRgb(hex);
  // Kept close to the skull. The first pass let it balloon a sixth wider than
  // the head, which put a black bob behind anybody with length.
  const w = f.halfSkull + plan.volume * 0.5;
  fillCurve(ctx, [
    [f.cx - w * 0.99, f.browY - 40],
    [f.cx - w * 1.02, f.gonionY + plan.fall * 0.45],
    [f.cx, f.gonionY + plan.fall * 0.8],
    [f.cx + w * 1.02, f.gonionY + plan.fall * 0.45],
    [f.cx + w * 0.99, f.browY - 40],
  ], rgba(shade(c, -0.30), 1));
}

function hexRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** The hair on the head. */
export function paintHairFront(
  ctx: Ctx, f: Frame, m: FaceMorph, plan: HairPlan, hex: string, seed: string, recession: number,
): void {
  const colour = hexRgb(hex);
  const rng = streamFor(seed, 'hair-render');

  if (plan.kind === 'none') {
    // A shaved head is a lit skull with a shadow where the hair would be, not
    // an absence. Drawing nothing is what made bald players look like dolls.
    softBlob(ctx, f.cx, f.trichionY + 40, f.halfSkull * 0.95, (f.browY - f.crownY) * 0.55,
      colour, 0.16, 0, 0.3);
    return;
  }

  const shape = cap(f, m, plan, recession);
  if (plan.kind === 'stipple') { stipple(ctx, f, plan, colour, rng, recession); return; }

  if (plan.kind === 'rope') {
    // Ropes are their own silhouette. Filling a cap behind them puts a helmet
    // under the braids, which is exactly the "shape placed on the head" the
    // whole rewrite exists to get rid of.
    ropes(ctx, f, plan, colour, rng, shape);
  } else {
    // The mass, shaded: roots dark, the top of the crown catching the key. Its
    // edge is jittered, because a hair silhouette drawn as a smooth closed
    // curve reads as moulded plastic however well the strands on top are done.
    const ragged = shape.map(([x, y], k) => {
      if (k < 7) return [x, y] as Pt;
      const n = Math.sin(k * 12.9898) * 43758.5453;
      const j = (n - Math.floor(n) - 0.5) * plan.volume * 0.55;
      return [x + j, y + j * 0.6] as Pt;
    });
    const g = ctx.createLinearGradient(f.cx - f.halfSkull, f.crownY - plan.volume,
      f.cx + f.halfSkull, f.browY);
    g.addColorStop(0, rgba(shade(colour, 0.20), 1));
    g.addColorStop(0.5, rgba(colour, 1));
    g.addColorStop(1, rgba(shade(colour, -0.32), 1));
    fillCurve(ctx, ragged, g);
    strands(ctx, f, plan, colour, rng, ragged);
    // Flyaways: strands that break the silhouette. Cheap, and the difference
    // between hair and a hat.
    ctx.save();
    for (let k = 0; k < 90; k += 1) {
      const a = Math.PI * (0.06 + rng.float() * 1.08);
      const r = f.halfSkull * 0.92 + plan.volume * 0.7;
      const x = f.cx - Math.cos(a) * r;
      const y = f.crownY + 120 - Math.sin(a) * (r * 0.85) + plan.volume * 0.2;
      const out = 6 + rng.float() * (14 + plan.volume * 0.35);
      strokeCurve(ctx, [[x, y], [x - Math.cos(a) * out, y - Math.sin(a) * out]],
        rgba(shade(colour, -0.1), 0.55), 2.2);
    }
    ctx.restore();
  }

  // The hair's own shadow onto the forehead. Hair is not painted on a skull;
  // it sits above it and blocks the light.
  softBlob(ctx, f.cx, f.trichionY + 22 + recession * 100, f.halfForehead * 1.05, 34,
    { r: 0, g: 0, b: 0 }, 0.22);
}
