// Eighteen noses.
//
// The single most important file in this system, because the nose is the
// feature every previous attempt drew as two thin lines and a pair of dots,
// and two thin lines are the same two thin lines whatever numbers you feed
// them. A nose here is filled shapes -- a bridge with a lit side and a shaded
// side, a tip with volume, two wings, two nostrils -- plus a small number of
// restrained highlight and shadow forms that give it readable form without
// pretending to be a render.
//
// It stays illustrated. There is no gradient mesh, no specular, no attempt at
// skin. What makes one nose different from another is the shape of the filled
// forms, which is how an illustrator does it.

export type TipShape = 'round' | 'pointed' | 'bulbous' | 'flat' | 'narrow' | 'square';
export type NostrilShape = 'oval' | 'slit' | 'round' | 'wide' | 'flared' | 'tucked';
export type BridgeProfile = 'straight' | 'convex' | 'concave' | 'stepped';

export interface NoseSpec {
  readonly id: string;
  readonly label: string;
  /** Widths as fractions of the layout's nose width. */
  readonly rootW: number;
  readonly bridgeW: number;
  readonly tipW: number;
  readonly alaW: number;
  /** Where the modelled bridge starts, as a fraction of brow-to-base. */
  readonly bridgeTop: number;
  readonly tip: TipShape;
  readonly nostril: NostrilShape;
  readonly profile: BridgeProfile;
  /** How high the wings sit above the base line, in nose widths. */
  readonly alaLift: number;
  /** Shading strength for the shadow side, 0-1. Restraint is the point: this
   *  is an illustration, and a nose carrying a full render's worth of shadow
   *  is the only thing on the face that does. */
  readonly depth: number;
  /** How far the tip hangs below the wings. */
  readonly tipDrop: number;
}

const n = (
  id: string, label: string, rootW: number, bridgeW: number, tipW: number, alaW: number,
  bridgeTop: number, tip: TipShape, nostril: NostrilShape, profile: BridgeProfile,
  alaLift: number, depth: number, tipDrop: number,
): NoseSpec => ({
  id, label, rootW, bridgeW, tipW, alaW, bridgeTop, tip, nostril, profile, alaLift, depth, tipDrop,
});

export const NOSE_SPECS: readonly NoseSpec[] = [
  n('straight-medium', 'Straight', 0.40, 0.44, 0.58, 1.00, 0.10, 'round', 'oval', 'straight', 0.10, 0.50, 0.02),
  n('straight-narrow', 'Narrow straight', 0.33, 0.36, 0.48, 0.86, 0.06, 'pointed', 'slit', 'straight', 0.12, 0.44, 0.03),
  n('straight-broad', 'Broad straight', 0.50, 0.56, 0.72, 1.16, 0.12, 'round', 'wide', 'straight', 0.06, 0.52, 0.00),
  n('aquiline', 'Aquiline', 0.36, 0.40, 0.50, 0.90, 0.04, 'pointed', 'slit', 'convex', 0.16, 0.60, 0.09),
  n('convex-strong', 'Strong bridge', 0.42, 0.50, 0.58, 0.98, 0.02, 'round', 'oval', 'convex', 0.14, 0.62, 0.07),
  n('concave-soft', 'Soft scoop', 0.38, 0.36, 0.60, 0.98, 0.14, 'round', 'round', 'concave', 0.04, 0.42, -0.03),
  n('upturned', 'Upturned', 0.36, 0.38, 0.58, 0.96, 0.16, 'round', 'round', 'concave', 0.02, 0.40, -0.06),
  n('bulbous-round', 'Rounded tip', 0.42, 0.46, 0.76, 1.06, 0.14, 'bulbous', 'oval', 'straight', 0.08, 0.48, 0.05),
  n('bulbous-wide', 'Full and wide', 0.48, 0.54, 0.84, 1.22, 0.16, 'bulbous', 'flared', 'straight', 0.04, 0.50, 0.04),
  n('flat-broad', 'Flat and broad', 0.52, 0.54, 0.70, 1.24, 0.18, 'flat', 'wide', 'concave', 0.02, 0.38, -0.02),
  n('flat-wide-set', 'Wide set', 0.56, 0.58, 0.72, 1.32, 0.20, 'flat', 'flared', 'straight', 0.00, 0.40, -0.01),
  n('narrow-refined', 'Refined', 0.30, 0.32, 0.44, 0.80, 0.06, 'narrow', 'tucked', 'straight', 0.14, 0.46, 0.04),
  n('long-narrow', 'Long and narrow', 0.32, 0.34, 0.46, 0.84, 0.00, 'pointed', 'slit', 'straight', 0.18, 0.54, 0.08),
  n('short-wide', 'Short and wide', 0.48, 0.52, 0.70, 1.18, 0.24, 'round', 'wide', 'concave', 0.02, 0.42, -0.02),
  n('square-tip', 'Square tip', 0.44, 0.48, 0.66, 1.04, 0.10, 'square', 'oval', 'straight', 0.08, 0.52, 0.03),
  n('stepped-bridge', 'Stepped bridge', 0.38, 0.48, 0.56, 0.96, 0.02, 'round', 'oval', 'stepped', 0.12, 0.58, 0.05),
  n('heavy-columella', 'Heavy base', 0.42, 0.46, 0.64, 1.08, 0.12, 'round', 'tucked', 'straight', 0.06, 0.50, 0.10),
  n('drooping', 'Drooping', 0.38, 0.44, 0.56, 0.98, 0.06, 'pointed', 'slit', 'convex', 0.18, 0.56, 0.13),
  n('broad-flat-tip', 'Broad flat tip', 0.46, 0.50, 0.80, 1.14, 0.14, 'flat', 'oval', 'straight', 0.04, 0.46, 0.02),
  n('narrow-high', 'Narrow and high', 0.28, 0.34, 0.46, 0.82, 0.00, 'narrow', 'slit', 'convex', 0.16, 0.58, 0.06),
];

export const noseSpec = (id: string): NoseSpec =>
  NOSE_SPECS.find((s) => s.id === id) ?? (NOSE_SPECS[0] as NoseSpec);
