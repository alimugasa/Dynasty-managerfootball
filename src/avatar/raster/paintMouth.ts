// Lips and ears.
//
// The old mouth was one quadratic curve over another, which gives a shape but
// not a mouth: no cupid's bow, no vermillion edge, no wet lower lip, no
// corners. The old ear was an ellipse. Both are here because both are load-
// bearing for likeness -- ears in particular are one of the most individual
// things on a head and were doing no work at all.

import type { FaceMorph } from '../../../supabase/functions/_shared/avatar/morph';
import type { Frame, Pt, Side } from './anatomy';
import { type Ctx, fillCurve, mix, rgba, shade, softBlob, softLine, strokeCurve } from './canvas';
import type { Skin } from './paintSkin';

/**
 * The mouth.
 *
 * Built from the landmarks a portrait painter uses: the two peaks of the
 * cupid's bow and the dip between them, the corners, the stomion, and the two
 * lobes of the lower lip. `cupidBow` moves the peaks from nearly flat to
 * sharply defined, which is a bigger visual difference between two people than
 * lip fullness is.
 */
export function paintMouth(ctx: Ctx, f: Frame, m: FaceMorph, s: Skin, smile: number): void {
  const cx = f.cx + m.asymMouth * 5;
  const y = f.stomionY;
  // Mouth corners fall under the inner edge of the irises, which on this head
  // is about a third of the half-width. Ninety-five was a doll's mouth.
  const hw = 124 + m.mouthWidth * 30;
  const up = 19 + m.upperLip * 13;
  const low = 26 + m.lowerLip * 16;
  const bow = 4 + (m.cupidBow + 1) * 5;
  const corner = y - smile * 9 + m.mouthCorner * 6;

  const peakX = hw * 0.30;
  // Upper lip: corner, up over the bow peak, dip at centre, mirror, corner.
  const upperEdge: readonly Pt[] = [
    [cx - hw, corner + m.asymMouth * 2],
    [cx - hw * 0.62, y - up * 0.52],
    [cx - peakX, y - up],
    [cx, y - up + bow],
    [cx + peakX, y - up],
    [cx + hw * 0.62, y - up * 0.52],
    [cx + hw, corner - m.asymMouth * 2],
  ];
  const lipLine: readonly Pt[] = [
    [cx - hw, corner + m.asymMouth * 2],
    [cx - hw * 0.45, y + 2],
    [cx, y],
    [cx + hw * 0.45, y + 2],
    [cx + hw, corner - m.asymMouth * 2],
  ];
  const lowerEdge: readonly Pt[] = [
    [cx + hw, corner - m.asymMouth * 2],
    [cx + hw * 0.56, y + low * 0.72],
    [cx + hw * 0.18, y + low],
    [cx - hw * 0.18, y + low],
    [cx - hw * 0.56, y + low * 0.72],
    [cx - hw, corner + m.asymMouth * 2],
  ];

  // Lips are skin, not lipstick: the colour is the face's own, shifted.
  const lipDark = shade(s.lip, -0.26);
  fillCurve(ctx, [...upperEdge, ...[...lipLine].reverse().slice(1, -1)], rgba(lipDark, 0.92));
  fillCurve(ctx, [...lipLine, ...[...lowerEdge].reverse().slice(1, -1)], rgba(s.lip, 0.94));

  // The upper lip faces down and is always the darker of the two.
  softBlob(ctx, cx, y - up * 0.45, hw * 0.85, up * 0.7, s.deep, 0.34);
  // The lower lip faces up and catches the key, off-centre to the light.
  softBlob(ctx, cx - hw * 0.22, y + low * 0.44, hw * 0.44, low * 0.42,
    mix(s.lip, { r: 255, g: 244, b: 236 }, 0.55), 0.36 + m.lowerLip * 0.10);

  // The line between them: the darkest mark on the lower face, and the one
  // that decides whether a mouth reads at thumbnail size at all.
  softLine(ctx, lipLine, shade(s.lip, -0.70), 0.85, 4.2);
  strokeCurve(ctx, lipLine, rgba(shade(s.lip, -0.80), 0.55), 2.2);
  // Corners tuck in.
  for (const side of [-1, 1] as Side[]) {
    softBlob(ctx, cx + side * hw * 0.96, corner, 13, 9, s.deep, 0.45, 0, 0.2);
  }

  // Vermillion border: a thin lit ridge above the upper lip. Small, and one of
  // the things that most reads as "drawn by somebody who has looked at a face".
  strokeCurve(ctx, upperEdge, rgba(s.hi, 0.26), 2.4);
  // Mentolabial sulcus: the shadow under the lower lip, before the chin.
  softBlob(ctx, cx, y + low + 20, hw * 0.66, 18, s.sh, 0.26);

  // Philtrum: two ridges running down from the nose to the bow's peaks.
  const top = f.subnasaleY + 6;
  for (const side of [-1, 1] as Side[]) {
    softLine(ctx, [
      [cx + side * 15, top],
      [cx + side * peakX, y - up - 2],
    ], side < 0 ? s.hi : s.sh, 0.20, 4);
  }
  softBlob(ctx, cx, (top + y - up) / 2, 14, (y - up - top) / 2, s.sh, 0.14);
}

