// One portrait, painted.
//
// The composition is fixed for everybody, which is what makes a set of these
// read as a team's headshot sheet rather than as a pile of drawings: the head
// is always the same height in the frame, the crown always at the same line,
// the light always from the same place, the ground always the same neutral.
// Build shows in the neck and shoulders, not in how big the face is.
//
// Output is a raster, cached as a data URL by seed and size. A list of
// fifty players is then fifty <img> elements sharing a cache rather than fifty
// live canvases or ten thousand SVG nodes, which is the difference between a
// roster that scrolls and one that stutters.

import type { AvatarProfile } from '../../../supabase/functions/_shared/avatar/profile';
import { faceMorph } from '../../../supabase/functions/_shared/avatar/morph';
import { HAIR_COLORS } from '../../../supabase/functions/_shared/avatar/hair';
import { skinColor } from '../../../supabase/functions/_shared/avatar/skin';
import { bodyShape, headOutline, landmarks } from './anatomy';
import { type Ctx, fillCurve, grain, rgba, shade, softBlob, toRgb, trace, within } from './canvas';
import { paintBaseForm, paintComplexion, paintStructure, skinPalette } from './paintSkin';
import { paintBrows, paintEyes } from './paintEyes';
import { paintNose } from './paintNose';
import { paintEars, paintMouth } from './paintMouth';
import { hairPlan, paintHairBack, paintHairFront } from './paintHair';
import { paintBeard } from './paintBeard';

export interface PaintOptions {
  /** The face-only test: no hair, no facial hair, no accessories, one shirt. */
  readonly bare?: boolean;
  readonly primary?: string;
  readonly secondary?: string;
}

/** The head is this fraction of the frame's height, for everybody. */
const HEAD_SHARE = 0.60;
const CROWN_AT = 0.085;

const hairHex = (id: string): string =>
  HAIR_COLORS.find((c) => c.id === id)?.hex ?? '#14100e';

/**
 * Paint one portrait into a context sized `size` x `size`.
 *
 * Exported so the lab can draw straight onto a canvas it owns, and so a future
 * renderer can be diffed against this one on the same surface.
 */
