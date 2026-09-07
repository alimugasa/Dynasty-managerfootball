// Turns the merged sample into metric values and compares each against its
// target. Computes only; the decision to change a constant is the reader's.

import { summarize, shareWhere, type Summary } from './stats.ts';
import { TARGETS, type Target } from './targets.ts';
import type { ShardResult } from './payload.ts';

export interface MetricResult {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly low: number;
  readonly high: number;
  readonly unit: string;
  readonly status: 'ok' | 'below' | 'above';
  /** Signed distance outside the range, as a fraction of the range midpoint. */
  readonly deviation: number;
  readonly tuning: readonly string[];
}

export interface Merged {
  readonly seasons: number;
  readonly points: Int16Array;
  readonly yards: Int16Array;
  readonly passYards: Int16Array;
  readonly rushYards: Int16Array;
  readonly passAttempts: Int16Array;
  readonly rushes: Int16Array;
  readonly gameInjuries: Int16Array;
  readonly wins: Int16Array;
  readonly teamPassYards: Int16Array;
  readonly teamTotalYards: Int16Array;
  readonly leaderPassYards: Int16Array;
  readonly leaderRushYards: Int16Array;
  readonly leaderRecYards: Int16Array;
  readonly leaderPassTds: Int16Array;
  readonly leaderSacks: Int16Array;
  readonly recordGamePassYards: Int16Array;
  readonly recordGameRushYards: Int16Array;
  readonly seasonInjuries: Int16Array;
  readonly seasonEnding: Int16Array;
  readonly playerGamesLost: Int16Array;
  readonly homeWins: number;
  readonly decidedGames: number;
  readonly abandonedGames: number;
  readonly abandonedByGroup: Readonly<Record<string, number>>;
  readonly teamsPerSeason: number;
}

export interface Distributions {
  readonly points: Summary;
  readonly yards: Summary;
  readonly passYards: Summary;
  readonly rushYards: Summary;
  readonly rushes: Summary;
  readonly passAttempts: Summary;
  readonly wins: Summary;
  readonly gameInjuries: Summary;
  readonly leaderPassYards: Summary;
  readonly leaderRushYards: Summary;
  readonly leaderRecYards: Summary;
  readonly leaderPassTds: Summary;
  readonly leaderSacks: Summary;
  readonly recordGamePassYards: Summary;
  readonly recordGameRushYards: Summary;
  readonly playerGamesLost: Summary;
  readonly seasonEnding: Summary;
}

