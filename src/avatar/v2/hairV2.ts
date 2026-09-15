// Hair and facial hair, lit by the same rig as the face.
//
// Still strands rather than shapes -- that part of V1 was right -- but two
// things change. The strands take their brightness from the same key light
// direction the skin does, so hair belongs to the same photograph instead of
// being a decal on top of one. And the beard is sampled against the face's own
// depth, so it thins where the surface turns away and thickens in the hollows,
// which is what a beard actually does and what a density map alone could not
// know.

import type { AvatarRenderDescriptor } from './descriptor';
import type { Surface } from './shade';
import { hexRgb, type Rgb } from './albedo';

const clamp255 = (n: number): number => (n < 0 ? 0 : n > 255 ? 255 : n | 0);
const css = (c: Rgb, a: number): string =>
  `rgba(${clamp255(c.r)},${clamp255(c.g)},${clamp255(c.b)},${a.toFixed(3)})`;
const scale = (c: Rgb, f: number): Rgb => ({ r: c.r * f, g: c.g * f, b: c.b * f });

/** A small deterministic source, so a player's hair lies the same way twice. */
function rng(seed: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0;
  }
  return () => {
    h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0;
    return h / 4294967296;
  };
}

/** How bright a strand is, given which way it lies. The key is upper-left, so
 *  a strand whose normal leans that way catches it. */
function strandLight(angle: number): number {
  return 0.45 + 0.55 * Math.max(0, Math.cos(angle - Math.PI * 1.20));
}

