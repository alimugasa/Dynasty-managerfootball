// What a face is made of.
//
// The request is explicit that this must not be a handful of racial presets,
// and the way to guarantee that is structural rather than editorial: no trait
// in this file knows anything about ancestry. A nose is a nose. Ancestry
// shifts how likely each one is (ancestry.ts) and nothing else, so a nose that
// is common in one population is never unavailable to another.
//
// Every trait is a named option with a weight. The weight is the *baseline*
// frequency across the whole league before any ancestry influence, and it
// exists so that unusual features stay unusual: a face library where every
// option is equally likely produces a league where a third of players have a
// feature that one person in fifty has, which reads as noise rather than as
// variety.

/** One option in a trait's library. */
export interface TraitOption {
  readonly id: string;
  readonly label: string;
  /** Baseline frequency, before ancestry. Relative, not a percentage. */
  readonly weight: number;
}

const opt = (id: string, label: string, weight = 1): TraitOption => ({ id, label, weight });

/* ----------------------------------------------------------- the skull ---- */

/**
 * Foundational head structures.
 *
 * The layer everything else sits on: two players with the same base head and
 * different features still read as different people, and two with different
 * base heads read as different people even before the features are drawn.
 * Named descriptively rather than by population, on purpose.
 */
export const BASE_HEADS: readonly TraitOption[] = [
  'ovoid', 'ovoid-tall', 'ovoid-broad', 'domed', 'domed-narrow', 'domed-wide',
  'blocky', 'blocky-tall', 'blocky-compact', 'tapered', 'tapered-long',
  'tapered-short', 'angular', 'angular-broad', 'angular-fine', 'rounded',
  'rounded-high', 'rounded-flat', 'squared', 'squared-soft', 'squared-heavy',
  'diamond', 'diamond-soft', 'heart', 'heart-broad', 'oblong', 'oblong-narrow',
  'pentagonal', 'pentagonal-soft', 'trapezoid', 'trapezoid-inverted',
  'barrel', 'barrel-high', 'wedge', 'wedge-soft', 'bell', 'bell-narrow',
  'keystone', 'keystone-wide', 'lantern', 'lantern-fine', 'crested',
  'crested-low', 'flat-backed', 'occipital-full', 'brachy', 'brachy-wide',
  'dolicho', 'dolicho-fine', 'meso', 'meso-broad', 'meso-tall',
].map((id, i) => opt(id, id.replace(/-/g, ' '), i < 12 ? 3 : 2));

export const FACE_SHAPES: readonly TraitOption[] = [
  opt('oval', 'Oval', 5), opt('round', 'Round', 4), opt('square', 'Square', 4),
  opt('rectangular', 'Rectangular', 3), opt('heart', 'Heart', 3),
  opt('diamond', 'Diamond', 2), opt('triangular', 'Triangular', 2),
  opt('inverted-triangle', 'Inverted triangle', 2), opt('oblong', 'Oblong', 3),
  opt('pear', 'Pear', 2), opt('trapezoid', 'Trapezoid', 2),
  opt('long-oval', 'Long oval', 3), opt('broad-oval', 'Broad oval', 3),
  opt('angular-square', 'Angular square', 2), opt('soft-square', 'Soft square', 3),
  opt('tapered-oval', 'Tapered oval', 2),
];

export const JAW_SHAPES: readonly TraitOption[] = [
  opt('square', 'Square', 4), opt('rounded', 'Rounded', 4),
  opt('tapered', 'Tapered', 3), opt('angular', 'Angular', 3),
  opt('wide-square', 'Wide square', 3), opt('narrow-tapered', 'Narrow tapered', 2),
  opt('heavy', 'Heavy', 2), opt('defined', 'Defined', 3),
  opt('soft', 'Soft', 3), opt('v-line', 'V-line', 2),
  opt('u-line', 'U-line', 2), opt('broad-flat', 'Broad flat', 2),
  opt('hinged', 'Hinged', 2), opt('sloped', 'Sloped', 2),
  opt('gonial-flared', 'Flared', 2),
];

