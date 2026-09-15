// Not generating the same face twice.
//
// Generating a profile is about sixty hashes and sixty weighted draws. That is
// nothing once and something on a fifty-three-row roster that rerenders on
// every filter change -- and the request is explicit that a face must never be
// regenerated on a rerender, which is a correctness requirement as much as a
// performance one: a generator that ran again would produce the same face, but
// a component that re-ran it would flicker.

import { generateAvatar } from '../../supabase/functions/_shared/avatar/generate';
import type { AvatarOverrides, AvatarProfile } from '../../supabase/functions/_shared/avatar/profile';

/** Enough for every player a screen can hold several times over, and small
 *  enough that a long session does not accumulate a league's worth of faces
 *  it stopped showing an hour ago. */
const CAPACITY = 600;

const store = new Map<string, AvatarProfile>();

/**
 * The key.
 *
 * Seed plus everything else that changes the result. Position and age belong
 * in it because they move the appearance half -- a player who moved from
 * linebacker to edge is built differently and should be redrawn, and a cache
 * keyed on the seed alone would show him last season's shoulders forever.
 */
const keyFor = (
  seed: string, position: string, age: number, heritage: readonly string[] | null,
): string => `${seed}|${position}|${String(age)}|${(heritage ?? []).join(',')}`;

/**
 * A profile, generated once.
 *
 * Insertion-ordered eviction rather than least-recently-used: a Map preserves
 * insertion order, so the oldest key is the first one, and LRU bookkeeping
 * would cost more than regenerating the handful of faces it would save.
 */
export function cachedProfile(
  seed: string,
  position: string,
  age: number,
  heritage: readonly string[] | null,
  overrides: AvatarOverrides | null = null,
): AvatarProfile {
  // An edited face is not cached. Overrides arrive as an object that is a new
  // reference every render, so it cannot be part of a key without defeating
  // the cache -- and an edited player is one player on one screen, not a list.
  if (overrides !== null) {
    return generateAvatar({ seed, position, age, heritage, overrides });
  }
  const key = keyFor(seed, position, age, heritage);
  const hit = store.get(key);
  if (hit !== undefined) return hit;

  const profile = generateAvatar({ seed, position, age, heritage });
  store.set(key, profile);
  if (store.size > CAPACITY) {
    const oldest = store.keys().next();
    if (!oldest.done) store.delete(oldest.value);
  }
  return profile;
}

/** For the lab, which generates hundreds of throwaway faces and should not
 *  push a real roster out of the cache to do it. */
export function clearAvatarCache(): void {
  store.clear();
}

/** What the cache is holding, for the lab's readout. */
export const avatarCacheSize = (): number => store.size;
