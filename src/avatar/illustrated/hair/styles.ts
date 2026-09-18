// Every hairstyle the identity system already knows, given a drawing.
//
// The trait library in _shared/avatar/hair.ts has sixty-two hairstyle ids and
// they are part of players' stored identity, so the renderer does not get to
// pick a convenient subset -- every id has to come out as something. What it
// does get to do is share construction: a low fade and a mid fade are the same
// construction at two fade heights, and a loc and a twist are not.
//
// `family` is the construction. It decides how the mass is drawn and how it is
// textured, and the brief is explicit about why that matters: the failure to
// avoid is every hairstyle arriving as a smooth solid helmet.

export type HairFamily =
  | 'skin' | 'buzz' | 'fade' | 'waves' | 'curls' | 'afro' | 'twists'
  | 'locs' | 'cornrows' | 'braids' | 'crop' | 'sweep' | 'long' | 'bun';

export type Hairline = 'straight' | 'rounded' | 'widow' | 'receding' | 'irregular';

export interface HairStyle {
  readonly id: string;
  readonly family: HairFamily;
  /** How far the mass stands off the skull, in face heights. */
  readonly volume: number;
  /** Extra height above the crown, in face heights. */
  readonly top: number;
  /** How far the hair falls below the ear line, in face heights. 0 stops at
   *  the temple. */
  readonly fall: number;
  /** 0 leaves the sides full, 1 takes them to skin. */
  readonly fade: number;
  /** Where the fade or taper line sits, as a fraction of crown-to-chin. */
  readonly fadeT: number;
  readonly hairline: Hairline;
  /** -1 to 1. 0 draws no part. */
  readonly part: number;
}

const h = (
  id: string, family: HairFamily, volume: number, top: number, fall: number,
  fade: number, fadeT: number, hairline: Hairline, part = 0,
): HairStyle => ({ id, family, volume, top, fall, fade, fadeT, hairline, part });

