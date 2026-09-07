// Per-game mutable state for one team: who is available, how many snaps each
// player has taken, and how tired that has made them.
//
// This is the only mutable structure in the engine and it never escapes
// simulateGame(). The TeamState passed in is treated as immutable and is never
// written to, so a caller can simulate the same fixture twice from one input.

import { CALIBRATION } from './calibration.ts';
import {
  MissingUnitError,
  STARTERS,
  type EnginePlayer,
  type PositionGroup,
  type SkillKey,
  type TeamState,
} from './types.ts';

export interface TeamRuntime {
  readonly team: TeamState;
  readonly byId: ReadonlyMap<string, EnginePlayer>;
  /** Player ids removed from the game by injury. */
  readonly unavailable: Set<string>;
  /** Total snaps played, for the box score. */
  readonly snaps: Map<string, number>;
  /** Snaps since the last recovery credit, for fatigue. */
  readonly load: Map<string, number>;
}

export function createRuntime(team: TeamState): TeamRuntime {
  const byId = new Map<string, EnginePlayer>();
  for (const player of team.players) byId.set(player.id, player);
  return {
    team,
    byId,
    unavailable: new Set<string>(),
    snaps: new Map<string, number>(),
    load: new Map<string, number>(),
  };
}

/**
 * Where a team turns when a group is wiped out mid-game.
 *
 * A club that loses both tight ends plays a fourth receiver; one that loses both
 * safeties plays a third corner. That is what actually happens, and refusing to
 * model it would turn an unlucky game into a crash. The groups deliberately
 * absent from this map -- QB, OL, K, P -- have no such answer: a team with no
 * available quarterback or no fifth lineman is a data defect, and
 * MissingUnitError still reports it rather than inventing a body.
 */
const EMERGENCY_FALLBACK: Partial<Record<PositionGroup, PositionGroup>> = {
  TE: 'WR', WR: 'TE', RB: 'WR',
  EDGE: 'DT', DT: 'EDGE', LB: 'S', S: 'CB', CB: 'S',
};

/** Out-of-position players are worse at the job. */
const OUT_OF_POSITION_PENALTY = 0.88;

/** Depth-ordered available players in a group, starters first. */
export function availableIn(runtime: TeamRuntime, group: PositionGroup): EnginePlayer[] {
  const ids = runtime.team.depthChart[group] ?? [];
  const out: EnginePlayer[] = [];
  for (const id of ids) {
    if (runtime.unavailable.has(id)) continue;
    const player = runtime.byId.get(id);
    if (player !== undefined) out.push(player);
  }
  return out;
}

/**
 * Available players in a group, falling back to the deepest body from a related
 * group when the group is empty. One hop only, so a mutual pair such as WR/TE
 * cannot recurse.
 */
export function fieldableIn(runtime: TeamRuntime, group: PositionGroup): EnginePlayer[] {
  const direct = availableIn(runtime, group);
  if (direct.length > 0) return direct;

  const fallback = EMERGENCY_FALLBACK[group];
  if (fallback === undefined) throw new MissingUnitError(runtime.team.id, group);

  const pool = availableIn(runtime, fallback);
  const spare = pool[pool.length - 1];
  if (spare === undefined) throw new MissingUnitError(runtime.team.id, group);
  return [{
    ...spare,
    ratings: { ...spare.ratings, overall: spare.ratings.overall * OUT_OF_POSITION_PENALTY },
  }];
}

/** The player currently first on the depth chart for a group. Throws rather
 *  than inventing a replacement-level stand-in for groups with no fallback. */
export function starterOf(runtime: TeamRuntime, group: PositionGroup): EnginePlayer {
  const first = fieldableIn(runtime, group)[0];
  if (first === undefined) throw new MissingUnitError(runtime.team.id, group);
  return first;
}

/** A skill rating, falling back to `overall` when the detailed rating is absent.
 *  Documented substitution, declared on PlayerRatings. */
export function rawSkill(player: EnginePlayer, skill: SkillKey): number {
  const detailed = player.ratings[skill];
  return detailed === undefined ? player.ratings.overall : detailed;
}

/** How many rating points this player has lost to fatigue right now. */
export function fatiguePenalty(runtime: TeamRuntime, player: EnginePlayer): number {
  const { fatigue } = CALIBRATION;
  const load = runtime.load.get(player.id) ?? 0;
  const fresh = fatigue.freshSnapsBase + player.stamina * fatigue.freshSnapsPerStamina;
  if (load <= fresh) return 0;
  const over = load - fresh;
  const penalty = over * fatigue.declinePerSnap;
  return penalty > fatigue.maxPenalty ? fatigue.maxPenalty : penalty;
}

/** A skill rating after fatigue. Never drops below 1, so a gassed unit is bad
 *  rather than nonsensical. */
export function effectiveSkill(
  runtime: TeamRuntime,
  player: EnginePlayer,
  skill: SkillKey,
): number {
  const value = rawSkill(player, skill) - fatiguePenalty(runtime, player);
  return value < 1 ? 1 : value;
}

/** Credit a snap to everyone on the field. Drives both fatigue and the snap
 *  counts that appear in the box score. */
export function chargeSnaps(runtime: TeamRuntime, players: readonly EnginePlayer[]): void {
  for (const player of players) {
    runtime.snaps.set(player.id, (runtime.snaps.get(player.id) ?? 0) + 1);
    runtime.load.set(player.id, (runtime.load.get(player.id) ?? 0) + 1);
  }
}

/** Called when a team's unit leaves the field. Rest is what makes fatigue a
 *  cost of staying on the field rather than a monotonic decay to zero. */
export function recover(runtime: TeamRuntime): void {
  const { recoveryPerPossession } = CALIBRATION.fatigue;
  for (const [id, load] of runtime.load) {
    const player = runtime.byId.get(id);
    const scale = player === undefined ? 1 : 0.6 + player.stamina / 165;
    const next = load - recoveryPerPossession * scale;
    runtime.load.set(id, next < 0 ? 0 : next);
  }
}

/** Remove a player for the rest of the game. */
export function sideline(runtime: TeamRuntime, playerId: string): void {
  runtime.unavailable.add(playerId);
}

/** The eleven on the field for a snap, used for snap charging and injury rolls.
 *  Built from the depth chart in group order so the sequence of injury rolls is
 *  identical for identical inputs. */
export function unitOnField(
  runtime: TeamRuntime,
  groups: readonly PositionGroup[],
): EnginePlayer[] {
  const out: EnginePlayer[] = [];
  for (const group of groups) {
    const available = fieldableIn(runtime, group);
    const needed = STARTERS[group];
    if (available.length === 0) throw new MissingUnitError(runtime.team.id, group);
    for (let i = 0; i < needed; i += 1) {
      // A thin group doubles up its last available body rather than fielding
      // ten men. That is what actually happens, and it is visible in the snap
      // counts afterwards.
      const player = available[i] ?? available[available.length - 1];
      if (player !== undefined) out.push(player);
    }
  }
  return out;
}

export const OFFENSE_GROUPS: readonly PositionGroup[] = ['QB', 'RB', 'WR', 'TE', 'OL'];
export const DEFENSE_GROUPS: readonly PositionGroup[] = ['EDGE', 'DT', 'LB', 'CB', 'S'];
