// The frame every feature is drawn into.
//
// One face, resolved once: where the crown is, where the chin is, how wide the
// silhouette is at any height, and where the brow, eye, nose and mouth lines
// sit. Every feature family reads this and nothing else, which is what keeps
// twenty-two skulls and sixteen noses from needing 352 special cases -- a nose
// asks the layout how wide the face is at the nose line and sizes itself.
//
// It is also what holds the art direction together. The brief asks for
// consistent portrait framing across the whole population, so the eye line is
// pinned to a fixed height in the viewBox and the face grows around it. A
// long face gets a lower chin, not a portrait that slides up the frame.

import { clamp, lerp, nudge, pt, type Pt } from './geom';
import { PROFILE_T, type HeadShape } from './heads/shapes';
import type { FaceMorph } from '../../../supabase/functions/_shared/avatar/morph';

export const VIEW_W = 300;
export const VIEW_H = 400;
export const CX = 150;
/** The eye line is the anchor. Faces vary in length around it.
 *
 *  These three numbers are the crop, and the crop is art direction: the chin
 *  sits at four fifths of the frame, the crown a seventh down from the top,
 *  and what is left at the bottom is shoulder. Getting it wrong the first time
 *  put the collar off the bottom edge and left every player on a bare neck. */
export const EYE_Y = 165;
const REF_FACE_H = 292;
/**
 * Widths, globally.
 *
 * The single biggest structural difference between the first illustrated pass
 * and the reference: a head about four fifths as wide as it is tall reads as a
 * round cartoon head, and the reference sits nearer three fifths. Everything
 * else -- the shading, the line work, the hair -- looked wrong mostly because
 * it was sitting on a head of the wrong shape.
 */
const WIDTH_SCALE = 0.905;

const DEFAULTS = { browT: 0.40, eyeT: 0.455, noseT: 0.655, mouthT: 0.775 };

export interface FaceLayout {
  readonly cx: number;
  readonly crownY: number;
  readonly chinY: number;
  readonly faceH: number;
  readonly browY: number;
  readonly eyeY: number;
  readonly noseTopY: number;
  readonly noseBaseY: number;
  readonly mouthY: number;
  /** Half-width of the silhouette at a given y. Clamped at the ends so a
   *  feature that asks above the crown or below the chin gets a number rather
   *  than a hole. */
  readonly halfAt: (y: number) => number;
  /** The right-hand landmarks, crown to chin. */
  readonly right: readonly Pt[];
  readonly left: readonly Pt[];
  readonly jaw: HeadShape['jaw'];
  /** Distance between pupil centres. */
  readonly eyeSpan: number;
  readonly eyeSize: number;
  readonly noseWidth: number;
  readonly mouthWidth: number;
  readonly earY: number;
  readonly earHeight: number;
  /** Small per-side multipliers. Real faces are not symmetric and a portrait
   *  that is reads as a diagram. */
  readonly asym: { readonly left: number; readonly right: number };
}

/** Which morph dimension moves which landmark. Ten entries for ten heights,
 *  so a wide jaw widens the jaw and nothing else. */
function profileScale(m: FaceMorph): readonly number[] {
  const mid = (a: number, b: number): number => (a + b) / 2;
  return [
    nudge(m.crownRound, 0.10),
    nudge(m.skullWidth, 0.07),
    nudge(m.foreheadWidth, 0.09),
    nudge(m.templeWidth, 0.09),
    nudge(mid(m.templeWidth, m.cheekboneWidth), 0.08),
    nudge(m.cheekboneWidth, 0.10),
    nudge(m.cheekFullness, 0.11),
    nudge(m.jawWidth, 0.12),
    nudge(mid(m.jawWidth, m.gonialFlare), 0.13),
    nudge(m.chinWidth, 0.16),
  ];
}

/**
 * Build the face.
 *
 * `widthTrim` exists for the body: shoulders need to know the neck's width
 * before the head is drawn, and passing the whole layout around is cheaper
 * than computing the silhouette twice.
 */