export const HAIR_STYLES: readonly HairStyle[] = [
  h('bald', 'skin', 0, 0, 0, 1, 0.16, 'receding'),
  h('shaved', 'skin', 0.004, 0, 0, 0.85, 0.44, 'rounded'),
  h('horseshoe-shaved', 'skin', 0.010, 0, 0, 0.30, 0.46, 'receding'),
  h('buzz', 'buzz', 0.012, 0.004, 0, 0.30, 0.46, 'straight'),
  h('buzz-faded', 'buzz', 0.013, 0.004, 0, 0.72, 0.42, 'straight'),
  h('crew', 'buzz', 0.022, 0.012, 0, 0.55, 0.42, 'straight'),
  h('caesar', 'buzz', 0.024, 0.008, 0, 0.35, 0.46, 'straight'),
  h('fade-low', 'fade', 0.030, 0.018, 0, 0.88, 0.50, 'straight'),
  h('fade-mid', 'fade', 0.032, 0.020, 0, 0.92, 0.42, 'straight'),
  h('fade-high', 'fade', 0.036, 0.026, 0, 0.96, 0.34, 'straight'),
  h('fade-skin', 'fade', 0.034, 0.024, 0, 1.00, 0.38, 'straight'),
  h('fade-burst', 'fade', 0.032, 0.020, 0, 0.90, 0.44, 'rounded'),
  h('fade-drop', 'fade', 0.032, 0.020, 0, 0.90, 0.46, 'rounded'),
  h('taper', 'fade', 0.028, 0.014, 0, 0.60, 0.52, 'straight'),
  h('taper-line', 'fade', 0.028, 0.014, 0, 0.66, 0.50, 'straight'),
  h('undercut-short', 'fade', 0.040, 0.030, 0, 1.00, 0.36, 'straight'),
  h('waves', 'waves', 0.018, 0.008, 0, 0.55, 0.46, 'straight'),
  h('waves-deep', 'waves', 0.020, 0.010, 0, 0.62, 0.44, 'straight'),
  h('sponge', 'curls', 0.044, 0.030, 0, 0.42, 0.48, 'rounded'),
  h('short-curls', 'curls', 0.048, 0.034, 0, 0.36, 0.50, 'rounded'),
  h('curls-medium', 'curls', 0.070, 0.050, 0.05, 0.16, 0.56, 'rounded'),
  h('curls-loose', 'curls', 0.078, 0.052, 0.09, 0.10, 0.58, 'irregular'),
  h('long-curly', 'curls', 0.100, 0.060, 0.26, 0.00, 0.60, 'irregular'),
  h('afro-short', 'afro', 0.058, 0.046, 0, 0.30, 0.50, 'rounded'),
  h('afro-medium', 'afro', 0.090, 0.078, 0.02, 0.12, 0.54, 'rounded'),
  h('afro-full', 'afro', 0.130, 0.115, 0.06, 0.00, 0.56, 'rounded'),
  h('high-top', 'afro', 0.048, 0.130, 0, 0.88, 0.40, 'straight'),
  h('flat-top', 'afro', 0.040, 0.085, 0, 0.90, 0.40, 'straight'),
  h('twists-short', 'twists', 0.040, 0.028, 0, 0.40, 0.50, 'rounded'),
  h('twists-medium', 'twists', 0.052, 0.034, 0.10, 0.20, 0.54, 'rounded'),
  h('twists-long', 'twists', 0.058, 0.036, 0.30, 0.10, 0.56, 'rounded'),
  h('locs-short', 'locs', 0.044, 0.030, 0.04, 0.34, 0.50, 'straight'),
  h('locs-medium', 'locs', 0.052, 0.034, 0.20, 0.16, 0.54, 'straight'),
  h('locs-long', 'locs', 0.056, 0.036, 0.42, 0.06, 0.56, 'straight'),
  h('locs-tied', 'locs', 0.050, 0.044, 0.10, 0.22, 0.52, 'straight'),
  h('cornrows-straight', 'cornrows', 0.024, 0.016, 0.03, 0.30, 0.52, 'straight'),
  h('cornrows-zigzag', 'cornrows', 0.026, 0.016, 0.03, 0.30, 0.52, 'irregular'),
  h('cornrows-parted', 'cornrows', 0.026, 0.018, 0.03, 0.26, 0.52, 'straight', 0.5),
  h('braids-back', 'braids', 0.032, 0.020, 0.12, 0.24, 0.52, 'straight'),
  h('braids-long', 'braids', 0.034, 0.022, 0.34, 0.14, 0.54, 'straight'),
  h('textured-crop', 'crop', 0.036, 0.026, 0, 0.44, 0.46, 'irregular'),
  h('french-crop', 'crop', 0.034, 0.022, 0, 0.58, 0.44, 'straight'),
  h('ivy', 'crop', 0.030, 0.018, 0, 0.46, 0.48, 'straight', 0.6),
  h('bowl', 'crop', 0.040, 0.024, 0.02, 0.10, 0.50, 'straight'),
  h('messy-medium', 'crop', 0.062, 0.044, 0.08, 0.14, 0.54, 'irregular'),
  h('shag', 'crop', 0.070, 0.042, 0.16, 0.06, 0.56, 'irregular'),
  h('receding-short', 'crop', 0.028, 0.016, 0, 0.42, 0.48, 'receding'),
  h('mullet', 'crop', 0.044, 0.026, 0.30, 0.34, 0.50, 'straight'),
  h('mullet-modern', 'crop', 0.052, 0.034, 0.26, 0.48, 0.46, 'irregular'),
  h('undercut-long', 'crop', 0.060, 0.046, 0.06, 0.94, 0.38, 'straight', 0.7),
  h('side-part-short', 'sweep', 0.034, 0.024, 0, 0.42, 0.48, 'straight', 0.55),
  h('comb-over', 'sweep', 0.038, 0.026, 0, 0.30, 0.50, 'receding', 0.7),
  h('side-part-medium', 'sweep', 0.048, 0.034, 0.04, 0.22, 0.52, 'straight', 0.6),
  h('slick-back', 'sweep', 0.042, 0.030, 0.06, 0.16, 0.52, 'widow'),
  h('pompadour', 'sweep', 0.050, 0.072, 0.02, 0.44, 0.46, 'straight'),
  h('quiff', 'sweep', 0.046, 0.060, 0.02, 0.40, 0.46, 'straight'),
  h('curtains', 'sweep', 0.056, 0.030, 0.12, 0.08, 0.56, 'straight', -0.2),
  h('long-straight', 'long', 0.052, 0.028, 0.40, 0.00, 0.60, 'straight', 0.4),
  h('long-wavy', 'long', 0.062, 0.032, 0.36, 0.00, 0.60, 'irregular', 0.3),
  h('ponytail', 'long', 0.040, 0.026, 0.10, 0.06, 0.56, 'straight'),
  h('man-bun', 'bun', 0.038, 0.030, 0.06, 0.20, 0.54, 'straight'),
  h('top-knot', 'bun', 0.036, 0.060, 0.04, 0.70, 0.44, 'straight'),
];

export const hairStyle = (id: string): HairStyle =>
  HAIR_STYLES.find((s) => s.id === id) ?? (HAIR_STYLES[3] as HairStyle);
