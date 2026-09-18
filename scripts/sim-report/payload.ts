// Shape passed back from each worker. Typed arrays so the samples transfer
// without copying.

export interface ShardResult {
  seasons: number;
  points: Int16Array;
  yards: Int16Array;
  passYards: Int16Array;
  rushYards: Int16Array;
  passAttempts: Int16Array;
  rushes: Int16Array;
  gameInjuries: Int16Array;
  wins: Int16Array;
  teamPassYards: Int16Array;
  teamTotalYards: Int16Array;
  leaderPassYards: Int16Array;
  leaderRushYards: Int16Array;
  leaderRecYards: Int16Array;
  leaderPassTds: Int16Array;
  leaderSacks: Int16Array;
  recordGamePassYards: Int16Array;
  recordGameRushYards: Int16Array;
  seasonInjuries: Int16Array;
  seasonEnding: Int16Array;
  playerGamesLost: Int16Array;
  homeWins: number;
  decidedGames: number;
  abandonedGames: number;
  abandonedByGroup: Record<string, number>;
}

export const TRANSFERABLE_KEYS = [
  'points', 'yards', 'passYards', 'rushYards', 'passAttempts', 'rushes',
  'gameInjuries', 'wins', 'teamPassYards', 'teamTotalYards', 'leaderPassYards', 'leaderRushYards', 'leaderRecYards',
  'leaderPassTds', 'leaderSacks', 'recordGamePassYards', 'recordGameRushYards',
  'seasonInjuries', 'seasonEnding', 'playerGamesLost',
] as const;
