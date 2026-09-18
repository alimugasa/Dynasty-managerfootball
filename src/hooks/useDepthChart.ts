import { useEffect } from 'react';
import { requireDepthChart } from '../data/depthChart';
import { useQuery, type Query } from './useQuery';
import type { DepthChartOut } from '../../supabase/functions/_shared/api/reads/depthChartTypes';

export function useDepthChart(saveId: string | undefined, version: number): Query<DepthChartOut> {
  const q = useQuery<DepthChartOut>('depth-chart', { saveId }, version, saveId !== undefined);
  const retry = q.retry;
  useEffect(() => {
    const refresh = (): void => { if (document.visibilityState === 'visible') retry(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [retry]);
  if (q.status !== 'ready') return q;
  try { return { ...q, data: requireDepthChart(q.data) }; }
  catch (error: unknown) {
    return { status: 'error', data: null, retry: q.retry,
      error: error instanceof Error ? error : new Error(String(error)) };
  }
}
