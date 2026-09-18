import { requireCamp, requireCutPreview } from '../data/camp';
import { useQuery, type Query } from './useQuery';
import type { CampOut } from '../../supabase/functions/_shared/api/reads/camp';
import type { CutOutcome } from '../../supabase/functions/_shared/api/handlers/campMoves';

/** Validate the authoritative read before any camp actions become available. */
export function useCamp(saveId: string | undefined, version: number, enabled: boolean): Query<CampOut> {
  const query = useQuery<CampOut>('camp', { saveId }, version, enabled);
  return validated(query, requireCamp);
}

export function useCutPreview(saveId: string | undefined, playerId: string, version: number): Query<CutOutcome> {
  const query = useQuery<CutOutcome>('preview-cut', { saveId, playerId }, version, saveId !== undefined);
  return validated(query, requireCutPreview);
}

function validated<T>(query: Query<T>, read: (data: T) => T): Query<T> {
  if (query.status !== 'ready') return query;
  try {
    return { ...query, data: read(query.data) };
  } catch (error: unknown) {
    return { status: 'error', data: null, retry: query.retry,
      error: error instanceof Error ? error : new Error(String(error)) };
  }
}
