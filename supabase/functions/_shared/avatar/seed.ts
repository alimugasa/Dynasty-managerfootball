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
//
// The generator below is this module's own rather than the simulation
// engine's, and deliberately. Two reasons. The engine must never reach the
// client bundle (ARCHITECTURE.md rule 2, and scripts/lint-arch.mjs rule 6),
// and a face is drawn wherever a face is shown. More importantly, the engine's
// Rng exists to make a *game* reproducible: if it were ever retuned for the
// simulation's sake, every face in every save would change with it. A portrait
// and a play-by-play have no business sharing a random source.

import type { TraitOption } from './traits.ts';

/** Draws this module needs. A small surface on purpose -- the engine's Rng
 *  carries a snapshot API and a period a face has no use for. */
export interface FaceRng {
  readonly float: () => number;
  readonly int: (min: number, max: number) => number;
  readonly chance: (p: number) => boolean;
  readonly normal: (mean: number, sd: number) => number;
}

/**
 * splitmix32: one multiply-xor-shift chain over a 32-bit counter.
 *
 * Chosen for being short enough to read in full and identical on every
 * JavaScript engine -- every operation is Math.imul and shifts on uint32
 * values, so there is no floating-point drift between a phone and a server.
 * Its statistical quality is far beyond what picking a nose from a list of
 * thirty-five asks of it.
 */
export function faceRng(seed: number): FaceRng {
  let a = seed >>> 0;
  const uint32 = (): number => {
    a = (a + 0x9e3779b9) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad) >>> 0;
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97) >>> 0;
    return (t ^ (t >>> 15)) >>> 0;
  };
  const float = (): number => uint32() / 4294967296;
  return {
    float,
    int: (min, max) => min + Math.floor(float() * (max - min + 1)),
    chance: (p) => float() < p,
    // Box-Muller. The guard is against log(0), which uint32 can produce.
    normal: (mean, sd) => {
      const u = Math.max(1e-12, float());
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * float());
    },
  };
}

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
export function streamFor(seed: string, name: string): FaceRng {
  return faceRng(hashStream(seed, name));
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
  rng: FaceRng,
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
  rng: FaceRng,
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
export function shapeValue(rng: FaceRng): number {
  return (rng.float() + rng.float()) / 2;
}
