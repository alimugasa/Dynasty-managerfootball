// The box score is derived from the play events and from nothing else.
//
// Accumulating team totals during the game loop and also emitting events would
// create two records of the same truth that drift apart the first time a branch
// forgets to increment one of them. Folding the events once, here, means a
// discrepancy between the narrative and the totals is not expressible.

import type {
  GameResult,
  InjuryEvent,
  PlayEvent,
  PlayerStatLine,
  TeamBoxScore,
  TeamState,
  Weather,
} from './types.ts';

function emptyTeam(teamId: string): TeamBoxScore {
  return {
    teamId, score: 0, plays: 0, passAttempts: 0, completions: 0, passYards: 0,
    passTouchdowns: 0, interceptionsThrown: 0, sacksAllowed: 0, rushes: 0,
    rushYards: 0, rushTouchdowns: 0, fieldGoalsMade: 0, fieldGoalsAttempted: 0,
    turnovers: 0, firstDowns: 0, thirdDownAttempts: 0, thirdDownConversions: 0,
    possessionSeconds: 0, drives: 0,
  };
}

function emptyPlayer(playerId: string, teamId: string): PlayerStatLine {
  return {
    playerId, teamId, snaps: 0, passAttempts: 0, completions: 0, passYards: 0,
    passTouchdowns: 0, interceptionsThrown: 0, sacksTaken: 0, rushes: 0,
    rushYards: 0, rushTouchdowns: 0, targets: 0, receptions: 0, receivingYards: 0,
    receivingTouchdowns: 0, tackles: 0, sacks: 0, interceptions: 0,
    fieldGoalsMade: 0, fieldGoalsAttempted: 0, extraPointsMade: 0,
    extraPointsAttempted: 0, punts: 0, puntYards: 0,
  };
}

export function buildBoxScore(
  homeTeam: TeamState,
  awayTeam: TeamState,
  events: readonly PlayEvent[],
  injuries: readonly InjuryEvent[],
  weather: Weather,
  homeScore: number,
  awayScore: number,
  overtime: boolean,
  driveCount: { readonly home: number; readonly away: number },
  possessionSeconds: { readonly home: number; readonly away: number },
): GameResult {
  const home = emptyTeam(homeTeam.id);
  const away = emptyTeam(awayTeam.id);
  const lines = new Map<string, PlayerStatLine>();

  const teamOf = (teamId: string): TeamBoxScore => (teamId === homeTeam.id ? home : away);
  const lineFor = (playerId: string, teamId: string): PlayerStatLine => {
    const existing = lines.get(playerId);
    if (existing !== undefined) return existing;
    const created = emptyPlayer(playerId, teamId);
    lines.set(playerId, created);
    return created;
  };

  for (const play of events) {
    const offense = teamOf(play.offense);
    const defenseTeamId = play.offense === homeTeam.id ? awayTeam.id : homeTeam.id;
    const scoring = play.playType === 'fieldGoal' || play.playType === 'extraPoint';

    // Kneels, kicks and conversions are not offensive plays from scrimmage.
    if (play.playType === 'run' || play.playType === 'pass') {
      offense.plays += 1;
      if (play.down === 3) {
        offense.thirdDownAttempts += 1;
        if (play.firstDown || play.outcome === 'touchdown') offense.thirdDownConversions += 1;
      }
      if (play.firstDown || play.outcome === 'touchdown') offense.firstDowns += 1;
    }

    // A scramble is a rush, not a pass attempt. It must be identified by the
    // presence of a rusher on a pass play rather than by outcome === 'scramble',
    // because a scramble that reaches the end zone carries outcome
    // 'touchdown' -- and crediting that to the passing column would put a
    // quarterback's rushing touchdowns in his passing line.
    const isScramble = play.playType === 'pass' && play.rusher !== undefined;

    if (play.playType === 'run' || isScramble) {
      offense.rushes += 1;
      offense.rushYards += play.yards;
      if (play.outcome === 'touchdown') offense.rushTouchdowns += 1;
      if (play.rusher !== undefined) {
        const line = lineFor(play.rusher, play.offense);
        line.rushes += 1;
        line.rushYards += play.yards;
        if (play.outcome === 'touchdown') line.rushTouchdowns += 1;
      }
    } else if (play.playType === 'pass') {
      if (play.sack === true) {
        offense.sacksAllowed += 1;
        if (play.passer !== undefined) lineFor(play.passer, play.offense).sacksTaken += 1;
        if (play.defender !== undefined) lineFor(play.defender, defenseTeamId).sacks += 1;
      } else {
        offense.passAttempts += 1;
        if (play.passer !== undefined) lineFor(play.passer, play.offense).passAttempts += 1;
        if (play.receiver !== undefined) lineFor(play.receiver, play.offense).targets += 1;

        if (play.outcome === 'interception') {
          offense.interceptionsThrown += 1;
          if (play.passer !== undefined) {
            lineFor(play.passer, play.offense).interceptionsThrown += 1;
          }
          if (play.defender !== undefined) {
            lineFor(play.defender, defenseTeamId).interceptions += 1;
          }
        } else if (play.outcome !== 'incomplete') {
          offense.completions += 1;
          offense.passYards += play.yards;
          if (play.outcome === 'touchdown') offense.passTouchdowns += 1;
          if (play.passer !== undefined) {
            const line = lineFor(play.passer, play.offense);
            line.completions += 1;
            line.passYards += play.yards;
            if (play.outcome === 'touchdown') line.passTouchdowns += 1;
          }
          if (play.receiver !== undefined) {
            const line = lineFor(play.receiver, play.offense);
            line.receptions += 1;
            line.receivingYards += play.yards;
            if (play.outcome === 'touchdown') line.receivingTouchdowns += 1;
          }
        }
      }
    }

    if (scoring && play.kicker !== undefined) {
      const line = lineFor(play.kicker, play.offense);
      if (play.playType === 'fieldGoal') {
        line.fieldGoalsAttempted += 1;
        offense.fieldGoalsAttempted += 1;
        if (play.outcome === 'fieldGoalGood') {
          line.fieldGoalsMade += 1;
          offense.fieldGoalsMade += 1;
        }
      } else {
        line.extraPointsAttempted += 1;
        if (play.outcome === 'extraPointGood') line.extraPointsMade += 1;
      }
    }

    if (play.playType === 'punt' && play.kicker !== undefined) {
      const line = lineFor(play.kicker, play.offense);
      line.punts += 1;
      line.puntYards += play.yards;
    }

    if (play.outcome === 'interception' || play.outcome === 'fumble') offense.turnovers += 1;
    if (play.defender !== undefined && (play.playType === 'run' || play.playType === 'pass')) {
      lineFor(play.defender, defenseTeamId).tackles += 1;
    }
  }

  home.score = homeScore;
  away.score = awayScore;
  home.drives = driveCount.home;
  away.drives = driveCount.away;
  home.possessionSeconds = possessionSeconds.home;
  away.possessionSeconds = possessionSeconds.away;

  return {
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
    homeScore,
    awayScore,
    overtime,
    tied: homeScore === awayScore,
    weather,
    plays: events,
    home,
    away,
    players: [...lines.values()],
    injuries,
  };
}