export function merge(shards: readonly ShardResult[], teamsPerSeason: number): Merged {
  const concatInt16 = (pick: (s: ShardResult) => Int16Array): Int16Array => {
    let length = 0;
    for (const shard of shards) length += pick(shard).length;
    const out = new Int16Array(length);
    let offset = 0;
    for (const shard of shards) {
      const part = pick(shard);
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  };

  return {
    seasons: shards.reduce((a, s) => a + s.seasons, 0),
    points: concatInt16((s) => s.points),
    yards: concatInt16((s) => s.yards),
    passYards: concatInt16((s) => s.passYards),
    rushYards: concatInt16((s) => s.rushYards),
    passAttempts: concatInt16((s) => s.passAttempts),
    rushes: concatInt16((s) => s.rushes),
    gameInjuries: concatInt16((s) => s.gameInjuries),
    wins: concatInt16((s) => s.wins),
    teamPassYards: concatInt16((s) => s.teamPassYards),
    teamTotalYards: concatInt16((s) => s.teamTotalYards),
    leaderPassYards: concatInt16((s) => s.leaderPassYards),
    leaderRushYards: concatInt16((s) => s.leaderRushYards),
    leaderRecYards: concatInt16((s) => s.leaderRecYards),
    leaderPassTds: concatInt16((s) => s.leaderPassTds),
    leaderSacks: concatInt16((s) => s.leaderSacks),
    recordGamePassYards: concatInt16((s) => s.recordGamePassYards),
    recordGameRushYards: concatInt16((s) => s.recordGameRushYards),
    seasonInjuries: concatInt16((s) => s.seasonInjuries),
    seasonEnding: concatInt16((s) => s.seasonEnding),
    playerGamesLost: concatInt16((s) => s.playerGamesLost),
    homeWins: shards.reduce((a, s) => a + s.homeWins, 0),
    decidedGames: shards.reduce((a, s) => a + s.decidedGames, 0),
    abandonedGames: shards.reduce((a, s) => a + s.abandonedGames, 0),
    abandonedByGroup: shards.reduce<Record<string, number>>((acc, shard) => {
      for (const [group, count] of Object.entries(shard.abandonedByGroup)) {
        acc[group] = (acc[group] ?? 0) + count;
      }
      return acc;
    }, {}),
    teamsPerSeason,
  };
}

export function distributions(m: Merged): Distributions {
  return {
    points: summarize(m.points),
    yards: summarize(m.yards),
    passYards: summarize(m.passYards),
    rushYards: summarize(m.rushYards),
    rushes: summarize(m.rushes),
    passAttempts: summarize(m.passAttempts),
    wins: summarize(m.wins),
    gameInjuries: summarize(m.gameInjuries),
    leaderPassYards: summarize(m.leaderPassYards),
    leaderRushYards: summarize(m.leaderRushYards),
    leaderRecYards: summarize(m.leaderRecYards),
    leaderPassTds: summarize(m.leaderPassTds),
    leaderSacks: summarize(m.leaderSacks),
    recordGamePassYards: summarize(m.recordGamePassYards),
    recordGameRushYards: summarize(m.recordGameRushYards),
    playerGamesLost: summarize(m.playerGamesLost),
    seasonEnding: summarize(m.seasonEnding),
  };
}

/**
 * Mean across seasons of (best club / worst club) for a per-club season total.
 * Computed per season rather than over the pooled sample, because pooling would
 * mix season-to-season noise into what is meant to measure the gap within one
 * league year.
 */
function bestOverWorstRatio(values: Int16Array, teamsPerSeason: number): number {
  const seasons = Math.floor(values.length / teamsPerSeason);
  let total = 0;
  let counted = 0;
  for (let s = 0; s < seasons; s += 1) {
    let best = -Infinity;
    let worst = Infinity;
    for (let t = 0; t < teamsPerSeason; t += 1) {
      const v = values[s * teamsPerSeason + t] as number;
      if (v > best) best = v;
      if (v < worst) worst = v;
    }
    if (worst > 0) { total += best / worst; counted += 1; }
  }
  return counted === 0 ? NaN : total / counted;
}

function sum(values: ArrayLike<number>): number {
  let total = 0;
  for (let i = 0; i < values.length; i += 1) total += values[i] as number;
  return total;
}

function judge(key: string, value: number, overrides: Record<string, Target>): MetricResult {
  const target = overrides[key] ?? TARGETS[key];
  if (target === undefined) throw new Error(`No target defined for metric "${key}"`);
  const midpoint = (target.low + target.high) / 2 || 1;
  const status = value < target.low ? 'below' : value > target.high ? 'above' : 'ok';
  const distance = status === 'below'
    ? value - target.low
    : status === 'above' ? value - target.high : 0;
  return {
    key,
    label: target.label,
    value,
    low: target.low,
    high: target.high,
    unit: target.unit,
    status,
    deviation: distance / midpoint,
    tuning: target.tuning,
  };
}

export function evaluate(
  m: Merged, d: Distributions, overrides: Record<string, Target> = {},
): MetricResult[] {
  const seasons = m.seasons;
  const teams = m.teamsPerSeason;
  const at = (key: string, value: number): MetricResult => judge(key, value, overrides);

  return [
    at('points.mean', d.points.mean),
    at('points.sd', d.points.sd),
    at('points.p95', d.points.p95),
    at('points.max', d.points.max),
    at('shutouts.share', shareWhere(m.points, (v) => v === 0)),

    at('yards.mean', d.yards.mean),
    at('yards.sd', d.yards.sd),
    at('yards.p05', d.yards.p05),
    at('yards.p95', d.yards.p95),

    at('split.passYardShare', sum(m.passYards) / sum(m.yards)),
    at('split.passPlayShare', sum(m.passAttempts) / (sum(m.passAttempts) + sum(m.rushes))),
    at('split.rushAttempts', d.rushes.mean),

    at('spread.passYardsRatio', bestOverWorstRatio(m.teamPassYards, teams)),
    at('spread.totalYardsRatio', bestOverWorstRatio(m.teamTotalYards, teams)),

    at('wins.sd', d.wins.sd),
    at('wins.eliteShare', shareWhere(m.wins, (v) => v >= 13)),
    at('wins.poorShare', shareWhere(m.wins, (v) => v <= 3)),
    at('wins.perfectShare', shareWhere(m.wins, (v) => v >= 17)),
    at('wins.winlessShare', shareWhere(m.wins, (v) => v === 0)),
    at('homeWin.share', m.homeWins / m.decidedGames),

    at('injury.perTeamGame', d.gameInjuries.mean),
    at('injury.gamesLostPerTeamSeason', sum(m.playerGamesLost) / (seasons * teams)),
    at('injury.seasonEndingPerTeamSeason', sum(m.seasonEnding) / (seasons * teams)),

    at('leader.passYards', d.leaderPassYards.mean),
    at('leader.rushYards', d.leaderRushYards.mean),
    at('leader.recYards', d.leaderRecYards.mean),
    at('leader.passTds', d.leaderPassTds.mean),
    at('leader.sacks', d.leaderSacks.mean),
    at('record.gamePassYards', d.recordGamePassYards.median),
    at('record.gameRushYards', d.recordGameRushYards.median),
  ];
}