export function paintPortrait(
  ctx: Ctx, size: number, profile: AvatarProfile, opts: PaintOptions = {},
): void {
  const m = faceMorph(profile);
  const f = landmarks(m);
  const body = bodyShape(f, m);
  const i = profile.identity;
  const a = profile.appearance;
  const s = skinPalette(skinColor(i.skinStep, i.undertone));
  const bare = opts.bare === true;

  /* ---- the seamless: one neutral ground, lit from the same side ---- */
  ctx.fillStyle = '#141a20';
  ctx.fillRect(0, 0, size, size);
  const glow = ctx.createRadialGradient(size * 0.38, size * 0.30, 0, size * 0.5, size * 0.45, size * 0.75);
  glow.addColorStop(0, 'rgba(84,100,116,0.40)');
  glow.addColorStop(1, 'rgba(12,16,20,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  const scale = (size * HEAD_SHARE) / 1000;
  ctx.save();
  ctx.translate(size / 2 - 500 * scale, size * CROWN_AT);
  ctx.scale(scale, scale);

  const outline = headOutline(f, m);
  const plan = hairPlan(a.hairstyle, i.hairTexture);

  if (!bare) paintHairBack(ctx, f, plan, hairHex(a.hairColor));

  /* ---- neck, then the body over it ---- */
  const neckTop = body.neckTopY;
  fillCurve(ctx, [
    [f.cx - body.neckHalf, neckTop],
    [f.cx - body.neckHalf * 1.06, body.shoulderY],
    [f.cx + body.neckHalf * 1.06, body.shoulderY],
    [f.cx + body.neckHalf, neckTop],
  ], rgba(s.sh, 1));
  // The jaw's shadow on the neck. Deep, and the thing that stops a head
  // looking like it is resting on a post.
  softBlob(ctx, f.cx, neckTop + 40, body.neckHalf * 1.15, 90, s.deep, 0.68);
  // Sternocleidomastoids: two cords that show on every athlete.
  for (const side of [-1, 1]) {
    softBlob(ctx, f.cx + side * body.neckHalf * 0.42, neckTop + 150,
      22, 110, s.hi, 0.16 + m.neckWidth * 0.06);
  }

  const shirt = toRgb(bare ? '#2a3239' : opts.primary ?? '#2a3239');
  const shirtDark = shade(shirt, -0.42);
  // Trapezius climbing toward the ear on a heavy build, flat on a light one.
  fillCurve(ctx, [
    [f.cx - body.shoulderHalf, size / scale],
    [f.cx - body.shoulderHalf * 0.86, body.shoulderY - body.trapRise * 0.35],
    [f.cx - body.neckHalf * 1.25, body.shoulderY - body.trapRise],
    [f.cx, body.shoulderY - body.trapRise * 1.06],
    [f.cx + body.neckHalf * 1.25, body.shoulderY - body.trapRise],
    [f.cx + body.shoulderHalf * 0.86, body.shoulderY - body.trapRise * 0.35],
    [f.cx + body.shoulderHalf, size / scale],
  ], rgba(shirt, 1));
  softBlob(ctx, f.cx, body.shoulderY - body.trapRise, body.neckHalf * 2.2, 90, shirtDark, 0.8);
  softBlob(ctx, f.cx - body.shoulderHalf * 0.5, body.shoulderY + 40,
    body.shoulderHalf * 0.5, 160, shade(shirt, 0.16), 0.5);

  /* ---- the head ---- */
  if (!bare) paintEars(ctx, f, m, s);
  within(ctx, outline, () => {
    paintBaseForm(ctx, f, s);
    paintStructure(ctx, f, m, s);
    paintComplexion(ctx, f, m, s, bare ? 'none' : i.complexion, a.ageWear);
    paintNose(ctx, f, m, s);
    paintMouth(ctx, f, m, s, a.expression === 'confident' ? 1 : a.expression === 'relaxed' ? 0.5 : 0);
    paintEyes(ctx, f, m, s, i.eyeColor);
    grain(ctx, f.cx - 700, -200, 1400, 1700, 0.10);
  });
  if (bare) paintEars(ctx, f, m, s);
  // Brows sit on the brow ridge, not inside the skin clip: a thick brow
  // overhangs the socket. Always the natural colour -- a bleached head does
  // not come with bleached eyebrows.
  paintBrows(ctx, f, m, hairHex(i.naturalHairColor));

  if (!bare) {
    paintBeard(ctx, f, m, s, a.facialHair, a.facialHairDensity, hairHex(a.hairColor),
      profile.seed, outline);
    paintHairFront(ctx, f, m, plan, hairHex(a.hairColor), profile.seed, a.recession);
    paintAccessory(ctx, f, m, a.accessory);
  }

  ctx.restore();

  // A vignette, because a studio backdrop falls off at the corners and a flat
  // one reads as a screenshot rather than a portrait.
  const vig = ctx.createRadialGradient(size / 2, size * 0.45, size * 0.30, size / 2, size / 2, size * 0.78);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, size, size);
}

function paintAccessory(ctx: Ctx, f: ReturnType<typeof landmarks>, m: ReturnType<typeof faceMorph>, id: string): void {
  const gap = 150 + m.eyeSpacing * 28;
  if (id === 'eye-black') {
    for (const side of [-1, 1]) {
      // A path rather than roundRect, which older Safari does not have.
      softBlob(ctx, f.cx + side * gap, f.eyeY + 64, 48, 15,
        { r: 18, g: 14, b: 11 }, 0.9, 0, 0.55);
    }
  }
  if (id === 'headband') {
    ctx.save();
    ctx.beginPath();
    // Sitting on the brow ridge, where a headband is worn, rather than floating
    // above the hairline.
    trace(ctx, [
      [f.cx - f.halfSkull * 0.99, f.trichionY + 78],
      [f.cx, f.trichionY + 14],
      [f.cx + f.halfSkull * 0.99, f.trichionY + 78],
      [f.cx + f.halfSkull * 0.97, f.trichionY + 128],
      [f.cx, f.trichionY + 66],
      [f.cx - f.halfSkull * 0.97, f.trichionY + 128],
    ], true);
    ctx.fillStyle = '#dee4ea';
    ctx.fill();
    ctx.restore();
  }
  if (id === 'earrings') {
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(f.cx + side * f.halfZygion * 1.02, f.subnasaleY + 6, 9, 0, Math.PI * 2);
      ctx.fillStyle = '#d9c27a';
      ctx.fill();
    }
  }
  if (id === 'nose-stud') {
    ctx.beginPath();
    ctx.arc(f.cx - 66, f.subnasaleY - 20, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#d9c27a';
    ctx.fill();
  }
}