/**
 * An ear, in layers.
 *
 * Helix, antihelix, concha, tragus, lobe. Five parts rather than one ellipse,
 * because the concha is a dark bowl and the helix is a lit rim, and an ear
 * without that contrast is a blob stuck to the side of a head -- which is
 * exactly what the screenshots showed.
 */
export function paintEars(ctx: Ctx, f: Frame, m: FaceMorph, s: Skin): void {
  // Classic placement: the ear spans brow to nose base.
  const top = f.browY - 6;
  const bottom = f.subnasaleY + m.earLength * 26;
  const h = (bottom - top) * (0.92 + m.earSize * 0.10);
  const w = h * (0.40 + m.earSize * 0.04);
  const out = (m.earProtrusion + 1) * 9;

  for (const side of [-1, 1] as Side[]) {
    // Seated so the ear's inner half is behind the head. The first pass centred
    // it on the silhouette, so two thirds of it stood clear and every player
    // had handles.
    const ex = f.cx + side * (f.halfZygion * 0.88 + w * 0.34 + out);
    const ey = top + h * 0.5;

    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(side * 0.10);
    ctx.scale(side, 1);

    // The outer shell, warm because ears are thin and let light through.
    // Twelve points, not eight. A sparse loop through a Catmull-Rom spline
    // overshoots into corners, which is what gave the first pass pointed,
    // elvish ears.
    const shell: readonly Pt[] = [
      [-w * 0.06, -h * 0.48], [w * 0.22, -h * 0.42], [w * 0.40, -h * 0.24],
      [w * 0.46, -h * 0.02], [w * 0.42, h * 0.18], [w * 0.28, h * 0.36],
      [w * 0.10, h * 0.48], [-w * 0.10, h * 0.44], [-w * 0.24, h * 0.26],
      [-w * 0.30, h * 0.02], [-w * 0.28, -h * 0.22], [-w * 0.20, -h * 0.40],
    ];
    fillCurve(ctx, shell, rgba(mix(s.base, s.warm, 0.35), 1));
    // Helix: the lit rim running round the outside.
    softLine(ctx, [
      [-w * 0.26, -h * 0.30], [w * 0.10, -h * 0.46], [w * 0.40, -h * 0.16], [w * 0.34, h * 0.20],
    ], s.hi, 0.42, 6);
    // Concha: the bowl. The darkest thing on the side of a head.
    softBlob(ctx, -w * 0.02, h * 0.02, w * 0.28, h * 0.26, s.deep, 0.52);
    // Antihelix: the ridge that wraps the bowl.
    softLine(ctx, [
      [w * 0.02, -h * 0.30], [-w * 0.16, -h * 0.02], [-w * 0.04, h * 0.24],
    ], s.hi, 0.26, 5);
    // Tragus, and the lobe hanging below it.
    softBlob(ctx, -w * 0.22, h * 0.14, w * 0.12, h * 0.10, s.sh, 0.40);
    softBlob(ctx, -w * 0.02, h * 0.40 + m.earLobe * 8, w * 0.22,
      h * (0.12 + m.earLobe * 0.05), s.hi, 0.18);

    ctx.restore();

    // Where the ear meets the skull: an occlusion shadow, deeper when the ear
    // sticks out further.
    softBlob(ctx, f.cx + side * (f.halfZygion * 0.90), ey, 16, h * 0.42,
      s.deep, 0.22 + m.earProtrusion * 0.12);
  }
}
