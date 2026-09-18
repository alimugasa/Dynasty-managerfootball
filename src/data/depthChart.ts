import { MissingData, required } from './errors';
import type { DepthChartOut } from '../../supabase/functions/_shared/api/reads/depthChartTypes';

export function requireDepthChart(data: DepthChartOut): DepthChartOut {
  const ctx = { table: 'depth-chart', screen: 'depthChart' };
  const missing = (column: string): never => { throw new MissingData({ ...ctx, column }); };
  required(data, ctx);
  for (const key of ['revision', 'phase', 'action'] as const) {
    if (typeof data[key] !== 'string' || data[key] === '') missing(key);
  }
  for (const key of ['season', 'week', 'rosterCount', 'rosterTarget', 'startersSet', 'startingPlaces', 'injuredStarters'] as const) {
    if (!Number.isFinite(data[key])) missing(key);
  }
  for (const key of ['canFinalize', 'countEnforced', 'chartSaved'] as const) {
    if (typeof data[key] !== 'boolean') missing(key);
  }
  for (const key of ['groups', 'warnings', 'blockers'] as const) if (!Array.isArray(data[key])) missing(key);
  if (data.groups.length === 0) missing('groups');
  if (data.rosterFault === undefined || data.nextGame === undefined) missing('readiness');
  for (const g of data.groups) {
    required(g.group, { ...ctx, column: 'group' });
    if (!Array.isArray(g.order) || !Array.isArray(g.warnings)) missing(g.group);
    for (const key of ['startingPlaces', 'available', 'startersSet', 'injuredStarters'] as const) {
      if (!Number.isFinite(g[key])) missing(g.group + '.' + key);
    }
    if (typeof g.needsSave !== 'boolean') missing(g.group + '.needsSave');
    for (const p of g.order) {
      for (const key of ['playerId', 'name', 'position', 'role', 'rosterStatus'] as const) required(p[key], { ...ctx, column: key });
      for (const key of ['age', 'overall', 'rank'] as const) if (!Number.isFinite(p[key])) missing(key);
      if (p.out !== null && !Number.isFinite(p.out)) missing('out');
      if (typeof p.persisted !== 'boolean') missing('persisted');
    }
  }
  return data;
}
