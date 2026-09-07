// One simulated season over the real schedule.
//
// Injuries carry across weeks here, which the engine itself does not do: a game
// is independent, and persisting absences is the season loop's job. That layer
// does not exist yet, so this harness supplies a minimal version of it -- a
// player with three weeks remaining misses the next three games, and his backup
// starts. Without it, "injuries per season" and "win totals" would both measure
// a league where nobody is ever missing, which is not the league being built.
//
// Everything else comes from the engine untouched.

import { createRng } from '../../supabase/functions/_shared/engine/rng.ts';
import { simulateGame } from '../../supabase/functions/_shared/engine/simulateGame.ts';
import {
  MissingUnitError,
  type PositionGroup,
  type TeamState,
} from '../../supabase/functions/_shared/engine/types.ts';
import { POSITION_GROUPS } from '../../supabase/functions/_shared/engine/types.ts';
import type { League } from './league.ts';

export interface TeamGameRow {
  points: number; yards: number; passYards: number; rushYards: number;
  passAttempts: number; rushes: number; injuries: number;
}

export interface PlayerSeasonRow {
  passYards: number; rushYards: number; recYards: number;
  passTds: number; sacks: number;
}

export interface SeasonResult {
  readonly teamGames: readonly TeamGameRow[];
  readonly wins: readonly number[];
  /** Season passing and total yards per club, in league order. Needed to
   *  measure how far apart the best and worst offences finish, which is the
   *  thing a league-leader figure is actually downstream of. */
  readonly teamPassYards: readonly number[];
  readonly teamTotalYards: readonly number[];
  readonly homeWins: number;
  readonly decidedGames: number;
  readonly leaders: PlayerSeasonRow;
  readonly gameRecordPassYards: number;
  readonly gameRecordRushYards: number;
  readonly totalInjuries: number;
  readonly seasonEndingInjuries: number;
  readonly playerGamesLost: number;
  readonly abandonedGames: number;
  /** Abandonments by the unit that could not be fielded: QB, OL, K, P. */
  readonly abandonedByGroup: Readonly<Record<string, number>>;
}

/** A team state with injured players removed from the depth chart. */
function withoutInjured(team: TeamState, out: ReadonlySet<string>): TeamState {
  if (out.size === 0) return team;
  const depthChart = {} as Record<PositionGroup, string[]>;
  for (const group of POSITION_GROUPS) {
    depthChart[group] = (team.depthChart[group] ?? []).filter((id) => !out.has(id));
  }
  return { ...team, depthChart };
}

