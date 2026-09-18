// What a player is built like, and what the position has to do with it.
//
// Build is the one part of an avatar that is not free: a nose tells you
// nothing about a man's job, and a neck tells you a great deal. A league where
// the centre and the corner are the same shape from the shoulders up reads as
// wrong immediately, and no amount of facial variety fixes it.
//
// So build is drawn from a distribution the position chooses. Not *decided* by
// the position -- a lean linebacker and a heavy one both exist, and the light
// tail on every row here is what lets them -- but weighted by it, which is the
// difference between a league that looks like a sport and a league that looks
// like a costume rack.

export const BUILDS = [
  'lean', 'athletic', 'compact', 'powerful', 'heavy', 'massive', 'specialist',
] as const;
export type Build = (typeof BUILDS)[number];

export const BUILD_LABEL: Readonly<Record<Build, string>> = {
  lean: 'Lean',
  athletic: 'Athletic',
  compact: 'Compact',
  powerful: 'Powerful',
  heavy: 'Heavy',
  massive: 'Massive',
  specialist: 'Specialist',
};

/**
 * What the renderer does with a build, above the collar.
 *
 * Head-and-shoulders framing only shows three things -- how wide the shoulders
 * are, how thick the neck is, and how much the jawline is carrying -- so those
 * are the three numbers, expressed as multipliers on a neutral figure of 1.
 * Everything else about a build (height, listed weight) is the roster's
 * business and deliberately not stored here twice.
 */
export interface BuildShape {
  readonly shoulders: number;
  readonly neck: number;
  /** How much soft tissue sits under the jaw and over the cheeks. */
  readonly fullness: number;
}

export const BUILD_SHAPES: Readonly<Record<Build, BuildShape>> = {
  lean: { shoulders: 0.9, neck: 0.85, fullness: 0.82 },
  athletic: { shoulders: 1.0, neck: 1.0, fullness: 0.95 },
  compact: { shoulders: 1.02, neck: 1.08, fullness: 1.02 },
  powerful: { shoulders: 1.12, neck: 1.15, fullness: 1.04 },
  heavy: { shoulders: 1.2, neck: 1.26, fullness: 1.16 },
  massive: { shoulders: 1.3, neck: 1.36, fullness: 1.28 },
  specialist: { shoulders: 0.92, neck: 0.92, fullness: 1.0 },
};

/** A complete row: every build, every time. Deliberately not a Partial --
 *  a position that omits a build would inherit the weighted draw's default of
 *  one, which is how an offensive guard ends up lean six times in a hundred.
 *  Saying zero is a decision; leaving it out was an accident waiting. */
type Weights = Readonly<Record<Build, number>>;

const row = (
  lean: number, athletic: number, compact: number, powerful: number,
  heavy: number, massive: number, specialist: number,
): Weights => ({ lean, athletic, compact, powerful, heavy, massive, specialist });

/**
 * Build weights by position.
 *
 * Read a row as relative frequency at that position. The small numbers are
 * the point of the table as much as the large ones: they are what let the
 * 250-pound running back and the tackle who moves like a tight end exist,
 * while keeping them rare enough that seeing one means something. Nothing is
 * flatly zero except where the build would be a rendering error rather than
 * an unusual player.
 */
export const POSITION_BUILDS: Readonly<Record<string, Weights>> = {
  //        lean  athl  comp  powr  heav  mass  spec
  QB:  row(  3,    7,    3,    2,   0.3,  0.05, 0.2 ),
  RB:  row(  2,    6,    6,    3,   0.6,  0.05, 0.05),
  FB:  row(0.1,    1,    4,    6,     3,   0.3, 0.05),
  WR:  row(  7,    8,    3,    1,   0.1,  0.02, 0.1 ),
  TE:  row(0.3,    4,    1,    6,     3,   0.4, 0.05),
  OT:  row(0.02, 0.2,  0.3,    2,     6,     6, 0.02),
  OG:  row(0.02, 0.15, 0.3,    1,     5,     7, 0.02),
  C:   row(0.02, 0.2,  0.5,    2,     6,     5, 0.02),
  EDGE:row(  1,    3,    1,    7,     3,   0.3, 0.02),
  DT:  row(0.02, 0.2,  0.4,    2,     5,     7, 0.02),
  LB:  row(  1,    5,    4,    5,   0.5,  0.05, 0.05),
  CB:  row(  6,    8,    2,  0.3,  0.02,  0.01, 0.05),
  S:   row(  3,    8,    3,    1,  0.05,  0.02, 0.05),
  K:   row(  2,    2,  0.5,  0.2,   0.1,  0.02,    8),
  P:   row(  2,    2,  0.5,  0.2,   0.1,  0.02,    8),
  LS:  row(0.1,    1,    3,    3,     2,   0.3,    5),
};

/** Anything the seed calls something this file has not seen. Deliberately the
 *  widest row in the table: an unknown position is a reason to be uncertain,
 *  not a reason to make everybody athletic. */
const FALLBACK: Weights = row(2, 4, 3, 3, 2, 1, 0.5);

export function buildWeights(position: string): Weights {
  return POSITION_BUILDS[position] ?? FALLBACK;
}
