// Ancestry as a thumb on the scale, never as a template.
//
// This is the part of the system most likely to go wrong, and it goes wrong in
// a specific way: someone writes "West African face" as a bundle of features,
// and the league ends up with nine kinds of person. The request forbids it and
// so does the design here, structurally -- an ancestry never *selects* a trait.
// It multiplies weights.
//
// Three consequences follow from that and all three are the point:
//
//   * every trait remains available to every player. A nose that is common in
//     one population is merely less likely elsewhere, not absent.
//   * two players with the same ancestry usually look nothing alike, because
//     the distribution is still a distribution.
//   * mixed ancestry is blended weights rather than a third template, so a
//     player with two influences is not pushed toward an average of them.
//
// One more thing this file deliberately does not do: it never reads a
// nationality. This game stores none -- there is no birthplace, no country, no
// demographic column anywhere in the schema -- so ancestry here is part of a
// fictional identity rather than a claim about where somebody is from. When
// the game does store that, it feeds in through `heritageFor` and nothing else
// changes.

export const ANCESTRIES = [
  'west-african', 'central-african', 'east-african', 'horn-of-africa',
  'southern-african', 'african-american', 'afro-caribbean',
  'northern-european', 'western-european', 'southern-european',
  'eastern-european', 'middle-eastern', 'north-african',
  'south-asian', 'east-asian', 'southeast-asian', 'pacific-islander',
  'indigenous-american', 'latin-american',
] as const;
export type Ancestry = (typeof ANCESTRIES)[number];

export const ANCESTRY_LABEL: Readonly<Record<Ancestry, string>> = {
  'west-african': 'West African',
  'central-african': 'Central African',
  'east-african': 'East African',
  'horn-of-africa': 'Horn of Africa',
  'southern-african': 'Southern African',
  'african-american': 'African-American',
  'afro-caribbean': 'Afro-Caribbean',
  'northern-european': 'Northern European',
  'western-european': 'Western European',
  'southern-european': 'Southern European',
  'eastern-european': 'Eastern European',
  'middle-eastern': 'Middle Eastern',
  'north-african': 'North African',
  'south-asian': 'South Asian',
  'east-asian': 'East Asian',
  'southeast-asian': 'Southeast Asian',
  'pacific-islander': 'Pacific Islander',
  'indigenous-american': 'Indigenous American',
  'latin-american': 'Latin American',
};

/**
 * What an ancestry influences.
 *
 * `skin` is the centre and spread of a normal-ish distribution over the 36
 * pigmentation steps -- a centre, not a value, because the spread is what
 * keeps a population a population. The rest are weight multipliers applied to
 * the baseline libraries, and anything not named here is simply unchanged.
 *
 * The multipliers are modest by design. A 3x nudge changes what is common; a
 * 50x nudge is a template wearing a probability's clothes.
 */
export interface AncestryProfile {
  /** Centre of the pigmentation distribution, 0-35. */
  readonly skinCentre: number;
  /** How wide the spread is. Large numbers are populations that vary a lot. */
  readonly skinSpread: number;
  readonly undertones: Readonly<Partial<Record<string, number>>>;
  readonly hairTextures: Readonly<Partial<Record<string, number>>>;
  readonly hairColors: Readonly<Partial<Record<string, number>>>;
  readonly eyeColors: Readonly<Partial<Record<string, number>>>;
  /** Trait-id multipliers, by library. */
  readonly noses?: Readonly<Partial<Record<string, number>>>;
  readonly eyes?: Readonly<Partial<Record<string, number>>>;
  readonly lips?: Readonly<Partial<Record<string, number>>>;
}

const coily = { 'coily-soft': 3, 'coily-medium': 4, 'coily-tight': 4, 'kinky-medium': 3, 'kinky-tight': 3 };
const straight = { 'straight-fine': 4, 'straight-medium': 4, 'straight-coarse': 3 };
const wavyCurly = { 'wavy-loose': 3, 'wavy-medium': 3, 'curly-loose': 3, 'curly-medium': 2 };
const darkHair = { black: 4, 'off-black': 3, 'dark-brown': 2 };
const darkEyes = { 'dark-brown': 4, brown: 3 };