export const CHIN_SHAPES: readonly TraitOption[] = [
  opt('rounded', 'Rounded', 4), opt('square', 'Square', 4),
  opt('pointed', 'Pointed', 3), opt('cleft', 'Cleft', 2),
  opt('broad', 'Broad', 3), opt('narrow', 'Narrow', 3),
  opt('receding', 'Receding', 2), opt('protruding', 'Protruding', 2),
  opt('flat', 'Flat', 2), opt('dimpled', 'Dimpled', 2),
  opt('tapered', 'Tapered', 2), opt('heavy', 'Heavy', 2),
];

export const CHEEKBONES: readonly TraitOption[] = [
  opt('high-prominent', 'High and prominent', 3), opt('high-subtle', 'High and subtle', 3),
  opt('wide-flat', 'Wide and flat', 3), opt('wide-full', 'Wide and full', 3),
  opt('low-set', 'Low set', 2), opt('angular', 'Angular', 3),
  opt('rounded', 'Rounded', 3), opt('hollow', 'Hollow', 2),
  opt('full', 'Full', 3), opt('narrow', 'Narrow', 2),
  opt('shelf', 'Shelf', 2), opt('sloped', 'Sloped', 2),
  opt('broad-high', 'Broad and high', 2), opt('fine', 'Fine', 2),
  opt('squared', 'Squared', 2),
];

/* ------------------------------------------------------------ features ---- */

export const NOSE_SHAPES: readonly TraitOption[] = [
  'straight', 'straight-narrow', 'straight-broad', 'aquiline', 'aquiline-fine',
  'roman', 'roman-heavy', 'snub', 'snub-wide', 'button', 'upturned',
  'upturned-broad', 'downturned', 'hooked', 'hooked-soft', 'bulbous',
  'bulbous-wide', 'flared', 'flared-flat', 'wide-flat', 'wide-rounded',
  'narrow-high', 'narrow-low', 'broad-bridge', 'low-bridge', 'high-bridge',
  'convex', 'concave', 'sloped', 'boxer', 'boxer-flat', 'fleshy',
  'tapered', 'columnar', 'arched',
].map((id, i) => opt(id, id.replace(/-/g, ' '), i < 10 ? 3 : 2));

export const EYE_SHAPES: readonly TraitOption[] = [
  'almond', 'almond-wide', 'almond-narrow', 'round', 'round-large',
  'hooded', 'hooded-heavy', 'monolid', 'monolid-soft', 'double-lid',
  'upturned', 'downturned', 'deep-set', 'deep-set-narrow', 'protruding',
  'wide-set-round', 'close-set-almond', 'narrow', 'narrow-long', 'oval',
  'oval-wide', 'tapered', 'tapered-fine', 'heavy-lidded', 'soft-almond',
  'angular', 'slanted-up', 'slanted-down', 'epicanthic', 'epicanthic-partial',
].map((id, i) => opt(id, id.replace(/-/g, ' '), i < 10 ? 3 : 2));

export const EYEBROW_SHAPES: readonly TraitOption[] = [
  'straight', 'straight-low', 'arched', 'arched-high', 'soft-arch',
  'angled', 'angled-sharp', 'rounded', 'tapered', 'tapered-long',
  'thick-straight', 'thick-arched', 'thin-arched', 'flat-wide', 's-curve',
  'peaked', 'peaked-soft', 'short-straight', 'sloped-down', 'feathered',
].map((id, i) => opt(id, id.replace(/-/g, ' '), i < 8 ? 3 : 2));

export const LIP_SHAPES: readonly TraitOption[] = [
  'full-even', 'full-wide', 'full-heart', 'full-round', 'medium-even',
  'medium-wide', 'medium-bowed', 'thin-even', 'thin-wide', 'thin-flat',
  'top-heavy', 'bottom-heavy', 'bow-pronounced', 'bow-soft', 'bow-flat',
  'downturned', 'upturned', 'wide-flat', 'narrow-full', 'narrow-thin',
  'defined-edge', 'soft-edge', 'everted', 'compressed', 'asymmetric',
].map((id, i) => opt(id, id.replace(/-/g, ' '), i < 10 ? 3 : 2));

