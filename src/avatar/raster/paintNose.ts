// A nose, mostly implied.
//
// Two rewrites got here. The first drew outlines and read as a diagram; the
// second drew symmetrical converging bands plus alar creases and read as a
// bowtie -- a shape so obviously constructed that it was worse than the
// diagram. The lesson both times: in a front-lit portrait a nose is almost
// entirely *absent*. What you actually see is one soft shadow down the shaded
// side, a highlight on the tip, two dark nostrils, and a shadow underneath.
// Anything symmetrical you draw will be read as a symbol.
//
// So this is deliberately spare, and everything on it is one-sided except the
// nostrils.

import type { FaceMorph } from '../../../supabase/functions/_shared/avatar/morph';
import type { Frame } from './anatomy';
import { type Ctx, mix, softBlob, softLine } from './canvas';
import type { Skin } from './paintSkin';

export function paintNose(ctx: Ctx, f: Frame, m: FaceMorph, s: Skin): void {
  const cx = f.cx + m.asymNose * 5;
  const rootY = f.nasionY;
  const tipY = f.tipY - m.tipAngle * 8;
  const baseY = f.subnasaleY;

  const bridgeHalf = 34 + m.bridgeWidth * 12;
  const tipHalf = 54 + m.bridgeWidth * 12 + m.tipRound * 12;
  const alarHalf = 84 + m.nostrilWidth * 26 + m.alarFlare * 14;
  const relief = 0.55 + m.bridgeHeight * 0.30 + m.noseProjection * 0.18;

  // The shaded side of the dorsum. One band, on the right, because the key is
  // on the left for everybody. No matching band on the left -- that symmetry
  // is what read as a drawn shape rather than as a plane turning away.
  softLine(ctx, [
    [cx + bridgeHalf * 0.7, rootY + 16],
    [cx + bridgeHalf * 0.95, rootY + (tipY - rootY) * 0.55],
    [cx + tipHalf * 0.80, tipY - 20],
  ], s.sh, 0.30 * relief, 20 + m.bridgeWidth * 5);

  // The lit side is a highlight, not a line: a soft strip that fades out well
  // before the tip.
  softBlob(ctx, cx - bridgeHalf * 0.35, (rootY + tipY) / 2,
    bridgeHalf * 0.55, (tipY - rootY) * 0.42, s.hi, 0.26 * relief);

  // The root sits under the brow and is always slightly in shadow.
  softBlob(ctx, cx, rootY + 4, bridgeHalf * 2.0, 24, s.sh, 0.18 + m.browRidge * 0.10);

  // The lobule: round, lit off-centre, and the widest part of the nose's front.
  softBlob(ctx, cx - tipHalf * 0.16, tipY + 4, tipHalf * 0.80, 26 + m.tipRound * 8,
    s.hi, 0.30 * relief);

  // Nostrils. These are what actually tell you where a nose is, so they carry
  // the weight the outlines used to and nothing else has to.
  const dark = mix(s.deep, { r: 30, g: 20, b: 16 }, 0.5);
  for (const side of [-1, 1]) {
    softBlob(ctx, cx + side * alarHalf * 0.54, baseY - 12 + m.tipAngle * 5,
      15 + m.nostrilWidth * 7, 9 + m.nostrilWidth * 4 + m.tipAngle * 3,
      dark, 0.55, side * 0.30, 0.22);
  }
  // The wings get one mark between them, on the shadow side only. A matched
  // pair -- however soft -- still resolves into a symmetrical outline, which
  // is the third time that mistake has shown up in this file.
  softBlob(ctx, cx + (alarHalf - 14), baseY - 24,
    32 + m.alarFlare * 9, 24 + m.alarFlare * 6, s.sh, 0.18);

  // The shadow the whole nose throws down onto the lip.
  softBlob(ctx, cx + 10, baseY + 10, alarHalf * 1.05, 20 + m.noseProjection * 7,
    s.sh, 0.24 + m.noseProjection * 0.10);
}
