// Evidence-only watchlists. Final grades and voter noise do not exist midseason.
import { AWARD_NAME, BALLOT_DEPTH, awardPositionWeight } from '../../engine/offseason/awards.ts';
import type { PositionGroup } from '../../engine/types.ts';
export interface RacePlayer {
  readonly playerId: string; readonly name: string; readonly teamId: string; readonly position: string;
  readonly group: string; readonly experience: number; readonly games: number;
  readonly passYards: number; readonly passAttempts: number; readonly passTD: number; readonly thrownINT: number;
  readonly rushYards: number; readonly rushes: number; readonly rushTD: number;
  readonly recYards: number; readonly targets: number; readonly recTD: number;
  readonly tackles: number; readonly sacks: number; readonly interceptions: number;
}
export const RACES = [
  { code: 'PLAYER_OF_THE_YEAR', name: AWARD_NAME.PLAYER_OF_THE_YEAR, side: 'ALL', rookie: false },
  { code: 'OFFENSIVE_PLAYER', name: AWARD_NAME.OFFENSIVE_PLAYER, side: 'OFFENSE', rookie: false },
  { code: 'DEFENSIVE_PLAYER', name: AWARD_NAME.DEFENSIVE_PLAYER, side: 'DEFENSE', rookie: false },
  { code: 'NEWCOMER', name: AWARD_NAME.NEWCOMER, side: 'ALL', rookie: true },
  { code: 'NEWCOMER_OFFENSE', name: 'Newcomer watch · offense', side: 'OFFENSE', rookie: true },
  { code: 'NEWCOMER_DEFENSE', name: 'Newcomer watch · defense', side: 'DEFENSE', rookie: true },
] as const;
const OFFENSE = ['QB', 'RB', 'WR', 'TE'];
const DEFENSE = ['EDGE', 'DT', 'LB', 'CB', 'S'];
export interface RaceCandidate extends RacePlayer {
  readonly rank: number; readonly index: number; readonly movement: 'UP' | 'DOWN' | 'SAME' | 'NEW' | null;
  readonly places: number | null; readonly evidence: string;
}
export interface RaceBoard { readonly code: string; readonly name: string; readonly candidates: readonly RaceCandidate[] }

/** Different observable production at each role. No invented grades for blockers. */
export function raceProduction(p: RacePlayer): number {
  if (p.group === 'QB') return p.passYards + 20 * p.passTD - 45 * p.thrownINT + p.rushYards + 20 * p.rushTD;
  if (OFFENSE.includes(p.group)) return p.rushYards + p.recYards + 20 * (p.rushTD + p.recTD);
  if (DEFENSE.includes(p.group)) return p.tackles + 5 * p.sacks + 8 * p.interceptions;
  return 0;
}
function evidence(p: RacePlayer): string {
  if (p.group === 'QB') return `${p.passYards} pass yd · ${p.passTD} pass TD · ${p.thrownINT} INT`;
  if (OFFENSE.includes(p.group)) return `${p.rushYards + p.recYards} scrimmage yd · ${p.rushTD + p.recTD} TD`;
  return `${p.tackles} tackles · ${p.sacks} sacks · ${p.interceptions} INT`;
}
/** Position-relative production, per-opportunity efficiency where measurable,
 * and observed participation. Group baselines prevent passing volume from
 * masquerading as comparable defensive production. Equal indices share ranks. */
export function rankAwardRaces(players: readonly RacePlayer[], teamGames: ReadonlyMap<string, number>): RaceBoard[] {
  const eligible = players.filter((p) => {
    const games = teamGames.get(p.teamId);
    if (games === undefined) throw new Error('Missing award-race team games for ' + p.teamId);
    return (OFFENSE.includes(p.group) || DEFENSE.includes(p.group))
      && p.games >= Math.max(2, Math.ceil(games / 2));
  });
  const scored = eligible.map((p) => {
    const peers = eligible.filter((r) => r.group === p.group);
    const rate = (r: RacePlayer): number => raceProduction(r) / r.games;
    const opportunities = (r: RacePlayer): number => r.group === 'QB' ? r.passAttempts + r.rushes
      : OFFENSE.includes(r.group) ? r.targets + r.rushes : r.games;
    const efficiency = (r: RacePlayer): number => opportunities(r) === 0 ? 0 : raceProduction(r) / opportunities(r);
    const z = (f: (r: RacePlayer) => number): number => {
      const mean = peers.reduce((sum, r) => sum + f(r), 0) / peers.length;
      const sd = Math.sqrt(peers.reduce((sum, r) => sum + (f(r) - mean) ** 2, 0) / peers.length);
      return sd === 0 ? 0 : Math.max(-3, Math.min(3, (f(p) - mean) / sd));
    };
    const games = teamGames.get(p.teamId);
    if (games === undefined) throw new Error('Missing team games');
    const production = z(rate);
    const score = (OFFENSE.includes(p.group) ? 0.75 * production + 0.25 * z(efficiency) : production)
      - 0.5 * (1 - Math.min(1, p.games / games));
    return { p, index: Math.round((50 + score * 15) * 100) / 100 };
  });
  return RACES.map((race) => {
    const rows = scored.map(({ p, index }) => ({ p,
      // The overall race shares the final electorate's positional-value
      // philosophy. Side awards measure excellence within that side instead.
      index: race.side === 'ALL' ? Math.round(index * awardPositionWeight(p.group as PositionGroup) * 100) / 100 : index,
    })).filter(({ p }) => (!race.rookie || p.experience === 0)
      && (race.side === 'ALL' || (race.side === 'OFFENSE' ? OFFENSE : DEFENSE).includes(p.group)))
      .sort((a, b) => b.index - a.index || a.p.playerId.localeCompare(b.p.playerId));
    let previous: number | null = null; let rank = 0;
    return { code: race.code, name: race.name, candidates: rows.slice(0, BALLOT_DEPTH).map(({ p, index }, i) => {
      if (index !== previous) rank = i + 1;
      previous = index;
      return { ...p, rank, index, evidence: evidence(p), movement: null, places: null };
    }) };
  });
}
export function withRaceMovement(current: readonly RaceBoard[], previous: readonly RaceBoard[]): RaceBoard[] {
  return current.map((race) => {
    const prior = previous.find((r) => r.code === race.code);
    return { ...race, candidates: race.candidates.map((p) => {
      if (prior === undefined) return p;
      const old = prior.candidates.find((r) => r.playerId === p.playerId);
      return { ...p, movement: old === undefined ? 'NEW' : old.rank > p.rank ? 'UP' : old.rank < p.rank ? 'DOWN' : 'SAME',
        places: old === undefined ? null : Math.abs(old.rank - p.rank) };
    }) };
  });
}
