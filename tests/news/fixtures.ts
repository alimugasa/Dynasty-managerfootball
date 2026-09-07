// A week constructed to trigger every kind of story at once.
//
// Used by the template test to prove detectors and phrasings agree: every
// template of every kind is rendered against the slots its own detector
// produces, so a template referencing a slot nothing supplies fails the suite
// rather than shipping literal braces into a headline.

import type {
  AwardRaceNews, CoachNews, GameNews, InjuryNews, PlayerNews, TeamNews, WeekInput,
} from '../../supabase/functions/_shared/engine/news/index.ts';

export function team(overrides: Partial<TeamNews> = {}): TeamNews {
  return {
    teamId: 'AAA', name: 'Aurora Ironworks', nickname: 'Ironworks',
    wins: 5, losses: 5, ties: 0, streak: 0, rating: 74, ...overrides,
  };
}

export const TEAMS: TeamNews[] = [
  // Upset pair, big: a much weaker side wins by a wide margin.
  team({ teamId: 'WEK', name: 'Weyland Drovers', nickname: 'Drovers', rating: 66 }),
  team({ teamId: 'STR', name: 'Stanmore Kings', nickname: 'Kings', rating: 80 }),
  // Upset pair, close.
  team({ teamId: 'NAR', name: 'Narrows Pilots', nickname: 'Pilots', rating: 70 }),
  team({ teamId: 'CRE', name: 'Crestline Foundry', nickname: 'Foundry', rating: 76 }),
  // Streaks.
  team({ teamId: 'HOT', name: 'Harbour Gales', nickname: 'Gales', wins: 9, losses: 1, streak: 5 }),
  team({ teamId: 'COL', name: 'Colliers Bay Anchors', nickname: 'Anchors', wins: 1, losses: 9, streak: -5 }),
  // Coaches.
  team({ teamId: 'PRS', name: 'Pressley Rail', nickname: 'Rail', wins: 3, losses: 7 }),
  team({ teamId: 'RPV', name: 'Ridgeport Vanguard', nickname: 'Vanguard', wins: 8, losses: 2 }),
  // Milestones and awards.
  team({ teamId: 'MIL', name: 'Millbrook Tanners', nickname: 'Tanners' }),
];

export const GAMES: GameNews[] = [
  { gameId: 'G1', week: 10, homeTeamId: 'WEK', awayTeamId: 'STR', homeScore: 31, awayScore: 13, overtime: false },
  { gameId: 'G2', week: 10, homeTeamId: 'NAR', awayTeamId: 'CRE', homeScore: 20, awayScore: 17, overtime: false },
];

export const PLAYERS: PlayerNews[] = [
  {
    playerId: 'P1', name: 'Emeka Isbell', teamId: 'MIL', position: 'QB',
    // A big game, and the week the season total crosses 3000.
    gamePassYards: 412, gameRushYards: 0, gameRecYards: 0, gameTouchdowns: 4,
    seasonPassYards: 3120, seasonRushYards: 0, seasonRecYards: 0, seasonSacks: 0,
  },
];

export const INJURIES: InjuryNews[] = [
  {
    playerId: 'P2', name: 'Morgan Lombardo', teamId: 'MIL', position: 'EDGE',
    severity: 'seasonEnding', weeksOut: 99, starter: true,
  },
  {
    playerId: 'P3', name: 'Callum Reyes', teamId: 'HOT', position: 'CB',
    severity: 'majorTerm', weeksOut: 6, starter: true,
  },
];

export const COACHES: CoachNews[] = [
  {
    coachId: 'C1', name: 'Lyle Sigler', teamId: 'PRS',
    wins: 3, losses: 7, expectedWins: 7, seasonsWithTeam: 4, hotSeat: 78,
  },
  {
    coachId: 'C2', name: 'Palmer Hagerty', teamId: 'RPV',
    wins: 8, losses: 2, expectedWins: 5, seasonsWithTeam: 2, hotSeat: 60,
  },
];

export const AWARD_RACES: AwardRaceNews[] = [
  {
    awardCode: 'PASSING', awardName: 'Passer of the Year',
    leaderPlayerId: 'P1', leaderName: 'Emeka Isbell', leaderTeamId: 'MIL',
    leaderValue: 3120, statLabel: 'passing yards', margin: 60,
    chaserName: 'Deshawn Marek',
  },
  {
    awardCode: 'RUSHING', awardName: 'Rusher of the Year',
    leaderPlayerId: 'P4', leaderName: 'Tobias Nkemelu', leaderTeamId: 'HOT',
    leaderValue: 1400, statLabel: 'rushing yards', margin: 400,
    chaserName: 'Rory Vance',
  },
];

export function everyKindWeek(overrides: Partial<WeekInput> = {}): WeekInput {
  return {
    season: 2026, week: 10, phase: 'REGULAR_SEASON', totalWeeks: 18,
    games: GAMES, teams: TEAMS, players: PLAYERS, injuries: INJURIES,
    coaches: COACHES, awardRaces: AWARD_RACES,
    ...overrides,
  };
}
