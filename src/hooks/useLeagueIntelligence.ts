import { useSave } from '../app/SaveProvider';
import { requireIntelligence } from '../data/leagueIntelligence';
import { useQuery, type Query } from './useQuery';
import type { LeagueIntelligenceOut } from '../../supabase/functions/_shared/api/reads/leagueIntelligence';
export function useLeagueIntelligence(): Query<LeagueIntelligenceOut> {
  const { save, version } = useSave();
  const q = useQuery<LeagueIntelligenceOut>('league-intelligence', { saveId: save?.saveId }, version, save !== null);
  if (q.status !== 'ready') return q;
  try { return { ...q, data: requireIntelligence(q.data) }; }
  catch (error: unknown) { return { status: 'error', data: null, retry: q.retry,
    error: error instanceof Error ? error : new Error(String(error)) }; }
}
