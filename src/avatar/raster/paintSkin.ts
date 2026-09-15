// Skin, lit once and lit the same way for everybody.
//
// One key light, high and to the viewer's left, with a weak fill on the
// opposite side and a cool rim from behind. Every player gets that exact
// setup, which is the whole point of a portrait series: two men differ because
// their faces differ, not because one was photographed in different light.
//
// The passes below are the planes of a head, in the order a painter lays them
// down: the broad form first, then the sockets and the cheekbones, then the
// small local ones. Nothing here knows a trait name; it reads the morph, so a
// high cheekbone actually catches the light higher up.

import type { FaceMorph } from '../../../supabase/functions/_shared/avatar/morph';
import type { Frame, Pt } from './anatomy';
import { type Ctx, type Rgb, mix, rgba, shade, softBlob, softLine, toRgb } from './canvas';

/** Everything the face is painted in, derived from the one stored skin colour
 *  so that a step between two named bands still gets shading that belongs to
 *  it. */
export interface Skin {
  readonly base: Rgb;
  readonly hi: Rgb;
  readonly spec: Rgb;
  readonly sh: Rgb;
  readonly deep: Rgb;
  /** Subsurface red: the nose, the ears and the lids let light through. */
  readonly warm: Rgb;
  readonly lip: Rgb;
  readonly rim: Rgb;
}

export function skinPalette(hex: string): Skin {
  const base = toRgb(hex);
  // Deep skin shows less lightness contrast and more specular; light skin the
  // reverse. One constant for both would make one of them look like plastic.
  const depth = 1 - (base.r + base.g + base.b) / 765;
  return {
    base,
    hi: shade(base, 0.13 - depth * 0.05),
    spec: shade(base, 0.30 + depth * 0.10),
    sh: shade(base, -(0.15 + depth * 0.06)),
    deep: shade(base, -(0.30 + depth * 0.10)),
    warm: mix(base, { r: 168, g: 74, b: 58 }, 0.22 - depth * 0.08),
    // Lips carry more colour than the first pass gave them. Too little and
    // the mouth vanishes at list size; too much and it reads as makeup, so it
    // scales down with pigmentation the way the real contrast does.
    lip: mix(shade(base, -0.16), { r: 158, g: 82, b: 76 }, 0.48 - depth * 0.18),
    rim: mix(base, { r: 150, g: 172, b: 198 }, 0.45),
  };
}

/**
 * The broad form: which way the head turns away from the light.
 *
 * Done as one big off-centre gradient rather than per-plane shading, because
 * the first thing that makes a drawn head look solid is a single consistent
 * light-to-shadow sweep across it. Everything after this is detail on top.
 */
export function paintBaseForm(ctx: Ctx, f: Frame, s: Skin): void {
  const w = f.halfSkull;
  const g = ctx.createLinearGradient(f.cx - w * 1.2, f.crownY, f.cx + w * 1.4, f.gnathionY);
  // The lit end stops at `hi`, not at the specular. Starting on the specular
  // washed the whole key side toward grey and took the skin's colour with it.
  g.addColorStop(0, rgba(s.hi, 1));
  g.addColorStop(0.34, rgba(s.base, 1));
  g.addColorStop(0.72, rgba(s.sh, 1));
  g.addColorStop(1, rgba(s.deep, 1));
  ctx.fillStyle = g;
  ctx.fillRect(f.cx - w * 2, f.crownY - 200, w * 4, f.gnathionY + 600);

  // Occlusion round the whole silhouette. One pass, and the single biggest
  // reason a painted head reads as a sphere rather than as a sticker: the
  // edges of anything round turn away from every light at once.
  const halo = ctx.createRadialGradient(
    f.cx - w * 0.12, f.eyeY + 60, w * 0.36, f.cx, f.eyeY + 40, w * 1.28);
  halo.addColorStop(0, rgba(s.deep, 0));
  halo.addColorStop(0.62, rgba(s.deep, 0.10));
  halo.addColorStop(1, rgba(s.deep, 0.72));
  ctx.fillStyle = halo;
  ctx.fillRect(f.cx - w * 2, f.crownY - 200, w * 4, f.gnathionY + 600);

  // The core shadow: the dark band just inside the shadow edge, with light
  // bouncing back in behind it. Without it a face has a light side and a dark
  // side but no turn between them.
  softBlob(ctx, f.cx + w * 0.80, f.eyeY + 120, w * 0.30, (f.gnathionY - f.browY) * 0.75,
    s.deep, 0.26);
  softBlob(ctx, f.cx + w * 0.97, f.eyeY + 150, w * 0.12, (f.gnathionY - f.browY) * 0.55,
    s.warm, 0.20);

  // Light falls off toward the crown and under the jaw: the top of a skull
  // turns away from a high key almost as hard as the underside of a chin.
  softBlob(ctx, f.cx, f.crownY - 30, w * 1.3, 220, s.deep, 0.30, 0, 0.1);
  softBlob(ctx, f.cx, f.gnathionY + 30, w * 1.1, 180, s.deep, 0.34, 0, 0.1);
  // Rim from behind, on the shadow side only.
  softBlob(ctx, f.cx + w * 0.95, f.zygionY + 60, 90, 300, s.rim, 0.16);
}

