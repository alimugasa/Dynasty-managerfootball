// Which drawing each player gets.
//
// Not a hash. The brief's third success criterion is "can I distinguish
// players without looking at hair or skin tone", and the only way that holds
// is if the drawn feature agrees with the numbers the identity system already
// stores: a player whose morph says wide jaw has to get the wide-jaw
// silhouette, not whichever one his trait id happens to hash to.
//
// So every family is chosen by nearest match on the morph dimensions that
// family actually expresses, with the stored trait id breaking ties. The trait
// id still matters -- two players with the same nose trait land on the same
// drawing when their morphs are equally close -- but it never overrides the
// anatomy.

import type { AvatarProfile } from '../../../supabase/functions/_shared/avatar/profile';
import type { FaceMorph } from '../../../supabase/functions/_shared/avatar/morph';
import { HEAD_SHAPES, type HeadShape } from './heads/shapes';
import { EYE_SPECS } from './eyes/constructions';
import { BROW_SPECS } from './brows/constructions';
import { NOSE_SPECS } from './noses/constructions';
import { MOUTH_SPECS } from './mouths/constructions';
import { EAR_SPECS } from './ears/constructions';

const hash = (text: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h / 4294967296;
};

/** Nearest in a small feature space, with a deterministic tiebreak. The
 *  tiebreak is tiny -- it separates candidates that are already close, and
 *  cannot promote a distant one. */
function nearest<T extends { id: string }>(
  items: readonly T[], vector: (item: T) => readonly number[],
  target: readonly number[], salt: string, tie = 0.10,
): T {
  let best = items[0] as T;
  let bestScore = Infinity;
  for (const item of items) {
    const v = vector(item);
    let d = 0;
    for (let i = 0; i < target.length; i += 1) d += ((v[i] ?? 0) - (target[i] ?? 0)) ** 2;
    const score = d + hash(`${salt}:${item.id}`) * tie;
    if (score < bestScore) { bestScore = score; best = item; }
  }
  return best;
}

/**
 * The head lattice.
 *
 * Nearest-neighbour was the first attempt and it failed a measurable test:
 * across twenty players it reached only nine of the twenty-two skulls, because
 * morph dimensions cluster near the population mean and the shapes at the
 * edges of the space were never anybody's nearest. Amplifying the target did
 * not fix it; it moved the cluster without spreading it.
 *
 * A lattice does fix it, and it is honest about what it is: skull width into
 * four bands, length into three, jaw into two, and an explicit table saying
 * which drawing belongs in each of the twenty-four cells. Every shape appears,
 * the assignment is still driven entirely by the morph, and a broad short
 * heavy-jawed player gets the broad short heavy-jawed skull rather than
 * whichever one happened to be closest in five dimensions.
 */
const HEAD_LATTICE: readonly string[] = [
  /* narrow      */ 'narrow-short', 'pentagon', 'taper-v', 'diamond', 'narrow-long', 'angular-lean',
  /* mid-narrow  */ 'round-soft', 'inverted-egg', 'oval-balanced', 'heavy-jaw', 'oval-long', 'rect-tall',
  /* mid-broad   */ 'round-full', 'square-heavy', 'forehead-wide', 'broad-midface', 'forehead-tall', 'high-cheek',
  /* broad       */ 'broad-short', 'square-broad', 'narrow-jaw', 'square-heavy', 'broad-long', 'rect-tall',
];

const band = (v: number, n: number): number =>
  Math.min(n - 1, Math.max(0, Math.floor(((Math.min(1, Math.max(-1, v)) + 1) / 2) * n)));

export function headFor(m: FaceMorph): HeadShape {
  const w = band(m.skullWidth, 4);
  const l = band(m.skullLength, 3);
  const j = band((m.jawWidth + m.gonialFlare) / 2, 2);
  const id = HEAD_LATTICE[w * 6 + l * 2 + j] ?? 'oval-balanced';
  return HEAD_SHAPES.find((h) => h.id === id) ?? (HEAD_SHAPES[0] as HeadShape);
}

export interface IllustratedSelection {
  readonly head: string;
  readonly eyes: string;
  readonly brows: string;
  readonly nose: string;
  readonly mouth: string;
  readonly ears: string;
}

export function selectFeatures(profile: AvatarProfile, m: FaceMorph): IllustratedSelection {
  const i = profile.identity;
  const seed = profile.seed;

  const head = headFor(m);

  const eyes = nearest(EYE_SPECS, (s) => [
    (s.ratio - 0.42) * 6, (s.hood - 0.40) * 2.2,
    (s.outerY - s.innerY) * 4, (s.iris - 1.0) * 6,
  ], [m.eyeHeight, m.lidHeavy, -m.eyeAngle, m.eyeWidth * 0.5], `${seed}:${i.eyes}`);

  const brows = nearest(BROW_SPECS, (s) => [
    (s.peak - 0.12) * 14, (s.arch - 0.055) * 14, s.tilt * 14, (s.length - 1.03) * 8,
  ], [m.browThickness, m.browCurve, m.browTaper, m.browLength], `${seed}:${i.eyebrows}`);

  const nose = nearest(NOSE_SPECS, (s) => [
    (s.alaW - 1.02) * 4, (s.tipW - 0.61) * 5,
    s.profile === 'convex' || s.profile === 'stepped' ? 0.7 : s.profile === 'concave' ? -0.7 : 0,
    (s.bridgeW - 0.44) * 6, (s.tipDrop - 0.035) * 8,
  ], [m.nostrilWidth, m.tipRound, m.bridgeHeight, m.bridgeWidth, m.tipAngle], `${seed}:${i.nose}`);

  const mouth = nearest(MOUTH_SPECS, (s) => [
    (s.upper - 0.11) * 16, (s.lower - 0.14) * 14,
    (s.width - 1.0) * 6, (s.bow - 0.34) * 4, s.corner * 10,
  ], [m.upperLip, m.lowerLip, m.mouthWidth, m.cupidBow, m.mouthCorner], `${seed}:${i.lips}`);

  const ears = nearest(EAR_SPECS, (s) => [
    (s.ratio - 0.56) * 8, (s.projection - 0.14) * 10, (s.lobe - 0.31) * 6,
  ], [m.earSize, m.earProtrusion, m.earLobe], `${seed}:${i.ears}`);

  return { head: head.id, eyes: eyes.id, brows: brows.id, nose: nose.id, mouth: mouth.id, ears: ears.id };
}
