// Hair, which is where most of the variation a person actually notices lives.
//
// Texture and style are separate properties, as the request requires, and that
// separation is the thing that makes the library multiply rather than add: 100
// styles times a dozen textures is not 112 looks, it is most of a league.
//
// Not every pairing is real, though, and the compatibility rule below is the
// smallest one that stops the obvious nonsense without becoming a cage. A
// commissioner who wants an unusual combination should be able to set it; what
// the *generator* must not do is roll it by accident on a hundred players.

export interface HairOption {
  readonly id: string;
  readonly label: string;
  readonly weight: number;
  /** Which textures this style is actually worn in. Empty means any. */
  readonly textures?: readonly string[];
  /** Roughly how long, for the renderer and for age rules. */
  readonly length: 'none' | 'short' | 'medium' | 'long';
}

export const HAIR_TEXTURES = [
  'straight-fine', 'straight-medium', 'straight-coarse',
  'wavy-loose', 'wavy-medium', 'wavy-tight',
  'curly-loose', 'curly-medium', 'curly-tight',
  'coily-soft', 'coily-medium', 'coily-tight',
  'kinky-medium', 'kinky-tight',
] as const;
export type HairTexture = (typeof HAIR_TEXTURES)[number];

/** The families a texture belongs to, which is what style compatibility is
 *  actually expressed in. */
export function textureFamily(texture: string): 'straight' | 'wavy' | 'curly' | 'coily' {
  if (texture.startsWith('straight')) return 'straight';
  if (texture.startsWith('wavy')) return 'wavy';
  if (texture.startsWith('curly')) return 'curly';
  return 'coily';
}

const h = (
  id: string, label: string, length: HairOption['length'], weight: number,
  textures?: readonly string[],
): HairOption => ({ id, label, length, weight, ...(textures === undefined ? {} : { textures }) });

export const HAIRSTYLES: readonly HairOption[] = [
  // Shortest first. These carry high weights because a football roster is
  // mostly short hair, and a league where everyone has a statement cut reads
  // as a costume party.
  h('bald', 'Bald', 'none', 6),
  h('shaved', 'Shaved', 'none', 6),
  h('buzz', 'Buzz cut', 'short', 9),
  h('buzz-faded', 'Faded buzz', 'short', 7),
  h('caesar', 'Caesar', 'short', 3),
  h('crew', 'Crew cut', 'short', 5),
  h('fade-low', 'Low fade', 'short', 8),
  h('fade-mid', 'Mid fade', 'short', 8),
  h('fade-high', 'High fade', 'short', 6),
  h('fade-skin', 'Skin fade', 'short', 5),
  h('fade-burst', 'Burst fade', 'short', 3),
  h('fade-drop', 'Drop fade', 'short', 3),
  h('taper', 'Taper', 'short', 6),
  h('taper-line', 'Taper with line', 'short', 3),
  h('waves', 'Waves', 'short', 6, ['coily', 'curly']),
  h('waves-deep', 'Deep waves', 'short', 4, ['coily', 'curly']),
  h('sponge', 'Sponge curls', 'short', 3, ['coily']),
  h('short-curls', 'Short curls', 'short', 6, ['curly', 'coily']),
  h('textured-crop', 'Textured crop', 'short', 5, ['straight', 'wavy', 'curly']),
  h('french-crop', 'French crop', 'short', 3, ['straight', 'wavy']),
  h('ivy', 'Ivy league', 'short', 2, ['straight', 'wavy']),
  h('side-part-short', 'Short side part', 'short', 4, ['straight', 'wavy']),
  h('comb-over', 'Comb over', 'short', 2, ['straight', 'wavy']),
  h('flat-top', 'Flat top', 'short', 2, ['coily']),
  h('high-top', 'High top', 'medium', 3, ['coily', 'curly']),
  h('afro-short', 'Short afro', 'short', 5, ['coily', 'curly']),
  h('afro-medium', 'Afro', 'medium', 4, ['coily', 'curly']),
  h('afro-full', 'Full afro', 'long', 2, ['coily']),
  h('twists-short', 'Short twists', 'short', 4, ['coily', 'curly']),
  h('twists-medium', 'Twists', 'medium', 4, ['coily', 'curly']),
  h('twists-long', 'Long twists', 'long', 2, ['coily']),
  h('locs-short', 'Short locs', 'short', 3, ['coily', 'curly']),
  h('locs-medium', 'Locs', 'medium', 4, ['coily', 'curly']),
  h('locs-long', 'Long locs', 'long', 3, ['coily']),
  h('locs-tied', 'Tied locs', 'long', 2, ['coily']),
  h('braids-back', 'Braids', 'medium', 4, ['coily', 'curly']),
  h('braids-long', 'Long braids', 'long', 2, ['coily']),
  h('cornrows-straight', 'Cornrows', 'short', 5, ['coily', 'curly']),
  h('cornrows-zigzag', 'Zigzag cornrows', 'short', 3, ['coily']),
  h('cornrows-parted', 'Parted cornrows', 'short', 3, ['coily']),
  h('curls-medium', 'Medium curls', 'medium', 5, ['curly', 'wavy']),
  h('curls-loose', 'Loose curls', 'medium', 4, ['curly', 'wavy']),
  h('curtains', 'Curtains', 'medium', 2, ['straight', 'wavy']),
  h('slick-back', 'Slicked back', 'medium', 4, ['straight', 'wavy']),
  h('pompadour', 'Pompadour', 'medium', 2, ['straight', 'wavy']),
  h('quiff', 'Quiff', 'medium', 3, ['straight', 'wavy']),
  h('side-part-medium', 'Side part', 'medium', 4, ['straight', 'wavy']),
  h('messy-medium', 'Messy', 'medium', 4),
  h('shag', 'Shag', 'medium', 2, ['straight', 'wavy']),
  h('mullet', 'Mullet', 'medium', 2, ['straight', 'wavy']),
  h('mullet-modern', 'Modern mullet', 'medium', 2),
  h('long-straight', 'Long straight', 'long', 3, ['straight', 'wavy']),
  h('long-wavy', 'Long wavy', 'long', 3, ['wavy', 'curly']),
  h('long-curly', 'Long curly', 'long', 2, ['curly', 'coily']),
  h('man-bun', 'Bun', 'long', 2),
  h('ponytail', 'Ponytail', 'long', 2),
  h('top-knot', 'Top knot', 'long', 2),
  h('undercut-long', 'Long undercut', 'medium', 2),
  h('undercut-short', 'Undercut', 'short', 3),
  h('bowl', 'Bowl', 'short', 1, ['straight']),
  h('receding-short', 'Short over receding', 'short', 3),
  h('horseshoe-shaved', 'Shaved horseshoe', 'none', 2),
];