export const ANCESTRY_PROFILES: Readonly<Record<Ancestry, AncestryProfile>> = {
  'west-african': {
    skinCentre: 6, skinSpread: 6,
    undertones: { warm: 3, neutral: 2, olive: 1 },
    hairTextures: coily, hairColors: darkHair, eyeColors: darkEyes,
    noses: { flared: 3, 'flared-flat': 3, 'wide-flat': 3, 'wide-rounded': 2, 'broad-bridge': 2 },
    lips: { 'full-even': 3, 'full-wide': 3, 'full-round': 2, everted: 2 },
  },
  'central-african': {
    skinCentre: 5, skinSpread: 6, undertones: { warm: 3, neutral: 2 },
    hairTextures: coily, hairColors: darkHair, eyeColors: darkEyes,
    noses: { flared: 3, 'wide-flat': 3, 'broad-bridge': 2 },
    lips: { 'full-even': 3, 'full-wide': 2 },
  },
  'east-african': {
    skinCentre: 9, skinSpread: 7, undertones: { warm: 3, neutral: 2, olive: 2 },
    hairTextures: { ...coily, 'curly-tight': 2 }, hairColors: darkHair, eyeColors: darkEyes,
    noses: { 'narrow-high': 3, straight: 2, 'straight-narrow': 2, aquiline: 2 },
    lips: { 'medium-even': 2, 'full-even': 2 },
  },
  'horn-of-africa': {
    skinCentre: 11, skinSpread: 7, undertones: { warm: 3, olive: 2, neutral: 2 },
    hairTextures: { 'curly-medium': 3, 'curly-tight': 3, 'coily-soft': 3 },
    hairColors: darkHair, eyeColors: { ...darkEyes, hazel: 2 },
    noses: { 'narrow-high': 3, 'straight-narrow': 3, aquiline: 2, 'high-bridge': 2 },
    lips: { 'medium-even': 2, 'medium-bowed': 2 },
  },
  'southern-african': {
    skinCentre: 8, skinSpread: 7, undertones: { warm: 2, neutral: 2, olive: 2 },
    hairTextures: coily, hairColors: darkHair, eyeColors: darkEyes,
    noses: { 'wide-flat': 2, flared: 2, snub: 2 },
    eyes: { 'epicanthic-partial': 2, almond: 2 },
  },
  // The diaspora profiles are wide on purpose. A population formed by
  // centuries of mixing has more internal variation than any single origin
  // population, and a narrow distribution here would be the most visible lie
  // in the whole system.
  'african-american': {
    skinCentre: 11, skinSpread: 9, undertones: { warm: 3, neutral: 2, olive: 1 },
    hairTextures: { ...coily, 'curly-medium': 2, 'curly-tight': 2 },
    hairColors: darkHair, eyeColors: { ...darkEyes, hazel: 2, 'light-brown': 2 },
    noses: { flared: 2, 'wide-rounded': 2, 'broad-bridge': 2, straight: 2 },
    lips: { 'full-even': 3, 'full-wide': 2, 'medium-even': 2 },
  },
  'afro-caribbean': {
    skinCentre: 10, skinSpread: 9, undertones: { warm: 3, neutral: 2, olive: 2 },
    hairTextures: { ...coily, 'curly-medium': 3 },
    hairColors: darkHair, eyeColors: { ...darkEyes, hazel: 2 },
    noses: { flared: 2, 'wide-rounded': 2, straight: 2 },
    lips: { 'full-even': 3, 'medium-even': 2 },
  },
  'northern-european': {
    skinCentre: 31, skinSpread: 5, undertones: { cool: 3, neutral: 3, warm: 1 },
    hairTextures: { ...straight, 'wavy-loose': 2 },
    hairColors: { blonde: 4, 'light-blonde': 3, 'dark-blonde': 3, brown: 2, red: 2 },
    eyeColors: { blue: 5, 'grey-blue': 3, green: 3, grey: 2, hazel: 2 },
    noses: { 'straight-narrow': 3, 'high-bridge': 2, snub: 2 },
    lips: { 'thin-even': 2, 'medium-even': 2 },
  },
  'western-european': {
    skinCentre: 29, skinSpread: 6, undertones: { neutral: 3, cool: 2, warm: 2 },
    hairTextures: { ...straight, ...wavyCurly },
    hairColors: { brown: 4, 'dark-brown': 3, 'dark-blonde': 2, blonde: 2 },
    eyeColors: { brown: 3, blue: 3, green: 2, hazel: 2 },
    noses: { straight: 2, 'straight-narrow': 2, roman: 2 },
    lips: { 'medium-even': 2 },
  },
  'southern-european': {
    skinCentre: 25, skinSpread: 6, undertones: { olive: 4, warm: 2, neutral: 2 },
    hairTextures: { ...straight, ...wavyCurly, 'curly-medium': 3 },
    hairColors: { 'dark-brown': 4, black: 3, brown: 3 },
    eyeColors: { brown: 4, 'dark-brown': 3, hazel: 2, green: 2 },
    noses: { roman: 3, aquiline: 3, straight: 2, 'high-bridge': 2 },
    lips: { 'medium-even': 2, 'medium-bowed': 2 },
  },
  'eastern-european': {
    skinCentre: 28, skinSpread: 6, undertones: { neutral: 3, cool: 2, olive: 2 },
    hairTextures: { ...straight, 'wavy-medium': 2 },
    hairColors: { 'dark-brown': 3, brown: 3, 'dark-blonde': 3, blonde: 2 },
    eyeColors: { blue: 3, grey: 2, brown: 3, green: 2 },
    noses: { straight: 3, 'broad-bridge': 2, snub: 2 },
    lips: { 'medium-even': 2, 'thin-even': 2 },
  },
  'middle-eastern': {
    skinCentre: 22, skinSpread: 7, undertones: { olive: 4, warm: 3, neutral: 2 },
    hairTextures: { 'straight-coarse': 3, 'wavy-medium': 3, 'curly-medium': 3, 'curly-loose': 2 },
    hairColors: { black: 4, 'off-black': 3, 'dark-brown': 3 },
    eyeColors: { 'dark-brown': 4, brown: 3, hazel: 2, green: 1 },
    noses: { aquiline: 4, roman: 3, 'high-bridge': 3, arched: 2 },
    eyes: { 'deep-set': 2, almond: 2, 'heavy-lidded': 2 },
  },
  'north-african': {
    skinCentre: 20, skinSpread: 7, undertones: { olive: 4, warm: 3 },
    hairTextures: { 'wavy-medium': 3, 'curly-medium': 3, 'curly-tight': 2, 'straight-coarse': 2 },
    hairColors: { black: 4, 'dark-brown': 3 },
    eyeColors: { 'dark-brown': 4, brown: 3, hazel: 2 },
    noses: { aquiline: 3, straight: 2, 'high-bridge': 2 },
  },
  'south-asian': {
    skinCentre: 16, skinSpread: 8, undertones: { warm: 3, olive: 3, neutral: 2 },
    hairTextures: { 'straight-coarse': 4, 'wavy-medium': 3, 'curly-medium': 2 },
    hairColors: { black: 5, 'off-black': 3 },
    eyeColors: { 'dark-brown': 5, brown: 3 },
    noses: { straight: 2, 'narrow-high': 2, aquiline: 2, fleshy: 2 },
    eyes: { 'almond-wide': 2, round: 2, 'heavy-lidded': 2 },
  },
  'east-asian': {
    skinCentre: 26, skinSpread: 6, undertones: { warm: 3, neutral: 3, olive: 2 },
    hairTextures: { 'straight-coarse': 5, 'straight-medium': 4 },
    hairColors: { black: 6, 'off-black': 3 },
    eyeColors: { 'dark-brown': 5, brown: 3 },
    eyes: { monolid: 4, 'monolid-soft': 3, epicanthic: 4, 'epicanthic-partial': 3, almond: 2 },
    noses: { 'low-bridge': 3, snub: 2, 'narrow-low': 2, button: 2 },
  },
  'southeast-asian': {
    skinCentre: 21, skinSpread: 7, undertones: { warm: 3, olive: 3, neutral: 2 },
    hairTextures: { 'straight-coarse': 4, 'wavy-medium': 2, 'curly-medium': 2 },
    hairColors: { black: 5, 'off-black': 3 },
    eyeColors: { 'dark-brown': 5, brown: 3 },
    eyes: { 'epicanthic-partial': 3, monolid: 2, almond: 3, round: 2 },
    noses: { 'low-bridge': 3, 'wide-rounded': 2, snub: 2 },
  },
  'pacific-islander': {
    skinCentre: 17, skinSpread: 7, undertones: { warm: 4, olive: 2, neutral: 2 },
    hairTextures: { 'wavy-tight': 3, 'curly-medium': 3, 'coily-soft': 3, 'straight-coarse': 2 },
    hairColors: { black: 5, 'off-black': 3, 'dark-brown': 2 },
    eyeColors: { 'dark-brown': 5, brown: 3 },
    noses: { 'wide-rounded': 3, 'broad-bridge': 3, flared: 2 },
    lips: { 'full-even': 3, 'full-wide': 2 },
  },
  'indigenous-american': {
    skinCentre: 20, skinSpread: 6, undertones: { warm: 3, olive: 2, neutral: 2 },
    hairTextures: { 'straight-coarse': 5, 'straight-medium': 3 },
    hairColors: { black: 5, 'off-black': 3 },
    eyeColors: { 'dark-brown': 5, brown: 3 },
    noses: { aquiline: 3, 'broad-bridge': 2, straight: 2 },
    eyes: { almond: 3, 'epicanthic-partial': 2 },
  },
  'latin-american': {
    // The widest distribution in the table, because the label covers the
    // widest range of ancestry of any entry in it. A narrow one here would be
    // the single most obviously wrong thing this file could do.
    skinCentre: 20, skinSpread: 10, undertones: { warm: 3, olive: 3, neutral: 2 },
    hairTextures: { 'straight-coarse': 3, 'wavy-medium': 3, 'curly-medium': 3, 'coily-soft': 2 },
    hairColors: { black: 4, 'dark-brown': 4, brown: 2 },
    eyeColors: { 'dark-brown': 4, brown: 3, hazel: 2, green: 1 },
    noses: { straight: 2, 'wide-rounded': 2, aquiline: 2 },
  },
};

