// Seven ears.
//
// Small, and worth doing properly anyway: an ear is one of the few features
// visible in silhouette, so a population with one ear shape has one silhouette
// family however much the faces differ. Each construction is an outer helix
// shape plus an inner fold drawn as a line, and they differ in the outline, not
// only in scale.

export type EarOutline = 'oval' | 'round' | 'long' | 'angular' | 'pointed' | 'square' | 'small';

export interface EarSpec {
  readonly id: string;
  readonly label: string;
  readonly outline: EarOutline;
  /** Width as a fraction of the ear's height. */
  readonly ratio: number;
  /** How far the ear stands off the skull, in ear widths. */
  readonly projection: number;
  /** Lobe size, 0 is attached. */
  readonly lobe: number;
  /** Where the widest point sits vertically, 0 at the top. */
  readonly bulge: number;
  /** How much of the inner fold is drawn, 0-1. */
  readonly fold: number;
}

const e = (
  id: string, label: string, outline: EarOutline, ratio: number,
  projection: number, lobe: number, bulge: number, fold: number,
): EarSpec => ({ id, label, outline, ratio, projection, lobe, bulge, fold });

export const EAR_SPECS: readonly EarSpec[] = [
  e('oval-standard', 'Standard', 'oval', 0.56, 0.16, 0.34, 0.40, 0.85),
  e('round-full', 'Round', 'round', 0.66, 0.20, 0.42, 0.45, 0.80),
  e('long-narrow', 'Long and narrow', 'long', 0.46, 0.14, 0.30, 0.38, 0.90),
  e('angular-flat', 'Angular', 'angular', 0.54, 0.10, 0.22, 0.34, 0.95),
  e('pointed-top', 'Pointed', 'pointed', 0.52, 0.18, 0.26, 0.32, 0.85),
  e('square-set', 'Square', 'square', 0.60, 0.12, 0.38, 0.44, 0.75),
  e('small-tucked', 'Small', 'small', 0.58, 0.06, 0.24, 0.42, 0.70),
];

export const earSpec = (id: string): EarSpec =>
  EAR_SPECS.find((s) => s.id === id) ?? (EAR_SPECS[0] as EarSpec);