/** Natural and dyed. Dyed carries a low weight because a bleached head should
 *  be a thing you notice. */
export const HAIR_COLORS: readonly { id: string; label: string; hex: string; weight: number }[] = [
  { id: 'black', label: 'Black', hex: '#14100e', weight: 16 },
  { id: 'off-black', label: 'Off black', hex: '#1d1714', weight: 10 },
  { id: 'dark-brown', label: 'Dark brown', hex: '#2c1e16', weight: 10 },
  { id: 'brown', label: 'Brown', hex: '#4a3122', weight: 7 },
  { id: 'light-brown', label: 'Light brown', hex: '#6b4a2f', weight: 4 },
  { id: 'auburn', label: 'Auburn', hex: '#6a3120', weight: 2 },
  { id: 'red', label: 'Red', hex: '#8a3b18', weight: 1 },
  { id: 'dark-blonde', label: 'Dark blonde', hex: '#8a6a3c', weight: 3 },
  { id: 'blonde', label: 'Blonde', hex: '#b99358', weight: 3 },
  { id: 'light-blonde', label: 'Light blonde', hex: '#d4b47a', weight: 2 },
  { id: 'platinum', label: 'Platinum', hex: '#ddd2bb', weight: 1 },
  { id: 'bleached', label: 'Bleached', hex: '#e8dcc0', weight: 2 },
  { id: 'salt-pepper', label: 'Salt and pepper', hex: '#575149', weight: 2 },
  { id: 'grey', label: 'Grey', hex: '#8b8681', weight: 1 },
  { id: 'white', label: 'White', hex: '#c9c5c0', weight: 1 },
  { id: 'dyed-blond-tips', label: 'Blond tips', hex: '#c8a262', weight: 1 },
  { id: 'dyed-copper', label: 'Copper', hex: '#9c4a1e', weight: 1 },
];

/**
 * Whether a style can be worn in a texture.
 *
 * Deliberately permissive: the only pairings excluded are the ones that are not
 * a haircut at all in that texture. Everything a real person could walk in with
 * is allowed, because a compatibility table written tightly enough to be
 * "correct" is a table that quietly narrows the league.
 */
export function hairFits(style: HairOption, texture: string): boolean {
  if (style.textures === undefined) return true;
  return style.textures.includes(textureFamily(texture));
}

export const FACIAL_HAIR: readonly { id: string; label: string; weight: number }[] = [
  { id: 'clean', label: 'Clean shaven', weight: 14 },
  { id: 'stubble-light', label: 'Light stubble', weight: 11 },
  { id: 'stubble-heavy', label: 'Heavy stubble', weight: 9 },
  { id: 'mustache', label: 'Mustache', weight: 3 },
  { id: 'mustache-thick', label: 'Thick mustache', weight: 2 },
  { id: 'goatee', label: 'Goatee', weight: 5 },
  { id: 'goatee-circle', label: 'Circle beard', weight: 4 },
  { id: 'chin-strap', label: 'Chin strap', weight: 3 },
  { id: 'chin-beard', label: 'Chin beard', weight: 3 },
  { id: 'soul-patch', label: 'Soul patch', weight: 1 },
  { id: 'beard-short', label: 'Short beard', weight: 7 },
  { id: 'beard-medium', label: 'Medium beard', weight: 5 },
  { id: 'beard-full', label: 'Full beard', weight: 4 },
  { id: 'beard-long', label: 'Long beard', weight: 1 },
  { id: 'beard-connected', label: 'Connected beard', weight: 5 },
  { id: 'beard-disconnected', label: 'Disconnected beard', weight: 3 },
  { id: 'beard-patchy', label: 'Patchy beard', weight: 2 },
  { id: 'sideburns', label: 'Sideburns', weight: 2 },
  { id: 'sideburns-long', label: 'Long sideburns', weight: 1 },
  { id: 'anchor', label: 'Anchor', weight: 1 },
  { id: 'van-dyke', label: 'Van dyke', weight: 1 },
  { id: 'horseshoe', label: 'Horseshoe', weight: 1 },
  { id: 'balbo', label: 'Balbo', weight: 1 },
  { id: 'stubble-neck', label: 'Neck stubble', weight: 2 },
  { id: 'beard-boxed', label: 'Boxed beard', weight: 3 },
  { id: 'beard-tapered', label: 'Tapered beard', weight: 3 },
];

export const FACIAL_HAIR_DENSITY = ['sparse', 'light', 'medium', 'thick', 'dense'] as const;
export type FacialHairDensity = (typeof FACIAL_HAIR_DENSITY)[number];
