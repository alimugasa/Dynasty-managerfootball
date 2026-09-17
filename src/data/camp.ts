import { MissingData, required } from './errors';
import type { CampOut } from '../../supabase/functions/_shared/api/reads/camp';
import type { CutOutcome } from '../../supabase/functions/_shared/api/handlers/campMoves';

/** A stale/incomplete read must not look like an empty, legal camp. */
export function requireCamp(data: CampOut): CampOut {
  const context = { table: 'camp', screen: 'camp' };
  for (const key of ['players', 'groups', 'battles', 'movers', 'injuries', 'fixtures',
    'depthWarnings', 'availabilityWarnings'] as const) {
    if (!Array.isArray(required(data[key], { ...context, column: key }))) {
      throw new MissingData({ ...context, column: key });
    }
  }
  for (const key of ['rosterCount', 'rosterLimit', 'campLimit', 'cutsRemaining', 'season'] as const) {
    if (!Number.isFinite(required(data[key], { ...context, column: key }))) {
      throw new MissingData({ ...context, column: key });
    }
  }
  const progress = required(data.progress, { ...context, column: 'progress' });
  required(progress.active, { ...context, column: 'progress.active' });
  for (const key of ['finalizeFault', 'advanceFault', 'advanceRoute', 'advanceLabel'] as const) {
    if (progress[key] === undefined) throw new MissingData({ ...context, column: 'progress.' + key });
  }
  required(data.preseasonRecord, { ...context, column: 'preseasonRecord' });
  for (const p of data.players) {
    required(p.name, { ...context, column: 'name', id: p.playerId });
    for (const key of ['overall', 'age', 'practiceGrade'] as const) {
      if (!Number.isFinite(p[key])) throw new MissingData({ ...context, column: key, id: p.playerId });
    }
    for (const key of ['capHit', 'deadMoney', 'preseasonGrade', 'probability'] as const) {
      if (p[key] !== null && !Number.isFinite(p[key])) {
        throw new MissingData({ ...context, column: key, id: p.playerId });
      }
    }
  }
  return data;
}

export function requireCutPreview(data: CutOutcome): CutOutcome {
  const context = { table: 'preview-cut', screen: 'camp' };
  for (const key of ['name', 'position', 'playerId'] as const) required(data[key], { ...context, column: key });
  for (const key of ['age', 'capHit', 'deadMoney', 'capSavings', 'rosterBefore', 'rosterAfter', 'rosterLimit', 'cutsRemaining'] as const) {
    if (!Number.isFinite(data[key])) throw new MissingData({ ...context, column: key });
  }
  required(data.waivers, { ...context, column: 'waivers' });
  return data;
}
