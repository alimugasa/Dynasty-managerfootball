// Deterministic team builders for the engine tests. Built from a seed so a
// fixture is itself reproducible: a test that fails must fail the same way twice.

import { createRng } from '../../supabase/functions/_shared/engine/rng.ts';
import {
  POSITION_GROUPS,
  type EnginePlayer,
  type PositionGroup,
  type TeamState,
} from '../../supabase/functions/_shared/engine/types.ts';

/** Roster depth per group: starters plus realistic backups. */
const DEPTH: Readonly<Record<PositionGroup, number>> = {
  QB: 3, RB: 4, WR: 6, TE: 3, OL: 9,
  EDGE: 4, DT: 4, LB: 6, CB: 6, S: 4,
  K: 1, P: 1, LS: 1,
};

export interface TeamSpec {
  readonly id: string;
  readonly abbreviation: string;
  /** Mean overall rating for the whole roster. */
  readonly baseRating?: number;
  /** Per-group overrides, applied to starters and backups alike. */
  readonly groupRatings?: Partial<Record<PositionGroup, number>>;
  readonly seed?: number;
  readonly stamina?: number;
  readonly durability?: number;
  readonly runPassBalance?: number;
  readonly tempo?: number;
}

export function buildTeam(spec: TeamSpec): TeamState {
  const rng = createRng(spec.seed ?? 1);
  const base = spec.baseRating ?? 72;
  const players: EnginePlayer[] = [];
  const depthChart: Record<PositionGroup, string[]> = {
    QB: [], RB: [], WR: [], TE: [], OL: [],
    EDGE: [], DT: [], LB: [], CB: [], S: [], K: [], P: [], LS: [],
  };

  for (const group of POSITION_GROUPS) {
    const groupBase = spec.groupRatings?.[group] ?? base;
    for (let i = 0; i < DEPTH[group]; i += 1) {
      // Backups are worse, which is what makes an injury cost something.
      const dropoff = i * 4.5;
      const overall = Math.max(40, Math.min(99, Math.round(groupBase - dropoff + rng.normal(0, 2))));
      const id = `${spec.id}_${group}_${i + 1}`;
      players.push({
        id,
        name: `${group}${i + 1} ${spec.abbreviation}`,
        group,
        ratings: { overall },
        durability: spec.durability ?? 75,
        stamina: spec.stamina ?? 75,
      });
      depthChart[group].push(id);
    }
  }

  return {
    id: spec.id,
    abbreviation: spec.abbreviation,
    players,
    depthChart,
    scheme: {
      runPassBalance: spec.runPassBalance ?? 0.445,
      blitzRate: 0.26,
      fourthDownAggression: 50,
      tempo: spec.tempo ?? 50,
    },
    coaching: {
      playCalling: 65, gameManagement: 65, clockManagement: 65, aggressiveness: 50,
    },
  };
}

/** Two evenly matched average clubs, the baseline for calibration. */
export function averageMatchup(seed = 7): { home: TeamState; away: TeamState } {
  return {
    home: buildTeam({ id: 'HME', abbreviation: 'HME', seed }),
    away: buildTeam({ id: 'AWY', abbreviation: 'AWY', seed: seed + 1000 }),
  };
}