/** The league's default ancestry mix. A configuration value, not a fact about
 *  anywhere: it is what this fictional league happens to look like, and a
 *  commissioner changing it is a supported thing rather than a hack. */
export const LEAGUE_ANCESTRY_MIX: readonly { ancestry: Ancestry; weight: number }[] = [
  { ancestry: 'african-american', weight: 46 },
  { ancestry: 'western-european', weight: 13 },
  { ancestry: 'northern-european', weight: 7 },
  { ancestry: 'southern-european', weight: 4 },
  { ancestry: 'eastern-european', weight: 3 },
  { ancestry: 'latin-american', weight: 8 },
  { ancestry: 'afro-caribbean', weight: 5 },
  { ancestry: 'west-african', weight: 3 },
  { ancestry: 'pacific-islander', weight: 4 },
  { ancestry: 'east-african', weight: 1 },
  { ancestry: 'horn-of-africa', weight: 1 },
  { ancestry: 'middle-eastern', weight: 1 },
  { ancestry: 'north-african', weight: 1 },
  { ancestry: 'east-asian', weight: 1 },
  { ancestry: 'southeast-asian', weight: 1 },
  { ancestry: 'south-asian', weight: 1 },
  { ancestry: 'indigenous-american', weight: 1 },
];

/** How often a second influence is drawn at all.
 *
 *  Not the same as the share of the league with mixed heritage, which comes
 *  out lower: the second draw is from the same table, so it sometimes lands
 *  on the first ancestry again and collapses. At this rate roughly one player
 *  in six ends up with two influences, which is the number to read this
 *  against. */
