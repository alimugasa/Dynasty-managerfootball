// Twenty-two skulls.
//
// Each one is its own set of landmarks, not the average head at a different
// scale. Scaling one master silhouette is the failure mode the brief names
// explicitly and it is also what the previous two renderers actually did: with
// one profile and a width multiplier, a "broad" face and a "narrow" face are
// the same drawing at two sizes, and the eye reads them as one man.
//
// A profile is ten half-widths taken at ten fixed heights between the crown
// and the chin. The shape of that sequence is the face: a rectangle holds its
// width from the temple to the jaw, a diamond peaks at the cheekbone and falls
// away both ways, a tapered face loses width monotonically below the eye line.
// Those are different curves, not one curve rescaled.
//
// The vertical proportions are authored per shape too, because "midface
// length" is a real structural difference and cannot be expressed in widths: a
// long-midface face has its nose base lower relative to its chin, and that
// reads instantly even in silhouette.

/** The ten heights at which a profile is measured, as fractions of the
 *  crown-to-chin distance. */
export const PROFILE_T = [0, 0.08, 0.18, 0.30, 0.42, 0.54, 0.66, 0.78, 0.89, 1] as const;

export type JawStyle = 'square' | 'angular' | 'round' | 'tapered';

export interface HeadShape {
  readonly id: string;
  readonly label: string;
  /** The structural family a person would name it by. */
  readonly category: string;
  /** Half-widths at PROFILE_T, in the portrait's own units. */
  readonly w: readonly number[];
  /** Crown-to-chin, relative to the reference face. */
  readonly length: number;
  /** How the jaw corner is constructed, which changes the path, not just its
   *  numbers: a square jaw gets an extra corner landmark and a lower spline
   *  tension, a round one gets neither. */
  readonly jaw: JawStyle;
  /** Fractions of crown-to-chin. Defaults are the reference proportions. */
  readonly browT?: number;
  readonly eyeT?: number;
  readonly noseT?: number;
  readonly mouthT?: number;
}

const s = (
  id: string, label: string, category: string, w: readonly number[],
  length: number, jaw: JawStyle, v: Partial<Pick<HeadShape, 'browT' | 'eyeT' | 'noseT' | 'mouthT'>> = {},
): HeadShape => ({ id, label, category, w, length, jaw, ...v });

export const HEAD_SHAPES: readonly HeadShape[] = [
  s('oval-balanced', 'Balanced oval', 'oval',
    [34, 72, 92, 101, 103, 98, 86, 70, 48, 24], 1.00, 'round'),
  s('oval-long', 'Long oval', 'oval',
    [31, 67, 86, 94, 96, 92, 81, 65, 44, 22], 1.10, 'round', { noseT: 0.715 }),
  s('narrow-long', 'Narrow and long', 'narrow / long',
    [28, 61, 78, 85, 87, 83, 73, 58, 39, 20], 1.13, 'tapered', { noseT: 0.725, mouthT: 0.825 }),
  s('narrow-short', 'Narrow and short', 'narrow / short',
    [30, 65, 83, 89, 90, 86, 76, 62, 42, 22], 0.90, 'round', { noseT: 0.685 }),
  s('broad-long', 'Broad and long', 'broad / long',
    [39, 82, 103, 112, 114, 110, 98, 82, 57, 29], 1.08, 'square'),
  s('broad-short', 'Broad and short', 'broad / short',
    [42, 86, 108, 116, 118, 113, 101, 86, 60, 31], 0.89, 'square', { noseT: 0.675 }),
  s('rect-tall', 'Rectangular', 'rectangular',
    [33, 74, 95, 100, 101, 100, 96, 88, 66, 34], 1.11, 'square', { browT: 0.465, noseT: 0.715 }),
  s('square-heavy', 'Heavy square', 'square',
    [38, 80, 100, 106, 107, 106, 102, 95, 74, 40], 0.96, 'square'),
  s('square-broad', 'Broad square', 'square',
    [41, 85, 106, 113, 114, 113, 108, 99, 77, 42], 0.92, 'square', { noseT: 0.685 }),
  s('taper-v', 'Tapered', 'tapered',
    [35, 74, 95, 104, 106, 101, 84, 62, 38, 18], 1.02, 'tapered'),
  s('diamond', 'Diamond', 'diamond',
    [26, 58, 78, 92, 104, 106, 88, 64, 40, 19], 1.02, 'tapered', { browT: 0.435 }),
  s('round-full', 'Full round', 'round',
    [40, 82, 101, 109, 112, 110, 102, 86, 58, 30], 0.88, 'round', { noseT: 0.675, mouthT: 0.795 }),
  s('round-soft', 'Soft round', 'round',
    [37, 77, 95, 103, 106, 104, 96, 81, 55, 29], 0.93, 'round'),
  s('heavy-jaw', 'Heavy jaw', 'heavy jaw',
    [33, 71, 90, 98, 100, 99, 97, 94, 76, 41], 0.99, 'angular'),
  s('narrow-jaw', 'Narrow jaw', 'narrow jaw',
    [36, 76, 96, 103, 104, 97, 80, 60, 38, 19], 1.03, 'tapered'),
  s('high-cheek', 'High cheekbone', 'high cheekbone',
    [31, 68, 87, 96, 103, 108, 88, 68, 45, 22], 1.04, 'angular', { eyeT: 0.490 }),
  s('broad-midface', 'Broad midface', 'broad midface',
    [33, 72, 90, 98, 103, 104, 103, 88, 60, 31], 0.97, 'round', { noseT: 0.715 }),
  s('forehead-tall', 'Tall forehead', 'tall forehead',
    [32, 72, 94, 102, 102, 96, 84, 68, 46, 23], 1.06, 'round',
    { browT: 0.50, eyeT: 0.545, noseT: 0.73, mouthT: 0.825 }),
  s('forehead-wide', 'Wide forehead', 'wide forehead',
    [40, 84, 105, 107, 104, 97, 84, 67, 45, 23], 0.99, 'tapered'),
  s('angular-lean', 'Lean and angular', 'narrow / long',
    [29, 64, 83, 92, 95, 93, 84, 72, 52, 26], 1.09, 'angular', { noseT: 0.715 }),
  s('pentagon', 'Pentagon', 'broad jaw / narrow crown',
    [27, 60, 80, 92, 100, 102, 99, 92, 70, 37], 0.98, 'angular'),
  s('inverted-egg', 'Inverted egg', 'broad lower face',
    [30, 65, 82, 89, 94, 99, 100, 93, 68, 36], 0.95, 'round', { noseT: 0.705 }),
];

export const headShape = (id: string): HeadShape =>
  HEAD_SHAPES.find((h) => h.id === id) ?? (HEAD_SHAPES[0] as HeadShape);