export function simulateSeason(league: League, seed: number): SeasonResult {
  const rng = createRng(seed);
  const teamGames: TeamGameRow[] = [];
  const wins = new Map<string, number>();
  const playerSeason = new Map<string, PlayerSeasonRow>();
  // playerId -> weeks still to miss, per team.
  const absence = new Map<string, number>();

  let homeWins = 0;
  let decidedGames = 0;
  let totalInjuries = 0;
  let seasonEndingInjuries = 0;
  let playerGamesLost = 0;
  let abandonedGames = 0;
  const abandonedByGroup: Record<string, number> = { QB: 0, OL: 0, K: 0, P: 0 };
  let gameRecordPassYards = 0;
  let gameRecordRushYards = 0;

  const teamById = new Map(league.teams.map((t) => [t.id, t]));
  const teamPass = new Map<string, number>();
  const teamTotal = new Map<string, number>();
  for (const team of league.teams) {
    wins.set(team.id, 0);
    teamPass.set(team.id, 0);
    teamTotal.set(team.id, 0);
  }

  const accrue = (playerId: string, apply: (row: PlayerSeasonRow) => void): void => {
    const row = playerSeason.get(playerId)
      ?? { passYards: 0, rushYards: 0, recYards: 0, passTds: 0, sacks: 0 };
    apply(row);
    playerSeason.set(playerId, row);
  };

  for (let week = 1; week <= league.weeks; week += 1) {
    const unavailable = new Set(absence.keys());
    // Every absent player costs his club a player-game, whether or not his team
    // plays this week; teams on a bye simply have nobody to miss.
    playerGamesLost += unavailable.size;

    for (const fixture of league.schedule) {
      if (fixture.week !== week) continue;
      const home = teamById.get(fixture.homeTeamId);
      const away = teamById.get(fixture.awayTeamId);
      if (home === undefined || away === undefined) continue;

      let game;
      try {
        game = simulateGame(
          withoutInjured(home, unavailable),
          withoutInjured(away, unavailable),
          rng,
          { allowTie: true },
        );
      } catch (error) {
        // A club with no fieldable quarterback or offensive line cannot play.
        // Counted and reported rather than papered over with a fake result.
        if (error instanceof MissingUnitError) {
          abandonedGames += 1;
          abandonedByGroup[error.group] = (abandonedByGroup[error.group] ?? 0) + 1;
          continue;
        }
        throw error;
      }

      for (const [box, opponent] of [[game.home, game.away], [game.away, game.home]] as const) {
        teamGames.push({
          points: box.score,
          yards: box.passYards + box.rushYards,
          passYards: box.passYards,
          rushYards: box.rushYards,
          passAttempts: box.passAttempts,
          rushes: box.rushes,
          injuries: game.injuries.filter((i) => i.teamId === box.teamId).length,
        });
        teamPass.set(box.teamId, (teamPass.get(box.teamId) ?? 0) + box.passYards);
        teamTotal.set(box.teamId,
          (teamTotal.get(box.teamId) ?? 0) + box.passYards + box.rushYards);
        void opponent;
      }

      if (game.homeScore === game.awayScore) {
        // A tie is half a win in the standings.
      } else {
        decidedGames += 1;
        const winner = game.homeScore > game.awayScore ? game.homeTeamId : game.awayTeamId;
        if (winner === game.homeTeamId) homeWins += 1;
        wins.set(winner, (wins.get(winner) ?? 0) + 1);
      }

      for (const line of game.players) {
        if (line.passYards !== 0 || line.passTouchdowns !== 0) {
          accrue(line.playerId, (r) => {
            r.passYards += line.passYards;
            r.passTds += line.passTouchdowns;
          });
          if (line.passYards > gameRecordPassYards) gameRecordPassYards = line.passYards;
        }
        if (line.rushYards !== 0) {
          accrue(line.playerId, (r) => { r.rushYards += line.rushYards; });
          if (line.rushYards > gameRecordRushYards) gameRecordRushYards = line.rushYards;
        }
        if (line.receivingYards !== 0) {
          accrue(line.playerId, (r) => { r.recYards += line.receivingYards; });
        }
        if (line.sacks !== 0) accrue(line.playerId, (r) => { r.sacks += line.sacks; });
      }

      for (const injury of game.injuries) {
        totalInjuries += 1;
        if (injury.severity === 'seasonEnding') seasonEndingInjuries += 1;
        if (injury.returnsThisGame) continue;
        const weeksOut = injury.severity === 'seasonEnding'
          ? league.weeks - week + 1
          : Math.max(1, injury.weeksOut);
        const current = absence.get(injury.playerId) ?? 0;
        if (weeksOut > current) absence.set(injury.playerId, weeksOut);
      }
    }

    for (const [playerId, remaining] of absence) {
      if (remaining <= 1) absence.delete(playerId);
      else absence.set(playerId, remaining - 1);
    }
  }

  const leaders: PlayerSeasonRow = {
    passYards: 0, rushYards: 0, recYards: 0, passTds: 0, sacks: 0,
  };
  for (const row of playerSeason.values()) {
    if (row.passYards > leaders.passYards) leaders.passYards = row.passYards;
    if (row.rushYards > leaders.rushYards) leaders.rushYards = row.rushYards;
    if (row.recYards > leaders.recYards) leaders.recYards = row.recYards;
    if (row.passTds > leaders.passTds) leaders.passTds = row.passTds;
    if (row.sacks > leaders.sacks) leaders.sacks = row.sacks;
  }

  return {
    teamGames,
    wins: [...wins.values()],
    teamPassYards: [...teamPass.values()],
    teamTotalYards: [...teamTotal.values()],
    homeWins,
    decidedGames,
    leaders,
    gameRecordPassYards,
    gameRecordRushYards,
    totalInjuries,
    seasonEndingInjuries,
    playerGamesLost,
    abandonedGames,
    abandonedByGroup,
  };
}
