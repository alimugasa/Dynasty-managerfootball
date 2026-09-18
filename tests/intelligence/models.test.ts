import { describe, it, expect } from 'vitest';
import { positionGroup } from '../../supabase/functions/_shared/api/positionGroup';
import { intelligenceThresholds } from '../../supabase/functions/_shared/api/leagueIntelligence/calendar';
import { rankTeams, type RankedTeam } from '../../supabase/functions/_shared/api/leagueIntelligence/teamRankings';
import { raceProduction, rankAwardRaces, withRaceMovement, type RacePlayer } from '../../supabase/functions/_shared/api/leagueIntelligence/awardModel';
export function candidate(overrides: Partial<RacePlayer> = {}): RacePlayer {
  return { playerId: 'p', name: 'Ari Vale', teamId: 'CLE', position: 'QB', group: 'QB', experience: 0, games: 8,
    passYards: 2000, passAttempts: 250, passTD: 15, thrownINT: 4, rushYards: 0, rushes: 0, rushTD: 0,
    recYards: 0, targets: 0, recTD: 0, tackles: 0, sacks: 0, interceptions: 0, ...overrides };
}
export const population = () => ['QB', 'RB', 'WR', 'EDGE', 'CB'].flatMap((group, j) =>
  Array.from({ length: 8 }, (_, i) => candidate({ playerId: group + String(i), group, position: group, experience: i % 2,
    passYards: 1500 + i * 100, passTD: 10 + i, rushYards: group === 'RB' ? 400 + i * 50 : 0,
    rushes: group === 'RB' ? 100 : 0, recYards: group === 'WR' ? 300 + i * 70 : 0,
    targets: group === 'WR' ? 60 : 0, tackles: 20 + i * 4 + j, sacks: group === 'EDGE' ? i : 0,
    interceptions: group === 'CB' ? i : 0 })));
describe('league timing', () => {
  it('recognizes seed positions and generated group labels without inventing unknown positions', () => {
    expect(['OL', 'OT', 'OG', 'C'].map(positionGroup)).toEqual(['OL', 'OL', 'OL', 'OL']);
    expect(positionGroup('FB')).toBe('RB'); expect(positionGroup('unknown')).toBeUndefined();
  });
  it('centralizes meaningful thresholds from the actual schedule length', () => {
    expect(intelligenceThresholds(18)).toEqual({ awards: 6, picture: 9 });
    expect(intelligenceThresholds(12)).toEqual({ awards: 4, picture: 6 });
    expect(() => intelligenceThresholds(0)).toThrow();
  });
});
describe('performance races', () => {
  const games = new Map([['CLE', 8]]);
  it('uses role-specific evidence and penalizes quarterback interceptions', () => {
    expect(raceProduction(candidate({ thrownINT: 8 }))).toBeLessThan(raceProduction(candidate()));
    expect(raceProduction(candidate({ group: 'WR', passYards: 9000, recYards: 500, recTD: 2 }))).toBe(540);
    expect(raceProduction(candidate({ group: 'CB', tackles: 40, sacks: 2, interceptions: 3 }))).toBe(74);
  });
  it('limits eligibility, rookie status and five-person shortlists', () => {
    const boards = rankAwardRaces([...population(), candidate({ playerId: 'absent', games: 1, passYards: 99999 })], games);
    expect(boards.every((b) => b.candidates.length <= 5)).toBe(true);
    expect(boards.flatMap((b) => b.candidates).some((p) => p.playerId === 'absent')).toBe(false);
    expect(boards.filter((b) => b.code.startsWith('NEWCOMER')).flatMap((b) => b.candidates).every((p) => p.experience === 0)).toBe(true);
    expect(boards.find((b) => b.code === 'DEFENSIVE_PLAYER')?.candidates.every((p) => ['EDGE', 'CB'].includes(p.group))).toBe(true);
  });
  it('does not allow passing volume to monopolize representative cross-position candidates', () => {
    const overall = rankAwardRaces(population(), games).find((r) => r.code === 'PLAYER_OF_THE_YEAR');
    expect(new Set(overall?.candidates.map((p) => p.group)).size).toBeGreaterThan(1);
  });
  it('is deterministic, gives tied indices equal ranks and orders ties by player id', () => {
    const a = candidate({ playerId: 'a' }); const b = candidate({ playerId: 'b' });
    const first = rankAwardRaces([b, a], games); const second = rankAwardRaces([a, b], games);
    expect(first).toEqual(second);
    expect(first[0]?.candidates.map((p) => [p.playerId, p.rank])).toEqual([['a', 1], ['b', 1]]);
  });
  it('derives movement from previous shortlists, not UI memory', () => {
    const now = rankAwardRaces(population(), games);
    const prior = now.map((r) => ({ ...r, candidates: r.candidates.slice(1).map((p) => ({ ...p, rank: p.rank + 1 })) }));
    const moved = withRaceMovement(now, prior);
    expect(moved[0]?.candidates[0]?.movement).toBe('NEW');
    expect(moved[0]?.candidates[1]?.movement).toBe('UP');
    expect(withRaceMovement(now, [])[0]?.candidates[0]?.movement).toBeNull();
  });
});
describe('team rankings', () => {
  const team = (teamId: string, games: number, yards: number): RankedTeam => ({
    teamId, name: teamId, games, totals: { offense: yards, defense: yards, scoring: yards / 10, allowed: yards / 10,
      passing: yards * 0.7, rushing: yards * 0.3, passDefense: yards * 0.7, rushDefense: yards * 0.3, turnovers: 2 },
  });
  it('orders offense and defense in opposite directions using rates', () => {
    const boards = rankTeams([team('A', 2, 800), team('B', 3, 900)]);
    expect(boards.find((b) => b.key === 'offense')?.rows[0]?.teamId).toBe('A');
    expect(boards.find((b) => b.key === 'defense')?.rows[0]?.teamId).toBe('B');
    expect(boards.find((b) => b.key === 'scoring')?.rows[0]?.value).toBe(40);
  });
  it('shares tied ranks and keeps teams with no games explicitly unranked', () => {
    const rows = rankTeams([team('B', 2, 600), team('A', 3, 900), team('C', 0, 0)])[0]?.rows;
    expect(rows?.map((r) => r.rank)).toEqual([1, 1, null]);
    expect(rows?.at(-1)?.value).toBeNull();
  });
});