export function buildFace(shape: HeadShape, m: FaceMorph): FaceLayout {
  const eyeT = shape.eyeT ?? DEFAULTS.eyeT;
  const browT = shape.browT ?? DEFAULTS.browT;
  const noseT = shape.noseT ?? DEFAULTS.noseT;
  const mouthT = shape.mouthT ?? DEFAULTS.mouthT;

  const faceH = REF_FACE_H * shape.length * nudge(m.skullLength, 0.055);
  const crownY = EYE_Y - faceH * eyeT;
  const chinY = crownY + faceH;

  const scale = profileScale(m);
  const globalW = nudge(m.skullWidth, 0.05);
  // Asymmetry is tiny and deliberate: enough that the two halves are not a
  // mirror, small enough that nobody reads it as a deformity.
  const asymAmt = clamp(m.asymJaw, -1, 1) * 0.018;
  const asym = { left: 1 - asymAmt, right: 1 + asymAmt };

  const chinDrop = clamp(m.chinLength, -1, 1) * faceH * 0.022;

  const half = shape.w.map((w, i) => w * (scale[i] ?? 1) * globalW * WIDTH_SCALE);
  const ys = PROFILE_T.map((t, i) => crownY + faceH * t + (i >= 8 ? chinDrop * (i - 7) / 2 : 0));

  const side = (mult: number): Pt[] => {
    const pts = half.map((w, i) => pt(CX + w * mult, ys[i] as number));
    // A square or angular jaw is a different construction, not a different
    // number: it gets an extra landmark below the jaw so the corner turns
    // rather than curving away.
    if (shape.jaw === 'square' || shape.jaw === 'angular') {
      const k = shape.jaw === 'square' ? 1.1 : 1.04;
      const y = lerp(ys[7] as number, ys[8] as number, shape.jaw === 'square' ? 0.55 : 0.4);
      pts.splice(8, 0, pt(CX + (half[8] as number) * k * mult, y));
    }
    return pts;
  };

  const right = side(1);
  const left = side(-1);
  const scaled = (pts: Pt[], f: number): Pt[] =>
    pts.map((p) => pt(CX + (p.x - CX) * f, p.y));

  const rightPts = scaled(right, asym.right);
  const leftPts = scaled(left, asym.left);

  const halfAt = (y: number): number => {
    const first = rightPts[0] as Pt;
    const last = rightPts[rightPts.length - 1] as Pt;
    if (y <= first.y) return first.x - CX;
    if (y >= last.y) return last.x - CX;
    for (let i = 1; i < rightPts.length; i += 1) {
      const a = rightPts[i - 1] as Pt;
      const b = rightPts[i] as Pt;
      if (y <= b.y) {
        const t = (y - a.y) / Math.max(1e-6, b.y - a.y);
        return lerp(a.x - CX, b.x - CX, t);
      }
    }
    return last.x - CX;
  };

  const eyeY = EYE_Y + clamp(m.eyeLine, -1, 1) * faceH * 0.018;
  const widthAtEye = halfAt(eyeY) * 2;

  return {
    cx: CX,
    crownY,
    chinY: chinY + chinDrop,
    faceH,
    browY: crownY + faceH * browT + clamp(m.browHeight, -1, 1) * faceH * 0.018,
    eyeY,
    noseTopY: crownY + faceH * (browT + 0.03),
    noseBaseY: crownY + faceH * noseT + clamp(m.noseLength, -1, 1) * faceH * 0.028,
    mouthY: crownY + faceH * mouthT + clamp(m.philtrumLength, -1, 1) * faceH * 0.014,
    halfAt,
    right: rightPts,
    left: leftPts,
    jaw: shape.jaw,
    eyeSpan: widthAtEye * (0.365 + clamp(m.eyeSpacing, -1, 1) * 0.030),
    eyeSize: widthAtEye * (0.162 + clamp(m.eyeWidth, -1, 1) * 0.018),
    noseWidth: widthAtEye * (0.232 + clamp(m.nostrilWidth, -1, 1) * 0.038),
    mouthWidth: widthAtEye * (0.330 + clamp(m.mouthWidth, -1, 1) * 0.046),
    earY: eyeY + faceH * 0.045,
    earHeight: faceH * (0.125 + clamp(m.earLength, -1, 1) * 0.018),
    asym,
  };
}

/** The spline tension the silhouette is drawn at. Part of the shape, not a
 *  rendering preference: a square jaw needs a flatter curve between its
 *  landmarks or the corner it was given rounds straight back off. */
/* Tension applies to the whole closed path, so it cannot be the thing that
   squares a jaw -- the first version used 0.70 for a square jaw and produced a
   polygonal crown to match. The corner landmark inserted in `side()` does that
   work now, and these stay close to a natural spline. */
export const jawTension = (jaw: HeadShape['jaw']): number =>
  jaw === 'square' ? 0.90 : jaw === 'angular' ? 0.95 : jaw === 'tapered' ? 1.02 : 1.06;
