// The persisted selection plus the same roster fallback the week runner uses.
// Reads never repair a chart. A GM explicitly saves it or asks for auto-order.
import type { Db } from './db.ts';
import type { SaveRow } from './save.ts';
import { ApiError } from './context.ts';
import { loadEngineState } from './saveStore.ts';
import { defaultDepthChart, readDepthChart, type DepthChart } from './project/depthChart.ts';
import { weeksOut } from './project/stats.ts';
import { POSITION_GROUPS, type PositionGroup } from '../engine/types.ts';
import { positionGroup } from './positionGroup.ts';

export interface DepthPlayer {
  readonly player_id: string; readonly display_name: string; readonly position: string;
  readonly age: number; readonly overall_rating: number; readonly roster_status: string;
}

export async function depthState(db: Db, save: SaveRow) {
  const [stored, state, players, out] = await Promise.all([
    readDepthChart(db, save.id, save.user_team_id), loadEngineState(db, save.id),
    db<DepthPlayer[]>`
      select r.player_id, p.display_name, p.position, p.age, p.overall_rating, r.roster_status
        from public.team_rosters r left join public.players p
          on p.save_id = r.save_id and p.player_id = r.player_id
       where r.save_id = ${save.id} and r.team_id = ${save.user_team_id}
       order by r.player_id`,
    weeksOut(db, save.id, save.season, save.week, save.user_team_id),
  ]);
  const automatic = defaultDepthChart(state.league, save.user_team_id);
  const byId = new Map(players.map((p) => [p.player_id, p]));
  for (const p of players) {
    const group = positionGroup(p.position);
    if (group === undefined || !automatic[group].includes(p.player_id)
      || typeof p.display_name !== 'string' || !Number.isFinite(p.age)
      || !Number.isFinite(p.overall_rating) || typeof p.roster_status !== 'string') {
      throw new Error(`Missing authoritative depth-chart data for player ${p.player_id}.`);
    }
  }
  const chart = {} as Record<PositionGroup, readonly string[]>;
  for (const group of POSITION_GROUPS) {
    if (automatic[group].some((id) => !byId.has(id))) {
      throw new Error(`The ${group} roster and simulation state disagree. Reload or report this save.`);
    }
    const chosen = [...new Set(stored[group].filter((id) => automatic[group].includes(id)))];
    chart[group] = [...chosen, ...automatic[group].filter((id) => !chosen.includes(id))];
  }
  // Includes membership, saved order, phase and availability: stale tabs must
  // review a fresh read before overwriting another decision or changed roster.
  const revision = JSON.stringify([stored, chart, save.phase, save.week, players, [...out].sort()]);
  return { stored, chart: chart as DepthChart, automatic, players, byId, out, revision };
}

export function requireDepthRevision(expected: string | undefined, current: string): void {
  // Optional for the original roster client. The dedicated chart always sends it.
  if (expected !== undefined && expected !== current) {
    throw new ApiError(409, 'stale_depth_chart', 'The roster, injuries or depth chart changed. Review the refreshed chart and try again.');
  }
}