export function paintHairV2(
  ctx: CanvasRenderingContext2D, size: number, d: AvatarRenderDescriptor,
  s: Surface, phase: 'back' | 'front',
): void {
  const l = s.layout;
  const px = (v: number): number => v * size;
  const h = l.chinY - l.crownY;
  const base = hexRgb(d.colour.hair);
  const grey = d.hair.greying;
  const colour = grey > 0 ? {
    r: base.r + (150 - base.r) * grey,
    g: base.g + (148 - base.g) * grey,
    b: base.b + (145 - base.b) * grey,
  } : base;
  const r = rng(d.key + phase);

  if (phase === 'back') {
    if (d.hair.fall <= 0 || d.hair.roped) return;
    const w = l.halfW * (1 + d.hair.volume * 0.10);
    ctx.fillStyle = css(scale(colour, 0.55), 1);
    ctx.beginPath();
    ctx.ellipse(px(l.cx), px(l.earY + h * 0.22 * d.hair.fall),
      px(w * 1.02), px(h * (0.42 + d.hair.fall * 0.34)), 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  /* ------------------------------------------------------ facial hair ---- */
  if (d.facialHair.styleId !== 'clean') {
    const grid = s.size;
    const count = d.facialHair.length === 0 ? 7000 : 5200;
    const len = d.facialHair.length / 900;
    for (let i = 0; i < count; i += 1) {
      const x = l.cx + (r() - 0.5) * l.halfW * 2.2;
      const y = l.zygY + r() * (l.chinY + h * 0.14 - l.zygY);
      const gi = Math.min(grid - 1, (y * grid) | 0) * grid + Math.min(grid - 1, (x * grid) | 0);
      if ((s.mask[gi] as number) <= 0 && y < l.chinY) continue;
      const cover = beardCover(d, l, x, y);
      if (cover <= 0.03 || r() > cover) continue;
      // Hollows hold more hair than ridges: the occlusion term already knows
      // where the hollows are, so it is reused rather than re-derived.
      const ao = s.ao[gi] as number;
      const lit = strandLight(Math.PI * 0.5) * (0.55 + (1 - Math.min(1, ao)) * 0.2);
      const tone = r() < 0.26 ? scale(colour, 1.35) : colour;
      ctx.strokeStyle = css(scale(tone, lit), 0.30 + cover * 0.55);
      ctx.lineWidth = Math.max(0.8, size / 260);
      ctx.beginPath();
      ctx.moveTo(px(x), px(y));
      const drift = (x - l.cx) * 0.10;
      ctx.lineTo(px(x + drift * len * 30), px(y + len * (0.6 + r() * 0.8)));
      ctx.stroke();
    }
  }

  /* ------------------------------------------------------------- hair ---- */
  if (d.hair.length === 'none') {
    // A shaved head still has stubble and still catches light on the crown.
    for (let i = 0; i < 2600; i += 1) {
      const x = l.cx + (r() - 0.5) * l.halfW * 2;
      const y = l.crownY + r() * (l.browY - l.crownY) * 1.06;
      const grid = s.size;
      const gi = Math.min(grid - 1, (y * grid) | 0) * grid + Math.min(grid - 1, (x * grid) | 0);
      if ((s.mask[gi] as number) <= 0) continue;
      ctx.fillStyle = css(scale(colour, 0.7), 0.16);
      ctx.fillRect(px(x), px(y), size / 300, size / 300);
    }
    return;
  }

  const vol = d.hair.volume;
  const top = l.crownY - h * vol * 0.16;
  const hairline = l.crownY + h * (0.16 + d.hair.recession * 0.16);
  const wide = l.halfW * (1 + vol * 0.16);

  if (d.hair.roped) {
    for (let lane = 0; lane < 13; lane += 1) {
      const u = (lane + 0.5) / 13;
      const x0 = l.cx + (u - 0.5) * l.halfW * 1.9;
      const crown = Math.cos((u - 0.5) * Math.PI);
      ctx.strokeStyle = css(scale(colour, 0.55), 1);
      ctx.lineWidth = size * 0.022;
      ctx.beginPath();
      ctx.moveTo(px(x0), px(hairline - crown * h * 0.10));
      ctx.lineTo(px(x0 + (x0 - l.cx) * 0.10), px(hairline + h * (0.26 + d.hair.fall * 0.30)));
      ctx.stroke();
      for (let bead = 0; bead <= 15; bead += 1) {
        const t = bead / 15;
        const bx = x0 + (x0 - l.cx) * 0.10 * t;
        const by = hairline - crown * h * 0.10 + t * h * (0.26 + d.hair.fall * 0.30);
        ctx.fillStyle = css(scale(colour, bead % 2 === 0 ? 1.25 : 0.85), 0.9);
        ctx.beginPath();
        ctx.ellipse(px(bx), px(by), size * 0.009, size * 0.006, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return;
  }

  // The mass: many strands from the crown outward, each lit by its direction.
  const wob = { straight: 0.004, wavy: 0.014, curly: 0.024, coily: 0.010 }[d.hair.family];
  const period = { straight: 1, wavy: 2.4, curly: 4.0, coily: 6.0 }[d.hair.family];
  const strands = d.hair.family === 'coily' ? 2400 : 1700;
  ctx.lineWidth = Math.max(1, size / 190);

  for (let i = 0; i < strands; i += 1) {
    const a = Math.PI * (0.02 + r() * 1.10);
    const reach = (wide + h * vol * 0.10) * (0.72 + r() * 0.5);
    const drop = d.hair.fall * h * 0.5 * (0.4 + r() * 0.8);
    const lit = strandLight(a);
    const tone = r() < 0.22 ? scale(colour, 1.4) : r() < 0.5 ? scale(colour, 1.05) : scale(colour, 0.72);
    ctx.strokeStyle = css(scale(tone, lit), 0.5 + r() * 0.35);
    ctx.beginPath();
    let first = true;
    for (let step = 0; step <= 6; step += 1) {
      const t = step / 6;
      const ph = t * Math.PI * period + i;
      const x = l.cx - Math.cos(a) * reach * t + Math.sin(ph) * wob * t;
      const y = top + Math.sin(a) * reach * t * 0.92 + drop * t * t + Math.cos(ph) * wob * t * 0.5;
      if (first) { ctx.moveTo(px(x), px(y)); first = false; } else ctx.lineTo(px(x), px(y));
    }
    ctx.stroke();
  }

  // Coils read as coils, not as wiggles.
  if (d.hair.family === 'coily') {
    for (let i = 0; i < 700; i += 1) {
      const x = l.cx + (r() - 0.5) * wide * 2.1;
      const y = top + r() * (hairline + h * 0.10 - top);
      const rad = size * (0.008 + r() * 0.009);
      ctx.strokeStyle = css(scale(colour, r() < 0.3 ? 1.35 : 0.8), 0.5);
      ctx.lineWidth = Math.max(1, size / 170);
      ctx.beginPath();
      ctx.arc(px(x), px(y), rad, 0, Math.PI * 1.7);
      ctx.stroke();
    }
  }
}

/** How much beard grows at a point: zones, softly. */
function beardCover(
  d: AvatarRenderDescriptor, l: Surface['layout'], x: number, y: number,
): number {
  const h = l.chinY - l.crownY;
  const id = d.facialHair.styleId;
  const dx = x - l.cx;
  const zone = (zx: number, zy: number, rx: number, ry: number, w: number): number => {
    const t = 1 - Math.hypot((dx - zx) / rx, (y - zy) / ry);
    return t > 0 ? t * t * w : 0;
  };
  const chin = zone(0, l.chinY - h * 0.07, l.chinW * 2.0, h * 0.10, 1);
  const mo = zone(0, l.mouthY - h * 0.045, l.halfW * 0.56, h * 0.042, 1);
  const jawL = zone(-l.jawW * 0.82, l.jawY + h * 0.03, l.halfW * 0.72, h * 0.13, 1);
  const jawR = zone(l.jawW * 0.82, l.jawY + h * 0.03, l.halfW * 0.72, h * 0.13, 1);
  const chL = zone(-l.zygW * 0.78, l.zygY + h * 0.13, l.halfW * 0.62, h * 0.12, 0.85);
  const chR = zone(l.zygW * 0.78, l.zygY + h * 0.13, l.halfW * 0.62, h * 0.12, 0.85);
  const soul = zone(0, l.mouthY + h * 0.062, h * 0.030, h * 0.026, 1);

  let v: number;
  if (id.startsWith('mustache')) v = mo;
  else if (id === 'soul-patch') v = soul;
  else if (id === 'chin-beard') v = chin;
  else if (id === 'goatee') v = Math.max(chin, soul);
  else if (id === 'goatee-circle' || id === 'van-dyke' || id === 'balbo' || id === 'anchor') {
    v = Math.max(chin, mo, soul);
  } else if (id === 'horseshoe') v = Math.max(mo, chin * 0.7);
  else if (id === 'chin-strap') v = Math.max(jawL, jawR, chin * 0.7);
  else if (id.startsWith('sideburns')) v = Math.max(chL, chR) * 0.7;
  else v = Math.max(chin, mo, jawL, jawR, chL, chR);

  if (id === 'beard-patchy') v *= 0.55 + Math.sin(x * 211 + y * 173) * 0.3;
  return Math.min(1, v * d.facialHair.density * 1.35);
}
