// Making sure two players are not the same man.
//
// The failure this exists to stop is specific, and the request names it: two
// faces built from the same bones, told apart only by a haircut and a skin
// tone. That reads as one player wearing two uniforms, and it is exactly what
// a naive uniqueness check *encourages*, because a check that hashes every
// field at once will happily call those two faces distinct and move on.
//
// So the signature here is deliberately blind to the things that are easy to
// change. Hairstyle, hair colour, facial hair, accessories, expression and
// skin step are not in it at all. What is in it is the structure: the skull,
// the features, and the proportions between them -- the parts that make a
// face somebody's. Two players who match on those are clones however
// differently they are groomed, and this says so.

import type { AvatarIdentity } from './profile.ts';
import {
  generateIdentity, type AvatarInput,
} from './generate.ts';
import type { Ancestry } from './ancestry.ts';

/**
 * How finely a continuous trait is compared.
 *
 * Six buckets. Fine enough that two faces a bucket apart really do look
 * different, coarse enough that two faces at 0.501 and 0.499 are not called
 * distinct on a difference nobody could see.
 */
const SHAPE_BUCKETS = 6;

const bucket = (v: number): number =>
  Math.min(SHAPE_BUCKETS - 1, Math.floor(v * SHAPE_BUCKETS));

/**
 * The parts of a face that carry identity, in order of how much.
 *
 * Primary traits are the ones you would describe a stranger by. Secondary
 * traits are real differences that do not, on their own, make a different
 * person -- which is why they are also the ones the resolver is allowed to
 * reroll.
 */
const PRIMARY: readonly ((i: AvatarIdentity) => string | number)[] = [
  (i) => i.baseHead, (i) => i.faceShape, (i) => i.jaw, (i) => i.chin,
  (i) => i.nose, (i) => i.eyes, (i) => i.lips, (i) => i.cheekbones,
  (i) => bucket(i.faceWidth), (i) => bucket(i.faceLength),
  (i) => bucket(i.noseWidth), (i) => bucket(i.eyeSpacing),
];

const SECONDARY: readonly ((i: AvatarIdentity) => string | number)[] = [
  (i) => i.ears, (i) => i.eyebrows, (i) => i.hairline, (i) => i.eyeColor,
  (i) => i.complexion, (i) => i.hairTexture,
  (i) => bucket(i.browRidge), (i) => bucket(i.eyeDepth),
  (i) => bucket(i.eyebrowThickness), (i) => bucket(i.lipFullness),
  (i) => bucket(i.earProtrusion),
];

/**
 * A face's structural fingerprint.
 *
 * Primary components only. Two identities with the same signature are the
 * same face as far as anybody looking at a roster is concerned, whatever
 * their hair is doing.
 */
export function signature(identity: AvatarIdentity): string {
  return PRIMARY.map((f) => String(f(identity))).join('|');
}

/**
 * How far apart two faces are.
 *
 * A weighted count of differing components: three for a primary, one for a
 * secondary. It is a count rather than a geometry because the traits are
 * categorical -- "ovoid" is not nearer to "domed" than to "blocky" in any
 * sense the renderer honours, so pretending there is a distance between them
 * would be inventing one.
 */
export function distance(a: AvatarIdentity, b: AvatarIdentity): number {
  let d = 0;
  for (const f of PRIMARY) if (f(a) !== f(b)) d += 3;
  for (const f of SECONDARY) if (f(a) !== f(b)) d += 1;
  return d;
}

/** The most two faces can differ by. */
export const MAX_DISTANCE = PRIMARY.length * 3 + SECONDARY.length;

/**
 * Below this, two players look like the same man.
 *
 * Nine is three primary components, or one primary and six secondary ones. A
 * pair that far apart share their skull, their jaw, their nose and their eyes
 * and differ in the trim -- which is the clone case, not a near miss.
 */
export const NEAR_DUPLICATE = 9;

export const isClone = (a: AvatarIdentity, b: AvatarIdentity): boolean =>
  distance(a, b) < NEAR_DUPLICATE;

/**
 * A running set of the faces a league has already issued.
 *
 * Keyed on signature rather than holding every identity, because the check
 * that matters is exact structural collision and a set lookup is the whole
 * cost of it. Near-duplicate detection over every pair is a test's job (it is
 * quadratic, and a league is four thousand players); a save generating faces
 * one at a time needs the cheap check and gets it.
 */
export class FaceRegistry {
  private readonly taken = new Set<string>();

  has(identity: AvatarIdentity): boolean {
    return this.taken.has(signature(identity));
  }

  add(identity: AvatarIdentity): void {
    this.taken.add(signature(identity));
  }

  get size(): number {
    return this.taken.size;
  }
}

/** How many salted attempts before giving up and keeping the collision. */
const MAX_REROLLS = 12;

/**
 * A face that is not already somebody's.
 *
 * Rerolls by salting the seed, which keeps the whole thing deterministic: the
 * same player in the same league lands on the same salt every time, so a
 * resolved face is as stable as an unresolved one. What it does *not* do is
 * reroll toward the middle -- each attempt is a fresh draw from the same
 * distributions, so a player pushed off a collision is not quietly made more
 * average than his neighbours.
 *
 * Giving up after twelve attempts and keeping the last face is the honest
 * failure: a league that has genuinely exhausted the library should show a
 * repeat rather than loop, and the registry's caller can see it happened.
 */
export function resolveCollision(
  seed: string,
  ancestry: readonly Ancestry[],
  registry: FaceRegistry,
): { readonly identity: AvatarIdentity; readonly salt: number } {
  let identity = generateIdentity(seed, ancestry);
  if (!registry.has(identity)) return { identity, salt: 0 };
  for (let salt = 1; salt <= MAX_REROLLS; salt += 1) {
    // The salt goes on the seed rather than on one trait, because rerolling a
    // single trait off a collision is how you get a league where everybody
    // who collided has the same distinguishing ear.
    identity = generateIdentity(`${seed}#${String(salt)}`, ancestry);
    if (!registry.has(identity)) return { identity, salt };
  }
  return { identity, salt: MAX_REROLLS };
}

/** The seed a resolved face was actually generated from, so a renderer and a
 *  cache agree with the generator about which draw produced this man. */
export const saltedSeed = (seed: string, salt: number): string =>
  salt === 0 ? seed : `${seed}#${String(salt)}`;

/** The input a caller should regenerate from once a collision has been
 *  resolved. Kept here so the salt never has to be reassembled by hand. */
export function resolvedInput(input: AvatarInput, salt: number): AvatarInput {
  return { ...input, seed: saltedSeed(input.seed, salt) };
}
