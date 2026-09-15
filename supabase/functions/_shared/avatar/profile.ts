// A player's face, as data.
//
// The split in this file is the whole design. An avatar is two records, not
// one:
//
//   AvatarIdentity   the person. Skull, features, pigmentation, hair texture,
//                    eye colour. Generated once from the seed and never
//                    rolled again, because these are the things that make a
//                    face recognisable as somebody's.
//
//   AvatarAppearance what he turned up looking like. Hairstyle, hair colour,
//                    facial hair, accessories, expression, and the build and
//                    ageing that a career moves. Derived from the seed plus
//                    the season, so it can change without the man changing.
//
// The request asks for a 37-year-old to "clearly look like an older version of
// the same person", and for a player to be able to change hairstyles "without
// becoming a different-looking person". Both of those are the same requirement
// stated twice, and both are satisfied structurally here rather than by
// careful arithmetic downstream: nothing in AvatarIdentity takes an age or a
// season as an input, so nothing in it can drift.

import type { Undertone } from './skin.ts';
import type { FacialHairDensity } from './hair.ts';
import type { Ancestry } from './ancestry.ts';
import type { Build } from './build.ts';

/** The permanent person. Every field here is a trait id from traits.ts,
 *  skin.ts or hair.ts; none of them is a category anyone would recognise as a
 *  preset, and that is deliberate. */
export interface AvatarIdentity {
  /* the skull */
  readonly baseHead: string;
  readonly faceShape: string;
  readonly jaw: string;
  readonly chin: string;
  readonly cheekbones: string;
  readonly browRidge: number;
  readonly faceWidth: number;
  readonly faceLength: number;

  /* the features */
  readonly nose: string;
  readonly noseWidth: number;
  readonly eyes: string;
  readonly eyeSpacing: number;
  readonly eyeDepth: number;
  readonly eyeColor: string;
  readonly eyebrows: string;
  readonly eyebrowThickness: number;
  readonly lips: string;
  readonly lipFullness: number;
  readonly ears: string;
  readonly earProtrusion: number;

  /* pigment */
  readonly skinStep: number;
  readonly undertone: Undertone;
  readonly complexion: string;

  /* hair, the permanent half */
  readonly hairTexture: string;
  readonly hairline: string;
  readonly naturalHairColor: string;

  /* where the influences came from, for the editor and the lab */
  readonly ancestry: readonly Ancestry[];
}

/** The changeable half. Everything a man could turn up with next August. */
export interface AvatarAppearance {
  readonly hairstyle: string;
  readonly hairColor: string;
  readonly facialHair: string;
  readonly facialHairDensity: FacialHairDensity;
  readonly accessory: string;
  readonly expression: string;
  readonly build: Build;

  /* what the years have done. Applied by the renderer, stored so the lab and
   * the editor can see it rather than having to infer it. */
  readonly age: number;
  /** 0-1. Lines, weathering, the set of the face. */
  readonly ageWear: number;
  /** 0-1. How far the hairline has moved from where it started. */
  readonly recession: number;
  /** 0-1. How much of the hair has gone grey. */
  readonly greying: number;
}

/**
 * What a screen is handed.
 *
 * The seed rides along because the cache is keyed on it and because the
 * uniqueness test needs to name the player it is complaining about. `version`
 * is the generator's, not the schema's: if the trait libraries change shape
 * badly enough that old faces would render wrong, this is what tells a cache
 * to drop them.
 */
export interface AvatarProfile {
  readonly seed: string;
  readonly version: number;
  readonly identity: AvatarIdentity;
  readonly appearance: AvatarAppearance;
}

/** Bumped only when a change would make an existing seed render as a
 *  different person. Adding a trait option does not qualify; reordering a
 *  library's draws does. */
export const AVATAR_VERSION = 1;

/**
 * What a commissioner is allowed to change.
 *
 * Every field optional, every field a plain scalar, and nothing derived: an
 * override is stored exactly as typed and applied over the generated profile,
 * so a face that has been edited stays edited when the generator changes.
 * Nulls are not "no opinion" -- a missing key is. A key present with a null
 * would be a value indistinguishable from an unset one, which is the thing
 * the architecture rules forbid.
 */
export interface AvatarOverrides {
  readonly identity?: Partial<AvatarIdentity>;
  readonly appearance?: Partial<Omit<AvatarAppearance, 'age' | 'ageWear' | 'recession' | 'greying'>>;
}
