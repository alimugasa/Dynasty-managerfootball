// Fourteen mouths.
//
// A mouth is two lips and the line between them, and the line is the least
// important of the three. Drawing only the line -- which is what the earlier
// renderers did -- gives every player the same mouth, because a line has no
// thickness to vary. Each construction here is an upper lip shape with its own
// cupid's bow, a lower lip shape with its own fullness, and a seam.
//
// Expressions stay neutral to faintly set. A portrait of a professional
// athlete is not smiling, and a mouth that curves is the fastest way to make a
// roster look like a cartoon.

export interface MouthSpec {
  readonly id: string;
  readonly label: string;
  /** Multiplies the layout's mouth width. */
  readonly width: number;
  /** Lip heights, in mouth widths. */
  readonly upper: number;
  readonly lower: number;
  /** Cupid's bow depth, 0 is a flat upper edge. */
  readonly bow: number;
  /** How far apart the two peaks of the bow sit, in mouth widths. */
  readonly peaks: number;
  /** Corner height relative to the seam; positive drops the corners. */
  readonly corner: number;
  /** Seam curvature; positive bows the seam downward. */
  readonly seam: number;
  /** How rounded the lower lip's underside is, 0-1. */
  readonly fullness: number;
  /** Philtrum width in mouth widths; 0 draws none. */
  readonly philtrum: number;
}

const m = (
  id: string, label: string, width: number, upper: number, lower: number, bow: number,
  peaks: number, corner: number, seam: number, fullness: number, philtrum: number,
): MouthSpec => ({ id, label, width, upper, lower, bow, peaks, corner, seam, fullness, philtrum });

export const MOUTH_SPECS: readonly MouthSpec[] = [
  m('neutral-medium', 'Neutral', 1.00, 0.105, 0.135, 0.34, 0.24, 0.02, 0.04, 0.55, 0.13),
  m('thin-set', 'Thin and set', 0.98, 0.062, 0.082, 0.26, 0.22, 0.05, 0.02, 0.40, 0.12),
  m('full-even', 'Full and even', 1.02, 0.145, 0.170, 0.40, 0.26, 0.00, 0.05, 0.65, 0.15),
  m('full-lower', 'Full lower lip', 1.00, 0.095, 0.185, 0.32, 0.24, 0.01, 0.06, 0.72, 0.13),
  m('full-upper', 'Full upper lip', 0.98, 0.150, 0.130, 0.46, 0.28, 0.02, 0.03, 0.50, 0.16),
  m('wide-thin', 'Wide and thin', 1.14, 0.070, 0.092, 0.22, 0.20, 0.04, 0.03, 0.42, 0.10),
  m('wide-full', 'Wide and full', 1.14, 0.130, 0.160, 0.32, 0.22, 0.00, 0.05, 0.62, 0.11),
  m('narrow-full', 'Narrow and full', 0.86, 0.135, 0.165, 0.44, 0.30, 0.00, 0.06, 0.66, 0.18),
  m('narrow-thin', 'Narrow and thin', 0.86, 0.068, 0.090, 0.30, 0.26, 0.05, 0.02, 0.44, 0.16),
  m('bow-pronounced', 'Pronounced bow', 1.00, 0.125, 0.145, 0.62, 0.30, 0.01, 0.04, 0.58, 0.19),
  m('bow-flat', 'Flat upper edge', 1.02, 0.100, 0.140, 0.08, 0.18, 0.03, 0.04, 0.56, 0.08),
  m('corners-down', 'Set corners', 1.00, 0.100, 0.130, 0.34, 0.24, 0.10, 0.07, 0.54, 0.13),
  m('corners-level', 'Level corners', 1.02, 0.105, 0.138, 0.34, 0.24, -0.03, 0.01, 0.56, 0.13),
  m('protruding', 'Protruding', 0.96, 0.140, 0.175, 0.38, 0.26, 0.00, 0.08, 0.78, 0.14),
];

export const mouthSpec = (id: string): MouthSpec =>
  MOUTH_SPECS.find((s) => s.id === id) ?? (MOUTH_SPECS[0] as MouthSpec);
