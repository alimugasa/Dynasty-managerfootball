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
    [31, 72, 89, 92, 94, 96, 92, 81, 64, 29], 1.00, 'round'),
  s('oval-long', 'Long oval', 'oval',
    [30, 69, 86, 89, 91, 93, 89, 78, 60, 27], 1.10, 'round', { noseT: 0.690 }),
  s('narrow-long', 'Narrow and long', 'narrow / long',
    [28, 64, 81, 84, 87, 88, 85, 73, 56, 24], 1.13, 'tapered', { noseT: 0.700, mouthT: 0.805 }),
  s('narrow-short', 'Narrow and short', 'narrow / short',
    [31, 68, 84, 87, 89, 91, 87, 77, 58, 26], 0.90, 'round', { noseT: 0.660 }),
  s('broad-long', 'Broad and long', 'broad / long',
    [35, 78, 97, 100, 101, 104, 100, 91, 74, 35], 1.08, 'square'),
  s('broad-short', 'Broad and short', 'broad / short',
    [37, 83, 103, 107, 110, 111, 106, 98, 78, 37], 0.89, 'square', { noseT: 0.650 }),
  s('rect-tall', 'Rectangular', 'rectangular',
    [33, 74, 92, 95, 97, 99, 98, 93, 78, 35], 1.11, 'square', { browT: 0.465, noseT: 0.690 }),
  s('square-heavy', 'Heavy square', 'square',
    [34, 76, 94, 98, 99, 101, 100, 96, 83, 41], 0.96, 'square'),
  s('square-broad', 'Broad square', 'square',
    [37, 82, 101, 105, 107, 110, 108, 102, 87, 42], 0.92, 'square', { noseT: 0.660 }),
  s('taper-v', 'Tapered', 'tapered',
    [32, 73, 90, 94, 98, 100, 91, 76, 55, 24], 1.02, 'tapered'),
  s('diamond', 'Diamond', 'diamond',
    [30, 69, 85, 89, 97, 104, 96, 80, 59, 26], 1.02, 'tapered', { browT: 0.435 }),
  s('round-full', 'Full round', 'round',
    [36, 80, 99, 103, 105, 107, 104, 95, 77, 34], 0.88, 'round', { noseT: 0.650, mouthT: 0.775 }),
  s('round-soft', 'Soft round', 'round',
    [34, 76, 94, 97, 99, 101, 97, 87, 68, 31], 0.93, 'round'),
  s('heavy-jaw', 'Heavy jaw', 'heavy jaw',
    [32, 71, 89, 92, 94, 98, 97, 96, 85, 41], 0.99, 'angular'),
  s('narrow-jaw', 'Narrow jaw', 'narrow jaw',
    [33, 74, 92, 95, 98, 99, 89, 73, 54, 23], 1.03, 'tapered'),
  s('high-cheek', 'High cheekbone', 'high cheekbone',
    [31, 71, 88, 91, 96, 105, 95, 80, 62, 27], 1.04, 'angular', { eyeT: 0.490 }),
  s('broad-midface', 'Broad midface', 'broad midface',
    [33, 74, 92, 96, 101, 105, 103, 94, 74, 33], 0.97, 'round', { noseT: 0.690 }),
  s('forehead-tall', 'Tall forehead', 'tall forehead',
    [33, 75, 93, 96, 96, 95, 90, 79, 62, 28], 1.06, 'round',
    { browT: 0.500, eyeT: 0.545, noseT: 0.705, mouthT: 0.805 }),
  s('forehead-wide', 'Wide forehead', 'wide forehead',
    [37, 81, 99, 103, 100, 99, 91, 77, 58, 26], 0.99, 'tapered'),
  s('angular-lean', 'Lean and angular', 'narrow / long',
    [30, 68, 85, 88, 92, 96, 91, 82, 65, 29], 1.09, 'angular', { noseT: 0.690 }),
  s('pentagon', 'Pentagon', 'broad jaw / narrow crown',
    [31, 70, 87, 90, 96, 100, 99, 94, 78, 37], 0.98, 'angular'),
  s('inverted-egg', 'Inverted egg', 'broad lower face',
    [30, 68, 85, 88, 94, 100, 102, 95, 77, 36], 0.95, 'round', { noseT: 0.680 }),
];

export const headShape = (id: string): HeadShape =>
  HEAD_SHAPES.find((h) => h.id === id) ?? (HEAD_SHAPES[0] as HeadShape);
