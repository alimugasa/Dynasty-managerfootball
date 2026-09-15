// Seed in, person out.
//
// This is the only file that decides what anybody looks like. Everything it
// draws from is a library (traits.ts, hair.ts, skin.ts), everything that bends
// a draw is an influence (ancestry.ts, build.ts), and every draw comes from
// its own named stream (seed.ts) so that a face is stable against the library
// growing underneath it.
//
// Two rules are enforced here rather than documented and hoped for:
//
//   * nothing in the identity half reads an age, a season, a position or a
//     team. It cannot, because it is not passed any of them. That is what
//     makes a 37-year-old the same man as the 23-year-old.
//   * ancestry never selects a trait. It only multiplies a weight that the
//     library already assigned, so no feature is ever unavailable to anyone.

import { clamp } from '../engine/calibration.ts';
import {
  BASE_HEADS, FACE_SHAPES, JAW_SHAPES, CHIN_SHAPES, CHEEKBONES, NOSE_SHAPES,
  EYE_SHAPES, EYEBROW_SHAPES, LIP_SHAPES, EAR_SHAPES, HAIRLINES, EYE_COLORS,
  COMPLEXION_DETAILS, EXPRESSIONS, ACCESSORIES,
} from './traits.ts';
import { SKIN_STEPS, type Undertone, UNDERTONES } from './skin.ts';
import {
  HAIR_TEXTURES, HAIRSTYLES, HAIR_COLORS, FACIAL_HAIR, FACIAL_HAIR_DENSITY,
  hairFits, type FacialHairDensity, type HairOption,
} from './hair.ts';
import {
  ANCESTRIES, ANCESTRY_PROFILES, LEAGUE_ANCESTRY_MIX, MIXED_HERITAGE_RATE,
  blendProfiles, type Ancestry, type AncestryProfile,
} from './ancestry.ts';
import { BUILDS, buildWeights, type Build } from './build.ts';
import { streamFor, weightedPick, weightedPickBy, shapeValue } from './seed.ts';
import {
  AVATAR_VERSION, type AvatarAppearance, type AvatarIdentity,
  type AvatarOverrides, type AvatarProfile,
} from './profile.ts';

/* --------------------------------------------------------- the influences -- */

/**
 * Which populations a player's family came from.
 *
 * Drawn from the seed when the roster does not say, which is nearly always:
 * the league stores no birthplace and no nationality, and inventing one to
 * hang a face on would be inventing data. What it stores instead is the
 * heritage this generator drew, so the answer is recorded rather than guessed
 * afresh -- and a commissioner can overwrite it.
 *
 * Note what this is *not* keyed on: not the player's name, not his team, not
 * where the league says he went to school. A name is not an ancestry and the
 * request says so outright.
 */
export function drawAncestry(seed: string): readonly Ancestry[] {
  const rng = streamFor(seed, 'ancestry');
  const pick = (): Ancestry => {
    const total = LEAGUE_ANCESTRY_MIX.reduce((a, e) => a + e.weight, 0);
    let roll = rng.float() * total;
    for (const entry of LEAGUE_ANCESTRY_MIX) {
      roll -= entry.weight;
      if (roll <= 0) return entry.ancestry;
    }
    return LEAGUE_ANCESTRY_MIX[0]?.ancestry ?? 'african-american';
  };
  const first = pick();
  if (!rng.chance(MIXED_HERITAGE_RATE)) return [first];
  const second = pick();
  return second === first ? [first] : [first, second];
}

/** Anything stored in players.heritage that this build recognises. Unknown
 *  strings are dropped rather than coerced: a heritage nobody can render is
 *  missing data, and the caller falls back to the seed. */
export function readHeritage(stored: readonly string[] | null): readonly Ancestry[] {
  if (stored === null) return [];
  return stored.filter((s): s is Ancestry => (ANCESTRIES as readonly string[]).includes(s));
}

