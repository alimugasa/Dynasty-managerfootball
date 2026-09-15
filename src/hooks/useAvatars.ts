// Faces for the players a screen is already showing.
//
// A screen calls this with the ids it has just rendered rows for, and gets a
// map back. The ids are sorted before they become the query key so that a list
// re-sorted by the sort control does not re-fetch identical data under a new
// key -- the faces are the same faces however the rows are ordered.

import { useMemo } from 'react';
import { useSave } from '../app/SaveProvider';
import { useQuery } from './useQuery';

export interface AvatarFacts {
  readonly seed: string;
  readonly position: string;
  readonly age: number;
  readonly heritage: readonly string[] | null;
}

interface AvatarsOut {
  readonly rows: readonly (AvatarFacts & { readonly playerId: string })[];
}

/** Long enough for any list this app shows at once, and the server refuses
 *  more. Trimming here rather than letting the call fail keeps a screen that
 *  grew a longer list from breaking outright: the tail falls back to initials,
 *  which is a degradation a person can look at. */
const MAX_IDS = 400;

export interface AvatarMap {
  readonly get: (playerId: string) => AvatarFacts | null;
  readonly loading: boolean;
}

const EMPTY: AvatarMap = { get: () => null, loading: false };

/**
 * A lookup of face data, keyed by player id.
 *
 * Returns nulls rather than throwing while the read is in flight or if it
 * fails: a portrait is decoration on every screen that shows one, and a roster
 * that refused to render because a face could not be fetched would be a worse
 * failure than a roster of initials. The rows themselves still come from their
 * own read, which does throw.
 */
export function useAvatars(playerIds: readonly string[]): AvatarMap {
  const { save, version } = useSave();
  const saveId = save?.saveId ?? null;
  const ids = useMemo(
    () => [...new Set(playerIds)].sort((a, b) => a.localeCompare(b)).slice(0, MAX_IDS),
    [playerIds],
  );
  const enabled = saveId !== null && ids.length > 0;
  const query = useQuery<AvatarsOut>(
    'avatars', { saveId, playerIds: ids }, version, enabled,
  );

  return useMemo(() => {
    if (!enabled) return EMPTY;
    const rows = query.data?.rows;
    if (rows === undefined) return { get: () => null, loading: query.status === 'loading' };
    const byId = new Map(rows.map((r) => [r.playerId, r]));
    return { get: (playerId) => byId.get(playerId) ?? null, loading: false };
  }, [enabled, query.data, query.status]);
}