export const EAR_SHAPES: readonly TraitOption[] = [
  opt('attached', 'Attached lobe', 4), opt('detached', 'Detached lobe', 4),
  opt('pointed', 'Pointed', 2), opt('round', 'Round', 3),
  opt('broad', 'Broad', 3), opt('narrow', 'Narrow', 3),
  opt('protruding', 'Protruding', 3), opt('flat', 'Close to head', 3),
  opt('lobed-heavy', 'Heavy lobe', 2), opt('lobed-fine', 'Fine lobe', 2),
  opt('shell', 'Shell', 2), opt('folded', 'Folded helix', 2),
  opt('cauliflower', 'Cauliflower', 1), opt('square', 'Square', 2),
  opt('tapered', 'Tapered', 2),
];

export const HAIRLINES: readonly TraitOption[] = [
  opt('straight', 'Straight', 4), opt('rounded', 'Rounded', 4),
  opt('widows-peak', "Widow's peak", 3), opt('m-shape', 'M-shape', 3),
  opt('receding-slight', 'Slightly receding', 3), opt('receding-mid', 'Receding', 2),
  opt('receding-deep', 'Deeply receding', 2), opt('high', 'High', 3),
  opt('low', 'Low', 3), opt('uneven', 'Uneven', 2),
  opt('square', 'Square', 3), opt('temple-notched', 'Notched temples', 2),
  opt('bell', 'Bell', 2), opt('triangular', 'Triangular', 2),
  opt('crown-thinning', 'Thinning crown', 2), opt('horseshoe', 'Horseshoe', 1),
  opt('island', 'Island', 1), opt('juvenile', 'Juvenile', 2),
];

export const EYE_COLORS: readonly TraitOption[] = [
  opt('dark-brown', 'Dark brown', 10), opt('brown', 'Brown', 9),
  opt('light-brown', 'Light brown', 5), opt('hazel', 'Hazel', 4),
  opt('amber', 'Amber', 2), opt('green', 'Green', 2),
  opt('blue', 'Blue', 3), opt('grey-blue', 'Grey blue', 2),
  opt('grey', 'Grey', 1), opt('heterochromic', 'Heterochromic', 1),
];

/** Complexion detail overlays. Sparse on purpose: a league where everybody has
 *  something is a league where nothing reads as a marking. */
export const COMPLEXION_DETAILS: readonly TraitOption[] = [
  opt('none', 'None', 40), opt('freckles-light', 'Light freckles', 4),
  opt('freckles-heavy', 'Heavy freckles', 2), opt('freckles-cheeks', 'Freckled cheeks', 3),
  opt('sun-weathered', 'Weathered', 3), opt('ruddy', 'Ruddy', 3),
  opt('even', 'Very even', 5), opt('uneven-tone', 'Uneven tone', 3),
  opt('acne-scarring', 'Acne scarring', 2), opt('mole-cheek', 'Cheek mole', 3),
  opt('mole-lip', 'Lip mole', 2), opt('mole-brow', 'Brow mole', 2),
  opt('birthmark-temple', 'Temple birthmark', 1), opt('scar-brow', 'Brow scar', 2),
  opt('scar-cheek', 'Cheek scar', 1), opt('scar-lip', 'Lip scar', 1),
  opt('scar-chin', 'Chin scar', 1), opt('vitiligo-patch', 'Vitiligo', 1),
  opt('dimples', 'Dimples', 3), opt('cleft-philtrum', 'Deep philtrum', 2),
  opt('under-eye-shadow', 'Deep under-eye', 3), opt('dry-skin', 'Dry skin', 2),
];

export const EXPRESSIONS: readonly TraitOption[] = [
  opt('neutral', 'Neutral', 8), opt('focused', 'Focused', 5),
  opt('confident', 'Confident', 4), opt('intense', 'Intense', 3),
  opt('relaxed', 'Relaxed', 3),
];

export const ACCESSORIES: readonly TraitOption[] = [
  opt('none', 'None', 30), opt('eye-black', 'Eye black', 4),
  opt('headband', 'Headband', 3), opt('skull-cap', 'Skull cap', 2),
  opt('earrings', 'Earrings', 4), opt('chain', 'Chain', 3),
  opt('nose-stud', 'Nose stud', 1), opt('tape-bridge', 'Nose tape', 1),
];