function profileFor(ancestry: readonly Ancestry[]): AncestryProfile {
  const profiles = ancestry
    .map((a) => ANCESTRY_PROFILES[a])
    .filter((p): p is AncestryProfile => p !== undefined);
  if (profiles.length === 0) return ANCESTRY_PROFILES['african-american'];
  return blendProfiles(profiles);
}

/* ------------------------------------------------------------ the person -- */

/** Not colours anybody is born with: these are what the years do and what a
 *  player decides, and both are settled in the appearance half. */
const DYED_OR_GREY = new Set([
  'salt-pepper', 'grey', 'white', 'platinum', 'bleached',
  'dyed-blond-tips', 'dyed-copper',
]);

/**
 * Where on the melanin scale a player sits.
 *
 * A normal draw around the influence's centre, with the influence's spread.
 * Continuous, so there is no such thing as "the light one" and "the dark one"
 * -- there are thirty-six steps and a player is at one of them. The spread is
 * generous on purpose: every population in the table covers most of the scale,
 * and the centres only say where the weight of it sits.
 */
function drawSkinStep(seed: string, profile: AncestryProfile): number {
  const rng = streamFor(seed, 'skin');
  const raw = rng.normal(profile.skinCentre, profile.skinSpread / 2);
  return Math.round(clamp(raw, 0, SKIN_STEPS - 1));
}

function drawUndertone(seed: string, profile: AncestryProfile): Undertone {
  const rng = streamFor(seed, 'undertone');
  const options = UNDERTONES.map((id) => ({ id, label: id, weight: 1 }));
  return weightedPick(rng, options, profile.undertones).id as Undertone;
}

/**
 * The permanent person.
 *
 * Takes a seed and an ancestry and nothing else. That signature is the
 * guarantee: there is no argument here that could make the same seed produce
 * a different face in week 12 than it did in week 1.
 */
export function generateIdentity(
  seed: string, ancestry: readonly Ancestry[],
): AvatarIdentity {
  const profile = profileFor(ancestry);
  const s = (name: string) => streamFor(seed, name);

  const texture = weightedPick(
    s('hair-texture'),
    HAIR_TEXTURES.map((id) => ({ id, label: id, weight: 1 })),
    profile.hairTextures,
  ).id;

  // Natural colour only. Grey is what age does and a bleach job is what a
  // player does, so neither is drawn as the colour he was born with.
  const natural = HAIR_COLORS.filter((c) => !DYED_OR_GREY.has(c.id));

  return {
    baseHead: weightedPick(s('base-head'), BASE_HEADS).id,
    faceShape: weightedPick(s('face-shape'), FACE_SHAPES).id,
    jaw: weightedPick(s('jaw'), JAW_SHAPES).id,
    chin: weightedPick(s('chin'), CHIN_SHAPES).id,
    cheekbones: weightedPick(s('cheekbones'), CHEEKBONES).id,
    browRidge: shapeValue(s('brow-ridge')),
    faceWidth: shapeValue(s('face-width')),
    faceLength: shapeValue(s('face-length')),

    nose: weightedPick(s('nose'), NOSE_SHAPES, profile.noses).id,
    noseWidth: shapeValue(s('nose-width')),
    eyes: weightedPick(s('eyes'), EYE_SHAPES, profile.eyes).id,
    eyeSpacing: shapeValue(s('eye-spacing')),
    eyeDepth: shapeValue(s('eye-depth')),
    eyeColor: weightedPick(s('eye-color'), EYE_COLORS, profile.eyeColors).id,
    eyebrows: weightedPick(s('eyebrows'), EYEBROW_SHAPES).id,
    eyebrowThickness: shapeValue(s('eyebrow-thickness')),
    lips: weightedPick(s('lips'), LIP_SHAPES, profile.lips).id,
    lipFullness: shapeValue(s('lip-fullness')),
    ears: weightedPick(s('ears'), EAR_SHAPES).id,
    earProtrusion: shapeValue(s('ear-protrusion')),

    skinStep: drawSkinStep(seed, profile),
    undertone: drawUndertone(seed, profile),
    complexion: weightedPick(s('complexion'), COMPLEXION_DETAILS).id,

    hairTexture: texture,
    hairline: weightedPick(s('hairline'), HAIRLINES).id,
    naturalHairColor: weightedPickBy(
      s('hair-color'), natural, (c) => c.id, (c) => c.weight, profile.hairColors,
    ).id,

    ancestry,
  };
}

