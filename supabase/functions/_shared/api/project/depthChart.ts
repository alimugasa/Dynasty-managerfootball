// The user's depth chart, in team_depth_charts.
//
// The engine orders a squad per position group; the seed's chart names finer
// slots (WR_X, WR_Z, NICKEL). Mapping one onto the other would be invention, so
// the engine's own vocabulary is stored: the slot is the group, and the order
// is the order the engine plays. The seed's rows for the managed club are
// replaced; every other club's stay, and the engine orders those clubs itself.

import type { Db } from '../db.ts';
import { POSITION_GROUPS, STARTERS, type PositionGroup } from '../../engine/types.ts';
import { teamStateFor } from '../../engine/careerBridge.ts';
import type { League } from '../../engine/offseason/index.ts';
import { ENGINE_DATA_CLASS, positionsFor } from './players.ts';

const UNIT_OF: Readonly<Record<PositionGroup, string>> = {
  QB: 'Offense', RB: 'Offense', WR: 'Offense', TE: 'Offense', OL: 'Offense',
  EDGE: 'Defense', DT: 'Defense', LB: 'Defense', CB: 'Defense', S: 'Defense',
  K: 'Special Teams', P: 'Special Teams', LS: 'Special Teams',
};

export type DepthChart = Readonly<Record<PositionGroup, readonly string[]>>;

export function defaultDepthChart(league: League, teamId: string): DepthChart {
  return teamStateFor(teamId, league.players, { fronts: league.fronts }).depthChart;
}

export async function writeDepthChart(
  db: Db, saveId: string, teamId: string, chart: DepthChart,
): Promise<void> {
  const positions = await positionsFor(db, saveId);
  const rows: { unit: string; slot: string; order: number; playerId: string; position: string }[] = [];
  for (const group of POSITION_GROUPS) {
    (chart[group] ?? []).forEach((playerId, i) => {
      rows.push({
        unit: UNIT_OF[group], slot: group, order: i + 1, playerId,
        position: positions.get(playerId)?.position ?? group,
      });
    });
  }
  await db`delete from public.team_depth_charts where save_id = ${saveId} and team_id = ${teamId}`;
  if (rows.length === 0) return;
  await db`
    insert into public.team_depth_charts (
      save_id, team_id, unit, slot, depth_order, slot_position, player_id,
      player_position, is_starter, data_class)
    select ${saveId}, ${teamId}, u.unit, u.slot, u.depth_order, u.slot, u.player_id,
           u.player_position, u.depth_order <= u.starters, ${ENGINE_DATA_CLASS}
      from unnest(
        ${rows.map((r) => r.unit)}::text[],
        ${rows.map((r) => r.slot)}::text[],
        ${rows.map((r) => r.order)}::int[],
        ${rows.map((r) => r.playerId)}::text[],
        ${rows.map((r) => r.position)}::text[],
        ${rows.map((r) => STARTERS[r.slot as PositionGroup])}::int[]
      ) as u(unit, slot, depth_order, player_id, player_position, starters)`;
}

/** The stored order per group. A group with no rows is empty, and the engine
 *  fills it from the roster in its own order. */
export async function readDepthChart(db: Db, saveId: string, teamId: string): Promise<DepthChart> {
  const rows = await db<{ slot: string; player_id: string | null }[]>`
    select slot, player_id from public.team_depth_charts
     where save_id = ${saveId} and team_id = ${teamId}
       and slot = any(${[...POSITION_GROUPS]}::text[])
     order by slot, depth_order`;
  const chart = {} as Record<PositionGroup, string[]>;
  for (const group of POSITION_GROUPS) chart[group] = [];
  for (const row of rows) {
    if (row.player_id === null) continue;
    chart[row.slot as PositionGroup].push(row.player_id);
  }
  return chart;
}