export const MIXED_HERITAGE_RATE = 0.22;

/**
 * Blends two or more profiles into the weights a generator actually draws
 * from.
 *
 * Weights multiply rather than average. That is the whole difference between
 * "mixed heritage" and "the average of two populations": multiplying keeps
 * anything either parent population makes likely on the table, so a mixed
 * player can take strongly after one side, or neither, exactly as people do.
 * Averaging would pull every mixed player toward the same middle, which is the
 * failure the request names outright.
 */
export function blendProfiles(
  profiles: readonly AncestryProfile[],
): Omit<AncestryProfile, 'skinCentre' | 'skinSpread'> & {
  readonly skinCentre: number; readonly skinSpread: number;
} {
  if (profiles.length === 1 && profiles[0] !== undefined) return profiles[0];
  const merge = (
    pick: (p: AncestryProfile) => Readonly<Partial<Record<string, number>>> | undefined,
  ): Readonly<Partial<Record<string, number>>> => {
    const out: Record<string, number> = {};
    for (const p of profiles) {
      for (const [id, w] of Object.entries(pick(p) ?? {})) {
        out[id] = Math.max(out[id] ?? 0, w ?? 0);
      }
    }
    return out;
  };
  const centre = profiles.reduce((a, p) => a + p.skinCentre, 0) / profiles.length;
  // The spread widens rather than averaging: a player of two backgrounds can
  // land anywhere between them and a little beyond, which is what actually
  // happens and what stops mixed players clustering at a midpoint.
  const spread = Math.max(...profiles.map((p) => p.skinSpread))
    + Math.abs((profiles[0]?.skinCentre ?? 0) - (profiles[1]?.skinCentre ?? 0)) * 0.3;
  return {
    skinCentre: centre, skinSpread: spread,
    undertones: merge((p) => p.undertones),
    hairTextures: merge((p) => p.hairTextures),
    hairColors: merge((p) => p.hairColors),
    eyeColors: merge((p) => p.eyeColors),
    noses: merge((p) => p.noses),
    eyes: merge((p) => p.eyes),
    lips: merge((p) => p.lips),
  };
}