/* ------------------------------------------------------------ the years -- */

/**
 * What age has done, as three numbers between 0 and 1.
 *
 * Every one of them is a curve on age crossed with a tendency drawn from the
 * seed, and the tendency is drawn once. That is what makes ageing *the same
 * man older*: two players of 37 do not converge on one weathered face,
 * because their tendencies differ, and neither of them jumps when a birthday
 * passes, because the curve is continuous.
 *
 * The numbers stay small. A footballer's career runs from about 21 to about
 * 38, which is not long enough for a face to change beyond recognition, and a
 * renderer that treats a veteran as an old man is as wrong as one that treats
 * him as a rookie.
 */
export function ageEffects(seed: string, age: number): {
  readonly ageWear: number; readonly recession: number; readonly greying: number;
} {
  const rng = streamFor(seed, 'ageing');
  // Three independent tendencies, in a fixed order on one stream. Ageing is
  // one concept and its parts correlate in real faces, so they share a stream
  // deliberately -- unlike the traits, which do not.
  const wearRate = 0.6 + rng.float() * 0.8;
  const baldRate = rng.float() ** 2;      // most men keep it; a few do not.
  const greyStart = 27 + rng.int(0, 16);

  const years = Math.max(0, age - 21);
  return {
    ageWear: clamp((years / 20) * wearRate, 0, 1),
    recession: clamp((years / 18) * baldRate * 1.6, 0, 1),
    greying: clamp((age - greyStart) / 18, 0, 1),
  };
}

/* --------------------------------------------------------- the appearance -- */

function drawBuild(seed: string, position: string): Build {
  const options = BUILDS.map((id) => ({ id, label: id, weight: 1 }));
  return weightedPick(streamFor(seed, 'build'), options, buildWeights(position)).id as Build;
}

/**
 * A hairstyle he could actually wear.
 *
 * Filtered by texture first -- a style the library says is not worn in this
 * texture is not on the list at all -- and then weighted down by how far his
 * hairline has gone, because a receding man in a high fade is a rendering
 * mistake rather than a character choice.
 */
function drawHairstyle(seed: string, texture: string, recession: number): HairOption {
  const wearable = HAIRSTYLES.filter((h) => hairFits(h, texture));
  const pool = wearable.length > 0 ? wearable : HAIRSTYLES;
  const adjusted: Readonly<Partial<Record<string, number>>> = Object.fromEntries(
    pool.map((h) => {
      if (recession < 0.45) return [h.id, 1];
      // Past the halfway mark the long styles thin out and the shaved head
      // becomes the common answer, which is what actually happens.
      if (h.length === 'long') return [h.id, recession > 0.6 ? 0 : 0.2];
      if (h.length === 'medium') return [h.id, 0.35];
      if (h.length === 'none') return [h.id, 2 + recession * 4];
      return [h.id, 1];
    }),
  );
  return weightedPickBy(
    streamFor(seed, 'hairstyle'), pool, (h) => h.id, (h) => h.weight, adjusted,
  );
}

/** The colour on his head today: what he was born with, moved toward grey by
 *  the years, or dyed because he felt like it. */
function drawHairColor(seed: string, natural: string, greying: number): string {
  const rng = streamFor(seed, 'hair-dye');
  if (rng.chance(0.06)) {
    const dyes = HAIR_COLORS.filter((c) => c.id.startsWith('dyed-') || c.id === 'bleached'
      || c.id === 'platinum');
    return weightedPickBy(rng, dyes, (c) => c.id, (c) => c.weight).id;
  }
  if (greying >= 0.75) return 'white';
  if (greying >= 0.45) return 'grey';
  if (greying >= 0.15) return 'salt-pepper';
  return natural;
}

