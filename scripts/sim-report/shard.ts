// Simulates a contiguous block of seasons into flat typed arrays.
//
// Shared by the worker threads and by --serial, so both paths produce identical
// numbers. Season n always uses seed base+n, which is what makes the report
// independent of how the work was divided.

import { simulateSeason } from './season.ts';
import type { League } from './league.ts';
import type { ShardResult } from './payload.ts';

export function buildShard(
  league: League,
  firstSeason: number,
  seasonCount: number,
  baseSeed: number,
  onSeason: () => void,
): ShardResult {
  const teamGamesPerSeason = league.schedule.length * 2;
  const teamsPerSeason = league.teams.length;

  const result: ShardResult = {
    seasons: seasonCount,
    points: new Int16Array(seasonCount * teamGamesPerSeason),
    yards: new Int16Array(seasonCount * teamGamesPerSeason),
    passYards: new Int16Array(seasonCount * teamGamesPerSeason),
    rushYards: new Int16Array(seasonCount * teamGamesPerSeason),
    passAttempts: new Int16Array(seasonCount * teamGamesPerSeason),
    rushes: new Int16Array(seasonCount * teamGamesPerSeason),
    gameInjuries: new Int16Array(seasonCount * teamGamesPerSeason),
    wins: new Int16Array(seasonCount * teamsPerSeason),
    teamPassYards: new Int16Array(seasonCount * teamsPerSeason),
    teamTotalYards: new Int16Array(seasonCount * teamsPerSeason),
    leaderPassYards: new Int16Array(seasonCount),
    leaderRushYards: new Int16Array(seasonCount),
    leaderRecYards: new Int16Array(seasonCount),
    leaderPassTds: new Int16Array(seasonCount),
    leaderSacks: new Int16Array(seasonCount),
    recordGamePassYards: new Int16Array(seasonCount),
    recordGameRushYards: new Int16Array(seasonCount),
    seasonInjuries: new Int16Array(seasonCount),
    seasonEnding: new Int16Array(seasonCount),
    playerGamesLost: new Int16Array(seasonCount),
    homeWins: 0,
    decidedGames: 0,
    abandonedGames: 0,
    abandonedByGroup: { QB: 0, OL: 0, K: 0, P: 0 },
  };

  let gameCursor = 0;
  let winCursor = 0;

  for (let i = 0; i < seasonCount; i += 1) {
    const season = simulateSeason(league, baseSeed + firstSeason + i);

    for (const row of season.teamGames) {
      result.points[gameCursor] = row.points;
      result.yards[gameCursor] = row.yards;
      result.passYards[gameCursor] = row.passYards;
      result.rushYards[gameCursor] = row.rushYards;
      result.passAttempts[gameCursor] = row.passAttempts;
      result.rushes[gameCursor] = row.rushes;
      result.gameInjuries[gameCursor] = row.injuries;
      gameCursor += 1;
    }
    for (let t = 0; t < season.wins.length; t += 1) {
      result.wins[winCursor] = season.wins[t] as number;
      result.teamPassYards[winCursor] = season.teamPassYards[t] as number;
      result.teamTotalYards[winCursor] = season.teamTotalYards[t] as number;
      winCursor += 1;
    }

    result.leaderPassYards[i] = season.leaders.passYards;
    result.leaderRushYards[i] = season.leaders.rushYards;
    result.leaderRecYards[i] = season.leaders.recYards;
    result.leaderPassTds[i] = season.leaders.passTds;
    result.leaderSacks[i] = season.leaders.sacks;
    result.recordGamePassYards[i] = season.gameRecordPassYards;
    result.recordGameRushYards[i] = season.gameRecordRushYards;
    result.seasonInjuries[i] = season.totalInjuries;
    result.seasonEnding[i] = season.seasonEndingInjuries;
    result.playerGamesLost[i] = season.playerGamesLost;

    result.homeWins += season.homeWins;
    result.decidedGames += season.decidedGames;
    result.abandonedGames += season.abandonedGames;
    for (const [group, count] of Object.entries(season.abandonedByGroup)) {
      result.abandonedByGroup[group] = (result.abandonedByGroup[group] ?? 0) + count;
    }

    onSeason();
  }

  // An abandoned game produces no rows, so trim the unused tail rather than
  // leaving zeroes that would drag every mean down.
  if (gameCursor < result.points.length) {
    for (const key of ['points', 'yards', 'passYards', 'rushYards', 'passAttempts',
      'rushes', 'gameInjuries'] as const) {
      result[key] = result[key].slice(0, gameCursor);
    }
  }
  return result;
}
