// Turning a seed string into draws, in a way that survives the library
// growing.
//
// The obvious implementation -- one generator, draw the traits in order -- is
// wrong here for a reason worth writing down. It makes every trait's value
// depend on how many draws came before it, so adding one field to the
// generator, or reordering two, changes every face in every save that has
// already been played. The request says a player's seed "must generate the
// same underlying person every time", and a single stream cannot promise that
// past the next commit.
//
// So each trait gets its own stream, named. The stream for 'nose' is derived
// from the seed and the string "nose" and from nothing else, which means a
// nose is stable no matter what is added beside it. The cost is one hash per
// trait; the benefit is that this file's promise is actually keepable.

import { createRng, type Rng } from '../engine/rng.ts';
import type { TraitOption } from './traits.ts';

/**
 * FNV-1a over the seed and the stream name.
 *
 * Chosen for being short, well-understood and identical on every JavaScript
 * engine. It is not a security hash and nothing here needs one -- what it
 * needs is that the same two strings give the same 32 bits on a phone and on
 * a server, which this does.
 */
export function hashStream(seed: string, name: string): number {
  let h = 0x811c9dc5;
  const text = `${seed}:${name}`;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** A generator for one named trait of one seed. */
export function streamFor(seed: string, name: string): Rng {
  return createRng(hashStream(seed, name));
}

/**
 * A weighted draw, with multipliers.
 *
 * The baseline weight is the trait library's -- how common the feature is
 * across the whole league. The multiplier is ancestry's, and it multiplies
 * rather than replaces: an influence can make a feature four times as likely
 * without making any other feature impossible. That is the mechanism that
 * keeps ancestry an influence rather than a template, and it lives here
 * because here is the only place a trait and an ancestry ever meet.
 */
export function weightedPick(
  rng: Rng,
  options: readonly TraitOption[],
  multipliers?: Readonly<Partial<Record<string, number>>>,
): TraitOption {
  let total = 0;
  const weights = options.map((o) => {
    const w = Math.max(0, o.weight * (multipliers?.[o.id] ?? 1));
    total += w;
    return w;
  });
  if (total <= 0) {
    // Every option multiplied to nothing. Falling back to the unweighted
    // library is the honest answer: it says "no preference" rather than
    // silently handing back the first entry every time.
    return options[rng.int(0, options.length - 1)] as TraitOption;
  }
  let roll = rng.float() * total;
  for (let i = 0; i < options.length; i += 1) {
    roll -= weights[i] ?? 0;
    if (roll <= 0) return options[i] as TraitOption;
  }
  return options[options.length - 1] as TraitOption;
}

/** The same draw over a plain id/weight list, for the libraries that carry
 *  extra fields (hairstyles, hair colours, facial hair) and so are not
 *  TraitOption arrays. */
export function weightedPickBy<T>(
  rng: Rng,
  items: readonly T[],
  id: (item: T) => string,
  weight: (item: T) => number,
  multipliers?: Readonly<Partial<Record<string, number>>>,
): T {
  const options = items.map((item) => ({ id: id(item), label: '', weight: weight(item) }));
  const chosen = weightedPick(rng, options, multipliers);
  return items.find((item) => id(item) === chosen.id) as T;
}

/**
 * A continuous trait, as a number between 0 and 1.
 *
 * Triangular rather than uniform: most faces sit near the middle of any one
 * dimension and the extremes are rare, which is both true and what stops a
 * league of averaged-out faces from being replaced by a league of caricatures.
 */
export function shapeValue(rng: Rng): number {
  return (rng.float() + rng.float()) / 2;
}