/**
 * The bone: brow ridge, eye sockets, temples, cheekbones, jaw.
 *
 * Every number here is hung off a morph dimension rather than a constant, so a
 * heavy brow really does cast a deeper socket and a high cheekbone really does
 * catch the light above a deeper hollow. This is the pass that decides whether
 * two faces with the same features look like two people.
 */
export function paintStructure(ctx: Ctx, f: Frame, m: FaceMorph, s: Skin): void {
  const w = f.halfSkull;
  const eyeGap = 118 + m.eyeSpacing * 30;

  // Temples: hollow on a narrow skull, nearly flat on a broad one.
  for (const side of [-1, 1]) {
    softBlob(ctx, f.cx + side * f.halfTemple * 0.88, f.browY - 54,
      w * 0.24, 110, s.sh, 0.20 - m.templeWidth * 0.07);
  }

  // Forehead: the single largest lit plane on a head.
  softBlob(ctx, f.cx - w * 0.22, f.trichionY + (f.browY - f.trichionY) * 0.45,
    w * 0.60, (f.browY - f.trichionY) * 0.52, s.hi, 0.34);

  // Brow ridge, and the shadow it throws into the sockets.
  for (const side of [-1, 1]) {
    const bx = f.cx + side * eyeGap;
    softBlob(ctx, bx, f.browY - 16, 96, 26, s.hi, 0.20 + m.browRidge * 0.12);
    softBlob(ctx, bx, f.eyeY - 10, 104, 62,
      s.deep, 0.26 + m.browRidge * 0.16 + m.eyeDepth * 0.14);
    // The inner socket by the nose root is always the darkest part of it.
    softBlob(ctx, f.cx + side * (eyeGap - 52), f.eyeY - 16, 46, 48, s.deep, 0.22);
  }

  // Cheekbones: a lit ridge with a hollow under it. The hollow is where age
  // and build show up most, so it is driven by cheekFullness rather than set.
  for (const side of [-1, 1]) {
    const zx = f.cx + side * f.halfZygion * 0.70;
    softBlob(ctx, zx, f.zygionY + 14, w * 0.32, 66, s.spec, 0.30 + m.cheekboneWidth * 0.14);
    softBlob(ctx, zx + side * 22, f.zygionY + 120,
      w * 0.28, 100, s.deep, 0.30 - m.cheekFullness * 0.18);
    // Fuller cheeks catch their own small highlight lower down.
    if (m.cheekFullness > 0) {
      softBlob(ctx, f.cx + side * f.halfZygion * 0.52, f.zygionY + 150,
        w * 0.24, 80, s.hi, m.cheekFullness * 0.16);
    }
  }

  // The jaw's underside, and the shadow it throws on the neck.
  softBlob(ctx, f.cx, f.gnathionY - 36, f.halfGonion * 0.95, 96, s.deep, 0.30 + m.jawAngle * 0.10);
  // The ramus: the lit edge of the jaw running up toward the ear, which is
  // what makes a heavy jaw read as bone rather than as width.
  for (const side of [-1, 1]) {
    softBlob(ctx, f.cx + side * f.halfGonion * 0.94, f.gonionY - 40,
      w * 0.12, 120, s.hi, 0.18 + m.gonialFlare * 0.12);
  }
  // Chin: a lit front plane over a dark crease.
  softBlob(ctx, f.cx, f.gnathionY - 86 - m.chinLength * 18,
    f.halfChin * 0.92, 54, s.hi, 0.24 + m.chinProjection * 0.14);
  if (m.chinCleft > 0.25) {
    softLine(ctx, [
      [f.cx, f.gnathionY - 120],
      [f.cx, f.gnathionY - 62],
    ], s.deep, m.chinCleft * 0.34, 7);
  }

  // Nasolabial folds. Present on everybody, deep only on some -- a face
  // without them at all reads as a doll.
  for (const side of [-1, 1]) {
    const fold: readonly Pt[] = [
      [f.cx + side * (60 + m.alarFlare * 12), f.subnasaleY - 16],
      [f.cx + side * (104 + m.cheekFullness * 12), f.stomionY - 34],
      [f.cx + side * (112 + m.mouthWidth * 16), f.stomionY + 26],
    ];
    softLine(ctx, fold, s.sh, 0.16 + Math.max(0, m.cheekFullness) * 0.10
      + Math.max(0, -m.cheekFullness) * 0.14, 5);
  }
}