/**
 * Facial hair, which is the one appearance trait age moves in both directions.
 *
 * A 21-year-old is far likelier to be clean-shaven or in patchy stubble than
 * a 31-year-old is, and a full beard on a rookie should read as unusual
 * rather than as the default it would be on an unweighted draw.
 */
function drawFacialHair(seed: string, age: number): {
  readonly id: string; readonly density: FacialHairDensity;
} {
  const youth = clamp((28 - age) / 8, 0, 1);
  const multipliers: Readonly<Partial<Record<string, number>>> = {
    clean: 1 + youth * 0.8,
    'stubble-light': 1 + youth * 0.5,
    'beard-patchy': 1 + youth * 2,
    'beard-full': 1 - youth * 0.55,
    'beard-long': 1 - youth * 0.8,
    'beard-medium': 1 - youth * 0.35,
    horseshoe: 1 - youth * 0.6,
    'mustache-thick': 1 - youth * 0.6,
  };
  const rng = streamFor(seed, 'facial-hair');
  const chosen = weightedPickBy(rng, FACIAL_HAIR, (f) => f.id, (f) => f.weight, multipliers);
  // Density is drawn on the same stream, after the style, because how thick a
  // beard comes in is a fact about the man rather than about the style.
  const bias = clamp(rng.float() + (1 - youth) * 0.2, 0, 0.999);
  const density = FACIAL_HAIR_DENSITY[Math.floor(bias * FACIAL_HAIR_DENSITY.length)]
    ?? 'medium';
  return { id: chosen.id, density };
}

/**
 * What he looks like this season.
 *
 * Takes the identity it is dressing, so a texture-incompatible haircut and a
 * hair colour unrelated to his own are both impossible rather than merely
 * unlikely.
 */
export function generateAppearance(
  seed: string, identity: AvatarIdentity, position: string, age: number,
): AvatarAppearance {
  const years = ageEffects(seed, age);
  const style = drawHairstyle(seed, identity.hairTexture, years.recession);
  const facial = drawFacialHair(seed, age);
  return {
    hairstyle: style.id,
    hairColor: drawHairColor(seed, identity.naturalHairColor, years.greying),
    facialHair: facial.id,
    facialHairDensity: facial.density,
    accessory: weightedPick(streamFor(seed, 'accessory'), ACCESSORIES).id,
    expression: weightedPick(streamFor(seed, 'expression'), EXPRESSIONS).id,
    build: drawBuild(seed, position),
    age,
    ageWear: years.ageWear,
    recession: years.recession,
    greying: years.greying,
  };
}

/* ------------------------------------------------------------- assembly -- */

export interface AvatarInput {
  readonly seed: string;
  readonly position: string;
  readonly age: number;
  /** players.heritage, when the row has one. */
  readonly heritage?: readonly string[] | null;
  /** players.avatar_overrides, when a commissioner has edited the face. */
  readonly overrides?: AvatarOverrides | null;
}

/**
 * The whole face.
 *
 * Overrides are applied last and are never re-derived, so an edited feature
 * survives every regeneration. The generated profile underneath stays intact,
 * which means removing an override returns the player to the face he had
 * rather than to a new one.
 */
export function generateAvatar(input: AvatarInput): AvatarProfile {
  const stored = readHeritage(input.heritage ?? null);
  const ancestry = stored.length > 0 ? stored : drawAncestry(input.seed);
  const identity = generateIdentity(input.seed, ancestry);
  const appearance = generateAppearance(input.seed, identity, input.position, input.age);
  const o = input.overrides;
  return {
    seed: input.seed,
    version: AVATAR_VERSION,
    identity: o?.identity === undefined ? identity : { ...identity, ...o.identity },
    appearance: o?.appearance === undefined ? appearance : { ...appearance, ...o.appearance },
  };
}
