// Minting a dynasty seed.
//
// One function, two consumers: create_save() on the server stores a 62-bit
// value in a Postgres bigint, and the browser host's newGame() feeds a 32-bit
// value to createRng, which reads only the low 32 bits of whatever it is given.
// Both draw from the platform's cryptographic source rather than Math.random,
// and neither ever returns zero: zero is the template world's placeholder and
// create_save() refuses it.
//
// This is not engine code. The engine is seeded and pure; the one place a
// dynasty is allowed to be random is its birth, and this is that place.

function randomBits(bits: number): bigint {
  const bytes = new Uint8Array(Math.ceil(bits / 8));
  crypto.getRandomValues(bytes);
  let value = 0n;
  for (const b of bytes) value = (value << 8n) | BigInt(b);
  return value & ((1n << BigInt(bits)) - 1n);
}

/** A 62-bit positive integer that is never zero. Fits a Postgres bigint. */
export function freshSeed62(): bigint {
  const seed = randomBits(62);
  return seed === 0n ? 1n : seed;
}

/** A 32-bit positive integer that is never zero. Fits createRng, which masks
 *  its seed to uint32, and survives JSON as an exact number. */
export function freshSeed32(): number {
  const seed = Number(randomBits(32));
  return seed === 0 ? 1 : seed;
}