/** The small marks that are stored on identity and were never drawn: freckles,
 *  moles, scars, weathering. Sparse on purpose -- a league where everybody has
 *  something is a league where nothing reads as a marking. */
export function paintComplexion(
  ctx: Ctx, f: Frame, m: FaceMorph, s: Skin, kind: string, wear: number,
): void {
  const spot = (x: number, y: number, r: number, a: number): void => {
    softBlob(ctx, x, y, r, r * 0.92, s.deep, a, 0, 0.25);
  };
  if (kind.startsWith('freckles')) {
    const many = kind.includes('heavy');
    let h = 0x2545f491;
    for (let k = 0; k < (many ? 90 : 46); k += 1) {
      h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0;
      const u = (h & 0xffff) / 0xffff;
      const v = ((h >>> 16) & 0xffff) / 0xffff;
      const side = k % 2 === 0 ? -1 : 1;
      const x = f.cx + side * (36 + u * f.halfZygion * 0.82);
      const y = f.eyeY + 42 + v * (f.subnasaleY - f.eyeY) * 0.95;
      spot(x, y, 5 + u * 3, 0.30);
    }
  }
  if (kind === 'mole-cheek') spot(f.cx - f.halfZygion * 0.52, f.zygionY + 96, 9, 0.62);
  if (kind === 'mole-lip') spot(f.cx + 88, f.stomionY - 34, 8, 0.58);
  if (kind === 'mole-brow') spot(f.cx + 132, f.browY - 34, 8, 0.52);
  if (kind === 'scar-brow') {
    softLine(ctx, [[f.cx - 168, f.browY - 44], [f.cx - 140, f.browY - 6]], s.hi, 0.40, 3);
  }
  if (kind === 'scar-cheek') {
    softLine(ctx, [[f.cx + 150, f.zygionY + 40], [f.cx + 128, f.zygionY + 110]], s.hi, 0.34, 3);
  }
  if (kind === 'dimples') {
    for (const side of [-1, 1]) {
      softLine(ctx, [
        [f.cx + side * (126 + m.mouthWidth * 18), f.stomionY - 20],
        [f.cx + side * (120 + m.mouthWidth * 18), f.stomionY + 34],
      ], s.sh, 0.26, 5);
    }
  }
  // The years: under-eye shadow and a slackening along the jaw.
  if (wear > 0.3) {
    for (const side of [-1, 1]) {
      softBlob(ctx, f.cx + side * (118 + m.eyeSpacing * 30), f.eyeY + 54,
        86, 30, s.sh, (wear - 0.3) * 0.34);
    }
  }
  if (wear > 0.5) {
    for (const side of [-1, 1]) {
      softLine(ctx, [
        [f.cx + side * f.halfGonion * 0.86, f.gonionY + 40],
        [f.cx + side * f.halfChin * 1.3, f.gnathionY - 70],
      ], s.sh, (wear - 0.5) * 0.30, 6);
    }
  }
}
