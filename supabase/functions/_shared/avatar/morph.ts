// The face as fifty-odd numbers.
//
// The first renderer read trait *names* and turned them into a handful of
// coordinates, which is why every player came out a variation of one template:
// thirty-five nose names collapsed into two curves, and two faces differed by
// a hash rather than by anatomy. This layer fixes that at the source. Every
// dimension the eye actually reads -- skull width, forehead height, temple
// width, cheekbone height, eye angle, lid heaviness, bridge height, tip
// projection, philtrum length, gonial flare, chin projection -- is its own
// continuous parameter, drawn from its own stream, and the renderer never sees
// a name at all.
//
// Two rules hold it to the existing system:
//
//   * every parameter comes from `streamFor(seed, 'm:<name>')`, so it is as
//     deterministic and as independently stable as the traits already were.
//     Adding a parameter later cannot move an existing one.
//   * the categorical traits still bite. A nose whose id says 'wide-flat' gets
//     pushed wide and flat rather than being ignored, so the identity the
//     league already stores is what you see -- only now you can see it.
//
// Morph is a *render-time derivation*, not identity. It reads age on purpose
// (a 37-year-old's cheeks hollow and his lids grow heavier); AvatarIdentity
// stays untouched and age-free, so the same man is still the same man.

import { streamFor } from './seed.ts';
import { BUILD_SHAPES } from './build.ts';
import type { AvatarProfile } from './profile.ts';

/** Every value is centred on 0 and clamped to [-1, 1] unless said otherwise.
 *  Zero is the population mean, not "unset". */
export interface FaceMorph {
  /* skull */
  readonly skullWidth: number;
  readonly skullLength: number;
  readonly crownRound: number;
  readonly foreheadHeight: number;
  readonly foreheadWidth: number;
  readonly foreheadSlope: number;
  readonly templeWidth: number;
  readonly browRidge: number;

  /* cheeks */
  readonly cheekboneWidth: number;
  readonly cheekboneHeight: number;
  readonly cheekFullness: number;

  /* eyes */
  readonly eyeWidth: number;
  readonly eyeHeight: number;
  readonly eyeSpacing: number;
  readonly eyeLine: number;
  readonly eyeAngle: number;
  readonly eyeDepth: number;
  readonly lidHeavy: number;
  readonly lidCrease: number;
  readonly lowerLid: number;

  /* brows */
  readonly browThickness: number;
  readonly browCurve: number;
  readonly browHeight: number;
  readonly browLength: number;
  readonly browTaper: number;

  /* nose */
  readonly bridgeWidth: number;
  readonly bridgeHeight: number;
  readonly noseLength: number;
  readonly noseProjection: number;
  readonly tipRound: number;
  readonly tipAngle: number;
  readonly nostrilWidth: number;
  readonly alarFlare: number;

  /* mouth */
  readonly mouthWidth: number;
  readonly upperLip: number;
  readonly lowerLip: number;
  readonly cupidBow: number;
  readonly philtrumLength: number;
  readonly mouthCorner: number;
  readonly lipProtrusion: number;

  /* jaw and chin */
  readonly jawWidth: number;
  readonly jawAngle: number;
  readonly jawLength: number;
  readonly gonialFlare: number;
  readonly chinWidth: number;
  readonly chinLength: number;
  readonly chinProjection: number;
  readonly chinCleft: number;

  /* ears */
  readonly earSize: number;
  readonly earLength: number;
  readonly earProtrusion: number;
  readonly earLobe: number;

  /* the small wrongnesses that make a face a face. Each is a signed nudge
   *  applied to one side only. */
  readonly asymEye: number;
  readonly asymBrow: number;
  readonly asymNose: number;
  readonly asymMouth: number;
  readonly asymJaw: number;

  /* below the collar */
  readonly neckWidth: number;
  readonly trapSize: number;
  readonly shoulderWidth: number;
}

const clamp = (v: number, lo = -1, hi = 1): number => Math.min(hi, Math.max(lo, v));

/**
 * A centred draw, bell-shaped.
 *
 * Three uniforms averaged: most faces sit near the population mean on any one
 * dimension and the extremes are rare, which is what keeps a league from
 * becoming a gallery of caricatures once fifty dimensions are all moving.
 */
