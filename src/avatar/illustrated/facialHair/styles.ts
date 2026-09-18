// Twenty-six beards, built from six regions.
//
// A beard is not one shape. It is some combination of a moustache, a chin
// patch, a jawline, cheeks and a neck, and which of those are present is the
// whole difference between a goatee, a chinstrap and a full beard. Describing
// them as region sets rather than as outlines means a style is four booleans
// and two numbers, and the drawing code is written once.
//
// The ids are the ones the identity system already stores, so every player
// already generated keeps the beard he already had.

export interface FacialHairStyle {
  readonly id: string;
  readonly moustache: boolean;
  readonly chin: boolean;
  readonly jaw: boolean;
  readonly cheek: boolean;
  readonly neck: boolean;
  /** Where the cheek line starts, as a fraction of crown-to-chin. Lower is a
   *  higher, fuller beard -- but not much lower than 0.6: above that is the
   *  cheekbone, and a beard that starts there covers a man to the eyes. */
  readonly topT: number;
  /** How far the beard hangs below the chin, in face heights. */
  readonly drop: number;
  /** 0 is stubble -- texture only, no fill. 1 is solid with texture over it. */
  readonly fill: number;
}

const f = (
  id: string, moustache: boolean, chin: boolean, jaw: boolean, cheek: boolean,
  neck: boolean, topT: number, drop: number, fill: number,
): FacialHairStyle => ({ id, moustache, chin, jaw, cheek, neck, topT, drop, fill });

export const FACIAL_HAIR_STYLES: readonly FacialHairStyle[] = [
  f('clean', false, false, false, false, false, 0.695, 0, 0),
  f('stubble-light', true, true, true, true, false, 0.675, 0.004, 0.16),
  // Stubble has no fill at all. A flat wash over the lower face desaturates
  // it into a grey trapezoid with hard edges -- which is what stubble looked
  // like in the first pass, on every player who had any.
  f('stubble-heavy', true, true, true, true, true, 0.645, 0.006, 0.26),
  f('stubble-neck', true, true, true, true, true, 0.675, 0.006, 0.18),
  f('moustache', true, false, false, false, false, 0.775, 0, 0.9),
  f('mustache', true, false, false, false, false, 0.775, 0, 0.9),
  f('mustache-thick', true, false, false, false, false, 0.775, 0, 1),
  f('horseshoe', true, false, false, false, false, 0.775, 0.045, 1),
  f('soul-patch', false, true, false, false, false, 0.920, 0, 0.9),
  f('goatee', true, true, false, false, false, 0.855, 0.015, 0.95),
  f('goatee-circle', true, true, false, false, false, 0.835, 0.012, 0.95),
  f('van-dyke', true, true, false, false, false, 0.855, 0.022, 1),
  f('anchor', true, true, false, false, false, 0.875, 0.012, 1),
  f('balbo', true, true, true, false, false, 0.815, 0.012, 0.95),
  f('chin-beard', false, true, false, false, false, 0.895, 0.020, 0.95),
  f('chin-strap', false, true, true, true, false, 0.625, 0.004, 0.9),
  f('sideburns', false, false, false, true, false, 0.555, 0, 0.9),
  f('sideburns-long', false, false, false, true, false, 0.515, 0, 0.95),
  f('beard-patchy', true, true, true, true, false, 0.675, 0.014, 0.42),
  f('beard-disconnected', false, true, true, true, false, 0.655, 0.020, 0.9),
  f('beard-short', true, true, true, true, false, 0.655, 0.018, 0.9),
  f('beard-tapered', true, true, true, true, false, 0.635, 0.026, 0.95),
  f('beard-boxed', true, true, true, true, false, 0.655, 0.024, 1),
  f('beard-connected', true, true, true, true, true, 0.625, 0.030, 1),
  f('beard-medium', true, true, true, true, true, 0.605, 0.046, 1),
  f('beard-full', true, true, true, true, true, 0.575, 0.062, 1),
  f('beard-long', true, true, true, true, true, 0.555, 0.105, 1),
];

export const facialHairStyle = (id: string): FacialHairStyle =>
  FACIAL_HAIR_STYLES.find((s) => s.id === id) ?? (FACIAL_HAIR_STYLES[0] as FacialHairStyle);
