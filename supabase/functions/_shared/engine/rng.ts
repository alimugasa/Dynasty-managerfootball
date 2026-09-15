// Deterministic pseudo-random source. The engine takes one of these and draws
// every random decision from it in a fixed order, so a seed fully determines a
// game.
//
// xoshiro128** — 128 bits of state, period 2^128-1, passes the standard
// statistical test batteries. Math.random() is deliberately not used anywhere:
// it is unseeded, and its output differs between engines, so a game could not be
// reproduced from a save file or compared against a golden.

export interface Rng {
  /** Raw 32-bit draw. */
  readonly uint32: () => number;
  /** Uniform in [0, 1). */
  readonly float: () => number;
  /** Uniform integer in [min, max], inclusive. */
  readonly int: (min: number, max: number) => number;
  /** True with probability p. */
  readonly chance: (p: number) => boolean;
  /** Normal deviate. */
  readonly normal: (mean: number, sd: number) => number;
  /** Exponential deviate with the given mean. */
  readonly exponential: (mean: number) => number;
  /** Number of successes in n independent trials. */
  readonly binomial: (n: number, p: number) => number;
  /** Uniform choice from a non-empty array. */
  readonly pick: <T>(items: readonly T[]) => T;
  /** Current state, for snapshotting a stream position in tests. */
  readonly snapshot: () => readonly [number, number, number, number];
}

function splitmix32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad) >>> 0;
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97) >>> 0;
    return (t ^ (t >>> 15)) >>> 0;
  };
}

const rotl = (x: number, k: number): number => ((x << k) | (x >>> (32 - k))) >>> 0;

/**
 * Build a generator from a numeric seed. The same seed always yields the same
 * stream, on any JavaScript engine: every operation is on uint32 values via
 * Math.imul and shifts, so there is no floating-point drift between platforms.
 */
export function createRng(seed: number): Rng {
  const mix = splitmix32(Math.trunc(seed) >>> 0);
  let s0 = mix();
  let s1 = mix();
  let s2 = mix();
  let s3 = mix();
  // A zero state is absorbing; splitmix makes it vanishingly unlikely, but the
  // cost of ruling it out is one comparison at construction.
  if ((s0 | s1 | s2 | s3) === 0) s0 = 0x9e3779b9;

  const uint32 = (): number => {
    const result = (Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0) >>> 0;
    const t = (s1 << 9) >>> 0;
    s2 = (s2 ^ s0) >>> 0;
    s3 = (s3 ^ s1) >>> 0;
    s1 = (s1 ^ s2) >>> 0;
    s0 = (s0 ^ s3) >>> 0;
    s2 = (s2 ^ t) >>> 0;
    s3 = rotl(s3, 11);
    return result;
  };

  // 2^-32. Dividing by a power of two is exact in binary floating point, so this
  // introduces no rounding difference across platforms.
  const float = (): number => uint32() * 2.3283064365386963e-10;

  const int = (min: number, max: number): number => {
    if (max < min) throw new RangeError(`int(${min}, ${max}): empty range`);
    return min + Math.floor(float() * (max - min + 1));
  };

  const chance = (p: number): boolean => float() < p;

  // Box-Muller, both deviates recomputed each call. Caching the spare would make
  // a normal draw depend on how many were taken before it, which is a subtle way
  // for an unrelated change to shift the whole stream.
  const normal = (mean: number, sd: number): number => {
    let u1 = float();
    if (u1 < 1e-12) u1 = 1e-12;
    const u2 = float();
    return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  const exponential = (mean: number): number => {
    let u = float();
    if (u < 1e-12) u = 1e-12;
    return -Math.log(u) * mean;
  };

  // Exact rather than normal-approximated: n is small everywhere it is used
  // (attempts in a game, players on a unit), and an approximation would put
  // non-integral mass at the tails of a count.
  const binomial = (n: number, p: number): number => {
    let hits = 0;
    for (let i = 0; i < n; i += 1) if (float() < p) hits += 1;
    return hits;
  };

  const pick = <T,>(items: readonly T[]): T => {
    if (items.length === 0) throw new RangeError('pick() on an empty array');
    return items[int(0, items.length - 1)] as T;
  };

  const snapshot = (): readonly [number, number, number, number] => [s0, s1, s2, s3];

  return { uint32, float, int, chance, normal, exponential, binomial, pick, snapshot };
}
