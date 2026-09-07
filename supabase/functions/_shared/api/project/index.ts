// Everything that turns the engine's document into rows a client may read.

export { projectPlayers, positionsFor, ENGINE_DATA_CLASS, type PlayerProjectionContext } from './players.ts';
export { projectContracts, projectSalaryCap } from './contracts.ts';
export { defaultDepthChart, readDepthChart, writeDepthChart, type DepthChart } from './depthChart.ts';

import type { Db } from '../db.ts';
import type { League } from '../../engine/offseason/index.ts';
import { projectPlayers, type PlayerProjectionContext } from './players.ts';
import { projectContracts } from './contracts.ts';

/** Players, rosters, free agents, contracts and the cap sheet, in that order:
 *  contracts reference players, and the cap sheet reads contracts. */
export async function projectWorld(
  db: Db, saveId: string, league: League, ctx: PlayerProjectionContext = {},
): Promise<void> {
  await projectPlayers(db, saveId, league, ctx);
  await projectContracts(db, saveId, league);
}

/** A season's opening table: every club at 0-0-0. Explicit zeros, because at
 *  week one they are the truth rather than a default. */
export async function seedStandings(
  db: Db, saveId: string, season: number, teamIds: readonly string[],
): Promise<void> {
  await db`
    insert into public.standings (
      save_id, season, team_id, wins, losses, ties, win_pct, points_for, points_against,
      division_wins, division_losses, division_ties,
      conference_wins, conference_losses, conference_ties, streak)
    select ${saveId}, ${season}, t, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, null
      from unnest(${[...teamIds]}::text[]) as t
    on conflict (save_id, season, team_id) do nothing`;
}
