// Roster index.
//
// legacy/ENGINE.md records that eight-season runs of the reference engine would
// not complete, because checking cap space rescanned all ~1,700 players on every
// call inside the free-agency bid loop. Thirty-two clubs bidding on a thousand
// free agents turns a linear scan into a hundred million operations. This engine
// reproduced the same hang on its first run, for the same reason.
//
// The fix there, and here, is an index behind a single mutation point. Nothing
// assigns `player.teamId` directly; everything goes through setTeam, so the
// index cannot drift out of sync with the players it describes. That constraint
// is the whole value of this module -- an index maintained in several places is
// worse than no index at all.

import type { CareerPlayer } from './types.ts';
import type { PositionGroup } from '../types.ts';

export interface RosterIndex {
  readonly byTeam: Map<string, CareerPlayer[]>;
  readonly free: Set<CareerPlayer>;
}

export function buildIndex(
  teamIds: readonly string[], players: readonly CareerPlayer[],
): RosterIndex {
  const byTeam = new Map<string, CareerPlayer[]>();
  for (const teamId of teamIds) byTeam.set(teamId, []);
  const free = new Set<CareerPlayer>();

  for (const player of players) {
    if (player.retired) continue;
    if (player.teamId === null) free.add(player);
    else byTeam.get(player.teamId)?.push(player);
  }
  return { byTeam, free };
}

/** The only place a player's club changes. */
export function setTeam(
  index: RosterIndex, player: CareerPlayer, teamId: string | null,
): void {
  const from = player.teamId;
  if (from === teamId) return;

  if (from === null) index.free.delete(player);
  else {
    const held = index.byTeam.get(from);
    if (held !== undefined) {
      const at = held.indexOf(player);
      if (at >= 0) held.splice(at, 1);
    }
    player.previousTeamId = from;
  }

  player.teamId = teamId;
  if (teamId === null) index.free.add(player);
  else index.byTeam.get(teamId)?.push(player);
}

export function roster(index: RosterIndex, teamId: string): CareerPlayer[] {
  return index.byTeam.get(teamId) ?? [];
}

export function available(index: RosterIndex): CareerPlayer[] {
  return [...index.free];
}

/** Best unsigned player at a group, or undefined if the pool is empty. */
export function bestAvailable(
  index: RosterIndex, group: PositionGroup,
): CareerPlayer | undefined {
  let best: CareerPlayer | undefined;
  for (const player of index.free) {
    if (player.group !== group) continue;
    if (best === undefined || player.ability > best.ability) best = player;
  }
  return best;
}

/** Retires a player and takes him out of circulation entirely. */
export function retireFrom(index: RosterIndex, player: CareerPlayer): void {
  setTeam(index, player, null);
  index.free.delete(player);
}
