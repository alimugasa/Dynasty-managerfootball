// Pigmentation as a range, not as three labels.
//
// The request asks for a continuous-looking range rather than light/medium/
// dark, and the reason that matters is not politeness -- it is that three
// labels produce three populations, and a league of three populations looks
// like a league of three populations however carefully the faces are drawn.
//
// So the scale is 36 steps with four undertones crossed over it, and the step
// is the stored value. Two players a step apart are genuinely a step apart
// rather than both being "medium".
//
// One rule holds the whole thing together: pigmentation never touches
// geometry. Changing a player's skin tone must not change the shape of his
// nose, and nothing downstream is allowed to read the tone as a proxy for
// anything else.

export const SKIN_STEPS = 36;

/** What the melanin scale is called where a person has to read it. Bands, not
 *  the stored value -- the stored value is the step. */
export function skinBand(step: number): string {
  if (step <= 5) return 'Very deep';
  if (step <= 11) return 'Deep';
  if (step <= 17) return 'Medium deep';
  if (step <= 23) return 'Medium';
  if (step <= 29) return 'Light medium';
  return 'Light';
}

export const UNDERTONES = ['warm', 'neutral', 'cool', 'olive'] as const;
export type Undertone = (typeof UNDERTONES)[number];

/**
 * The ramp, as a pair of anchors the renderer interpolates between.
 *
 * Kept as hex here rather than in the token file because these are not part of
 * the app's colour system -- tokens.css says its hex values are canonical and
 * must not be normalised, and skin is a different axis entirely: it is content,
 * not chrome. A renderer that wanted a different colour space can convert; the
 * scale it converts from lives here.
 */
const RAMP_DARK = { r: 46, g: 28, b: 20 };
const RAMP_LIGHT = { r: 247, g: 214, b: 189 };

/** Undertone shifts, applied after the ramp. Small on purpose: an undertone
 *  that reads as a different pigmentation is not an undertone. */
const TONE_SHIFT: Readonly<Record<Undertone, { r: number; g: number; b: number }>> = {
  warm: { r: 8, g: 1, b: -7 },
  neutral: { r: 0, g: 0, b: 0 },
  cool: { r: -6, g: -1, b: 9 },
  olive: { r: -2, g: 6, b: -8 },
};

const clamp255 = (n: number): number => Math.max(0, Math.min(255, Math.round(n)));

/** The base skin colour for a step and undertone, as `#rrggbb`. */
export function skinColor(step: number, undertone: Undertone): string {
  const t = Math.max(0, Math.min(SKIN_STEPS - 1, step)) / (SKIN_STEPS - 1);
  // Gamma-weighted rather than linear: an even linear ramp spends most of its
  // steps in the light half, where the eye separates them least, and crushes
  // the deep end into a handful of near-identical tones.
  const eased = Math.pow(t, 0.85);
  const shift = TONE_SHIFT[undertone];
  const mix = (a: number, b: number, d: number): number =>
    clamp255(a + (b - a) * eased + d);
  const r = mix(RAMP_DARK.r, RAMP_LIGHT.r, shift.r);
  const g = mix(RAMP_DARK.g, RAMP_LIGHT.g, shift.g);
  const b = mix(RAMP_DARK.b, RAMP_LIGHT.b, shift.b);
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

/** A shaded version of the base, for the planes of a face. `amount` is
 *  negative to darken and positive to lighten. */
export function shadeSkin(hex: string, amount: number): string {
  const n = hex.replace('#', '');
  const parts = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
  return `#${parts
    .map((c) => clamp255(c + (amount < 0 ? c : 255 - c) * amount).toString(16).padStart(2, '0'))
    .join('')}`;
}
