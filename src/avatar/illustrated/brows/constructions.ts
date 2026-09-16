// Twelve brows.
//
// Brows do a disproportionate amount of identity work -- they are the fastest
// thing the eye reads on a face and the easiest to get wrong, because a brow
// drawn as a stroke reads as a mark and a brow drawn as a shape reads as hair.
// Every construction here is a closed filled shape with its own thickness
// profile, so a flat heavy brow and a high arched one are different objects
// rather than the same arc at two stroke widths.

export interface BrowSpec {
  readonly id: string;
  readonly label: string;
  /** Length as a fraction of the eye's width. Over 1 overhangs the eye. */
  readonly length: number;
  /** Thickness at the inner end and at the arch, in brow lengths. */
  readonly inner: number;
  readonly peak: number;
  /** Thickness where it tapers out. */
  readonly tail: number;
  /** Where along the brow the arch sits. */
  readonly apex: number;
  /** How far the arch rises, in brow lengths. */
  readonly arch: number;
  /** Overall tilt: positive lifts the outer end. */
  readonly tilt: number;
  /** How far the inner ends sit from the face's centre line, in eye widths. */
  readonly gap: number;
}

const b = (
  id: string, label: string, length: number, inner: number, peak: number,
  tail: number, apex: number, arch: number, tilt: number, gap: number,
): BrowSpec => ({ id, label, length, inner, peak, tail, apex, arch, tilt, gap });

export const BROW_SPECS: readonly BrowSpec[] = [
  b('straight-medium', 'Straight', 1.04, 0.115, 0.120, 0.045, 0.50, 0.030, 0.00, 0.34),
  b('straight-heavy', 'Heavy straight', 1.08, 0.155, 0.160, 0.065, 0.50, 0.022, -0.02, 0.28),
  b('arched-soft', 'Soft arch', 1.02, 0.095, 0.115, 0.040, 0.58, 0.085, 0.03, 0.36),
  b('arched-high', 'High arch', 1.00, 0.080, 0.105, 0.032, 0.62, 0.130, 0.05, 0.38),
  b('angled-sharp', 'Sharp angle', 1.06, 0.130, 0.135, 0.040, 0.66, 0.100, 0.07, 0.30),
  b('flat-thick', 'Flat and thick', 1.10, 0.165, 0.150, 0.080, 0.46, 0.010, -0.04, 0.26),
  b('thin-tapered', 'Thin tapered', 0.98, 0.070, 0.078, 0.026, 0.55, 0.060, 0.02, 0.38),
  b('short-strong', 'Short and strong', 0.86, 0.150, 0.145, 0.055, 0.50, 0.040, 0.00, 0.34),
  b('long-low', 'Long and low', 1.18, 0.110, 0.115, 0.048, 0.48, 0.018, -0.03, 0.24),
  b('rounded-full', 'Rounded', 1.02, 0.120, 0.140, 0.060, 0.54, 0.070, 0.01, 0.32),
  b('descending', 'Descending', 1.04, 0.140, 0.120, 0.042, 0.40, 0.030, -0.09, 0.28),
  b('peaked-narrow', 'Narrow peak', 0.96, 0.090, 0.128, 0.030, 0.68, 0.115, 0.06, 0.40),
];

export const browSpec = (id: string): BrowSpec =>
  BROW_SPECS.find((s) => s.id === id) ?? (BROW_SPECS[0] as BrowSpec);
