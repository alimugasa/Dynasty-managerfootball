// Fourteen eyes.
//
// The rejected renderers all drew one eye and moved it: same lid curve, same
// corners, same iris, different width. An eye is not a lens shape -- the
// upper lid is a different curve from the lower one, the two corners sit at
// different heights, and where the upper lid peaks is most of what separates a
// deep-set eye from a wide one. All of that is authored per construction here.
//
// Everything is a fraction of the eye's own width or height, so a construction
// works at any size the layout hands it.

export interface EyeSpec {
  readonly id: string;
  readonly label: string;
  /** Height as a fraction of width. */
  readonly ratio: number;
  /** Where along the eye the upper lid peaks, 0 at the inner corner. */
  readonly upperApex: number;
  /** How far the upper lid rises above the corner line, in eye heights. */
  readonly upperRise: number;
  readonly lowerApex: number;
  readonly lowerDrop: number;
  /** Corner heights relative to the eye's centre line; positive is lower. */
  readonly innerY: number;
  readonly outerY: number;
  /** Iris diameter in eye heights. Over 1 means the lid cuts it, which is what
   *  a normal open eye actually does. */
  readonly iris: number;
  /** 0 is an open lid with a visible crease, 1 is fully hooded. */
  readonly hood: number;
  /** Where the crease sits above the lid, in eye heights. */
  readonly crease: number;
  /** Extra weight on the lash line. */
  readonly lash: number;
}

const e = (
  id: string, label: string, ratio: number, upperApex: number, upperRise: number,
  lowerApex: number, lowerDrop: number, innerY: number, outerY: number,
  iris: number, hood: number, crease: number, lash: number,
): EyeSpec => ({
  id, label, ratio, upperApex, upperRise, lowerApex, lowerDrop,
  innerY, outerY, iris, hood, crease, lash,
});

export const EYE_SPECS: readonly EyeSpec[] = [
  e('almond-even', 'Even almond', 0.42, 0.42, 0.62, 0.55, 0.42, 0.06, -0.02, 1.02, 0.25, 0.72, 1.0),
  e('almond-tilted', 'Tilted almond', 0.40, 0.46, 0.60, 0.52, 0.40, 0.14, -0.14, 1.00, 0.28, 0.70, 1.0),
  e('round-open', 'Round and open', 0.54, 0.48, 0.76, 0.50, 0.62, 0.02, 0.00, 1.10, 0.10, 0.92, 0.9),
  e('narrow-long', 'Narrow and long', 0.31, 0.44, 0.50, 0.56, 0.32, 0.04, -0.04, 0.96, 0.34, 0.58, 1.1),
  e('hooded-heavy', 'Heavy hood', 0.36, 0.38, 0.48, 0.55, 0.40, 0.08, 0.04, 0.98, 0.86, 0.30, 1.3),
  e('hooded-soft', 'Soft hood', 0.40, 0.40, 0.56, 0.54, 0.42, 0.06, 0.02, 1.00, 0.58, 0.46, 1.1),
  e('deep-set', 'Deep set', 0.37, 0.44, 0.52, 0.52, 0.36, 0.05, -0.05, 0.96, 0.52, 0.40, 1.2),
  e('wide-alert', 'Wide and alert', 0.50, 0.46, 0.74, 0.52, 0.54, 0.00, -0.06, 1.08, 0.12, 0.88, 0.9),
  e('downturned', 'Downturned', 0.42, 0.38, 0.60, 0.58, 0.46, -0.04, 0.18, 1.00, 0.30, 0.70, 1.0),
  e('upturned', 'Upturned', 0.42, 0.50, 0.64, 0.50, 0.38, 0.14, -0.20, 1.00, 0.26, 0.74, 1.0),
  e('monolid-smooth', 'Smooth lid', 0.38, 0.44, 0.54, 0.54, 0.36, 0.10, -0.08, 0.98, 0.94, 0.00, 1.2),
  e('epicanthic', 'Inner fold', 0.39, 0.48, 0.56, 0.52, 0.38, 0.16, -0.10, 0.98, 0.70, 0.34, 1.1),
  e('small-tight', 'Small and tight', 0.34, 0.42, 0.46, 0.56, 0.30, 0.06, 0.00, 0.92, 0.44, 0.52, 1.2),
  e('broad-square', 'Broad and square', 0.44, 0.50, 0.58, 0.48, 0.50, 0.02, 0.02, 1.04, 0.22, 0.80, 1.0),
  e('deep-hooded', 'Deep and hooded', 0.33, 0.40, 0.44, 0.54, 0.32, 0.07, 0.06, 0.94, 0.78, 0.22, 1.35),
  e('wide-almond', 'Wide almond', 0.46, 0.44, 0.68, 0.54, 0.48, 0.04, -0.08, 1.06, 0.18, 0.82, 0.95),
];

export const eyeSpec = (id: string): EyeSpec =>
  EYE_SPECS.find((s) => s.id === id) ?? (EYE_SPECS[0] as EyeSpec);