function centred(seed: string, key: string): number {
  const rng = streamFor(seed, `m:${key}`);
  return ((rng.float() + rng.float() + rng.float()) / 3 - 0.5) * 2.4;
}

/** What a trait name says about one dimension. Every word that appears
 *  contributes, so 'wide-flat' gets both. */
function kw(id: string, table: Readonly<Record<string, number>>): number {
  let total = 0;
  for (const [word, delta] of Object.entries(table)) {
    if (id.includes(word)) total += delta;
  }
  return total;
}

/**
 * The whole face, as numbers.
 *
 * Read the body of this function as the bridge between the two systems: the
 * left-hand side of each line is a dimension the renderer draws, and the
 * right-hand side is a draw from the seed plus whatever the stored traits have
 * to say about it.
 */
export function faceMorph(profile: AvatarProfile): FaceMorph {
  const i = profile.identity;
  const a = profile.appearance;
  const build = BUILD_SHAPES[a.build];
  const c = (key: string): number => centred(profile.seed, key);

  // Age, as a signed amount. A rookie is at -1, a thirty-eight-year-old at +1,
  // and the curve is the wear the profile already carries rather than a second
  // opinion about how old he looks.
  const age = clamp(a.ageWear * 2 - 0.55);

  const head = i.baseHead;
  const face = i.faceShape;
  const nose = i.nose;
  const eyes = i.eyes;
  const lips = i.lips;
  const jaw = i.jaw;
  const chin = i.chin;
  const cheek = i.cheekbones;
  const brow = i.eyebrows;
  const ear = i.ears;

  const WIDE = { wide: 0.5, broad: 0.45, blocky: 0.4, squared: 0.3, barrel: 0.35, brachy: 0.5, full: 0.25 };
  const NARROW = { narrow: -0.5, fine: -0.35, tapered: -0.3, oblong: -0.4, long: -0.2, thin: -0.4 };

  return {
    /* ------------------------------------------------------------- skull -- */
    skullWidth: clamp(c('skullWidth') + kw(head, WIDE) + kw(head, NARROW)
      + (i.faceWidth - 0.5) * 1.2 + (build.fullness - 1) * 0.8),
    skullLength: clamp(c('skullLength') + kw(head, { tall: 0.5, long: 0.45, oblong: 0.5, short: -0.5, compact: -0.45, flat: -0.3 })
      + (i.faceLength - 0.5) * 1.2),
    crownRound: clamp(c('crownRound') + kw(head, { domed: 0.5, rounded: 0.4, bell: 0.3, flat: -0.5, squared: -0.4, keystone: -0.3 })),
    foreheadHeight: clamp(c('foreheadHeight') + kw(head, { tall: 0.35, high: 0.4, domed: 0.3, low: -0.4, flat: -0.2 })
      + kw(i.hairline, { high: 0.35, receded: 0.3, low: -0.35 })),
    foreheadWidth: clamp(c('foreheadWidth') + kw(head, WIDE) * 0.6 + kw(face, { heart: 0.35, diamond: -0.3, trapezoid: -0.25 })),
    foreheadSlope: clamp(c('foreheadSlope') + kw(head, { angular: 0.35, wedge: 0.4, domed: -0.4, rounded: -0.3 })),
    templeWidth: clamp(c('templeWidth') + kw(head, WIDE) * 0.5 + kw(face, { diamond: -0.4, heart: 0.3 })),
    browRidge: clamp(c('browRidge') + (i.browRidge - 0.5) * 1.4
      + kw(head, { angular: 0.3, blocky: 0.25, crested: 0.35 }) + age * 0.15),

    /* ------------------------------------------------------------ cheeks -- */
    cheekboneWidth: clamp(c('cheekboneWidth') + kw(cheek, { high: 0.3, wide: 0.5, broad: 0.45, prominent: 0.5, flat: -0.4, low: -0.3, subtle: -0.4 })),
    cheekboneHeight: clamp(c('cheekboneHeight') + kw(cheek, { high: 0.5, lifted: 0.4, low: -0.5, heavy: -0.3 })),
    // The one dimension age moves hardest: a face hollows out from about
    // thirty, and it is most of what separates a rookie from a veteran.
    cheekFullness: clamp(c('cheekFullness') + kw(cheek, { full: 0.45, soft: 0.3, hollow: -0.5, gaunt: -0.5, flat: -0.2 })
      + (build.fullness - 1) * 1.1 - age * 0.45),

    /* -------------------------------------------------------------- eyes -- */
    eyeWidth: clamp(c('eyeWidth') + kw(eyes, { wide: 0.45, large: 0.4, round: 0.2, narrow: -0.45, small: -0.4, slim: -0.35 })),
    eyeHeight: clamp(c('eyeHeight') + kw(eyes, { round: 0.5, large: 0.35, open: 0.3, narrow: -0.45, hooded: -0.35, slim: -0.3, almond: -0.1 })
      - age * 0.2),
    eyeSpacing: clamp(c('eyeSpacing') + (i.eyeSpacing - 0.5) * 1.4 + kw(eyes, { 'wide-set': 0.4, 'close-set': -0.4 })),
    eyeLine: clamp(c('eyeLine') * 0.7),
    eyeAngle: clamp(c('eyeAngle') + kw(eyes, { upturned: 0.55, 'up-': 0.4, downturned: -0.55, 'down-': -0.4 })),
    eyeDepth: clamp(c('eyeDepth') + (i.eyeDepth - 0.5) * 1.4 + kw(eyes, { deep: 0.45, 'set-back': 0.35, protruding: -0.4, prominent: -0.35 })),
    lidHeavy: clamp(c('lidHeavy') + kw(eyes, { hooded: 0.6, heavy: 0.5, monolid: 0.35, wide: -0.3, open: -0.35 }) + age * 0.35),
    lidCrease: clamp(c('lidCrease') + kw(eyes, { 'double-lid': 0.5, crease: 0.4, monolid: -0.7, epicanthic: -0.4, hooded: -0.25 })),
    lowerLid: clamp(c('lowerLid') + kw(eyes, { full: 0.4, puffy: 0.45 }) + age * 0.3),

    /* ------------------------------------------------------------- brows -- */
    browThickness: clamp(c('browThickness') + (i.eyebrowThickness - 0.5) * 1.5
      + kw(brow, { thick: 0.5, bushy: 0.6, heavy: 0.45, thin: -0.55, fine: -0.45, sparse: -0.4 })),
    browCurve: clamp(c('browCurve') + kw(brow, { arched: 0.6, rounded: 0.4, curved: 0.35, straight: -0.55, flat: -0.6, angled: 0.15 })),
    browHeight: clamp(c('browHeight') + kw(brow, { high: 0.45, lifted: 0.35, low: -0.45, heavy: -0.3 }) - age * 0.2),
    browLength: clamp(c('browLength') + kw(brow, { long: 0.4, full: 0.3, short: -0.45, cropped: -0.35 })),
    browTaper: clamp(c('browTaper') + kw(brow, { tapered: 0.5, 'even': -0.4 })),

    /* -------------------------------------------------------------- nose -- */
    bridgeWidth: clamp(c('bridgeWidth') + (i.noseWidth - 0.5) * 1.1
      + kw(nose, { wide: 0.45, broad: 0.5, flat: 0.3, narrow: -0.5, fine: -0.4, thin: -0.45 })),
    bridgeHeight: clamp(c('bridgeHeight') + kw(nose, { 'high-bridge': 0.6, aquiline: 0.5, roman: 0.45, convex: 0.4, hooked: 0.5, flat: -0.55, 'low-bridge': -0.6, concave: -0.45, scooped: -0.4, snub: -0.35 })),
    noseLength: clamp(c('noseLength') + kw(nose, { long: 0.5, droop: 0.3, short: -0.5, button: -0.45, snub: -0.4 }) + age * 0.2),
    noseProjection: clamp(c('noseProjection') + kw(nose, { prominent: 0.5, aquiline: 0.35, roman: 0.3, flat: -0.5, 'wide-flat': -0.45 })),
    tipRound: clamp(c('tipRound') + kw(nose, { bulbous: 0.6, rounded: 0.45, button: 0.4, pointed: -0.55, fine: -0.4, sharp: -0.5 })),
    tipAngle: clamp(c('tipAngle') + kw(nose, { upturned: 0.6, snub: 0.45, droop: -0.5, hooked: -0.55, 'down-': -0.4 }) - age * 0.25),
    nostrilWidth: clamp(c('nostrilWidth') + (i.noseWidth - 0.5) * 1.2
      + kw(nose, { wide: 0.5, flared: 0.55, broad: 0.45, narrow: -0.5, fine: -0.4 })),
    alarFlare: clamp(c('alarFlare') + kw(nose, { flared: 0.6, wide: 0.35, 'wide-rounded': 0.4, narrow: -0.45, fine: -0.35 })),

    /* ------------------------------------------------------------- mouth -- */
    mouthWidth: clamp(c('mouthWidth') + kw(lips, { wide: 0.5, broad: 0.4, narrow: -0.5, small: -0.45 })),
    upperLip: clamp(c('upperLip') + (i.lipFullness - 0.5) * 1.3
      + kw(lips, { full: 0.45, everted: 0.55, thin: -0.55, fine: -0.4 }) - age * 0.25),
    lowerLip: clamp(c('lowerLip') + (i.lipFullness - 0.5) * 1.3
      + kw(lips, { full: 0.5, everted: 0.55, round: 0.35, thin: -0.5 }) - age * 0.2),
    cupidBow: clamp(c('cupidBow') + kw(lips, { defined: 0.5, bow: 0.55, even: -0.35, flat: -0.45 })),
    philtrumLength: clamp(c('philtrumLength') + age * 0.3),
    mouthCorner: clamp(c('mouthCorner') * 0.8 - age * 0.25),
    lipProtrusion: clamp(c('lipProtrusion') + kw(lips, { everted: 0.6, full: 0.3, thin: -0.3 })),

    /* ------------------------------------------------------- jaw and chin -- */
    jawWidth: clamp(c('jawWidth') + kw(jaw, { wide: 0.5, broad: 0.5, square: 0.4, heavy: 0.45, narrow: -0.5, tapered: -0.45, fine: -0.4 })
      + (build.fullness - 1) * 0.9),
    jawAngle: clamp(c('jawAngle') + kw(jaw, { square: 0.6, angular: 0.5, blocky: 0.45, tapered: -0.55, rounded: -0.45, oval: -0.4 })),
    jawLength: clamp(c('jawLength') + kw(jaw, { long: 0.45, deep: 0.35, short: -0.45 })),
    gonialFlare: clamp(c('gonialFlare') + kw(jaw, { flared: 0.6, square: 0.35, heavy: 0.3, tapered: -0.5 })),
    chinWidth: clamp(c('chinWidth') + kw(chin, { wide: 0.5, broad: 0.45, square: 0.4, narrow: -0.5, pointed: -0.55, tapered: -0.4 })),
    chinLength: clamp(c('chinLength') + kw(chin, { long: 0.5, deep: 0.35, short: -0.45, receding: -0.3 })),
    chinProjection: clamp(c('chinProjection') + kw(chin, { prominent: 0.55, jutting: 0.6, strong: 0.4, receding: -0.6, weak: -0.5 })),
    chinCleft: clamp(c('chinCleft') + kw(chin, { cleft: 0.9, dimpled: 0.7 }) - 0.35),

    /* -------------------------------------------------------------- ears -- */
    earSize: clamp(c('earSize') + kw(ear, { large: 0.5, big: 0.5, small: -0.5 })),
    earLength: clamp(c('earLength') + kw(ear, { long: 0.5, short: -0.45 }) + age * 0.3),
    earProtrusion: clamp(c('earProtrusion') + (i.earProtrusion - 0.5) * 1.4
      + kw(ear, { protruding: 0.6, flat: -0.5, pinned: -0.6 })),
    earLobe: clamp(c('earLobe') + kw(ear, { attached: -0.6, free: 0.4, 'long-lobe': 0.5 })),

    /* -------------------------------------------------------- asymmetry -- */
    // Small on purpose. A face nobody would call crooked still is not
    // mirror-symmetrical, and rendering one that is reads as a mask.
    asymEye: c('asymEye') * 0.55,
    asymBrow: c('asymBrow') * 0.7,
    asymNose: c('asymNose') * 0.45,
    asymMouth: c('asymMouth') * 0.6,
    asymJaw: c('asymJaw') * 0.4,

    /* ------------------------------------------------------ below the collar */
    neckWidth: clamp((build.neck - 1) * 2.6 + c('neckWidth') * 0.3),
    trapSize: clamp((build.shoulders - 1) * 2.4 + c('trapSize') * 0.35),
    shoulderWidth: clamp((build.shoulders - 1) * 2.8 + c('shoulderWidth') * 0.25),
  };
}
