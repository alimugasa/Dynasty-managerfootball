// The week's stories, in the play-test build.
//
// The same generator the server calls, given the same inputs: what was played
// this week, the season's totals so far, the table as it now stands, and who
// went off hurt. Lifted out of host.ts so that file stays under the size the
// architecture check allows.

import { createRng } from '../../supabase/functions/_shared/engine/rng.ts';
import { newsStream } from '../../supabase/functions/_shared/api/save.ts';
import { STARTERS, type PlayerStatLine, type TeamState } from '../../supabase/functions/_shared/engine/types.ts';
import { generateWeeklyNews, type NewsItem, type NewsLedger } from '../../supabase/functions/_shared/engine/news/index.ts';
import type { WeekInput } from '../../supabase/functions/_shared/engine/news/types.ts';
import type { Game, PlayedGame, Standing } from './host.ts';

export interface Absence {
  readonly playerId: string; readonly teamId: string;
  readonly severity: string; readonly weeksOut: number;
}

export function weekNews(
  game: Game, weekGames: readonly PlayedGame[], all: readonly PlayedGame[],
  standings: ReadonlyMap<string, Standing>, injuries: readonly Absence[],
  teams: ReadonlyMap<string, TeamState>, ledger: NewsLedger, phase: Game['phase'],
): NewsItem[] {
  const byId = new Map(game.league.players.map((p) => [p.id, p]));
  const totals = new Map<string, { pass: number; rush: number; rec: number; sacks: number }>();
  for (const g of all) {
    for (const line of g.players) {
      const t = totals.get(line.playerId) ?? { pass: 0, rush: 0, rec: 0, sacks: 0 };
      t.pass += line.passYards; t.rush += line.rushYards;
      t.rec += line.receivingYards; t.sacks += line.sacks;
      totals.set(line.playerId, t);
    }
  }
  const weekLines = new Map<string, PlayerStatLine>();
  for (const g of weekGames) for (const line of g.players) weekLines.set(line.playerId, line);
  const rating = (teamId: string): number => {
    const top = game.league.players.filter((p) => p.teamId === teamId && !p.retired)
      .map((p) => p.ability).sort((a, b) => b - a).slice(0, 24);
    return top.reduce((a, b) => a + b, 0) / Math.max(top.length, 1);
  };
  const starter = (teamId: string, playerId: string): boolean => {
    const player = byId.get(playerId);
    const team = teams.get(teamId);
    if (player === undefined || team === undefined) return false;
    return (team.depthChart[player.group] ?? []).indexOf(playerId) < STARTERS[player.group];
  };

  const input: WeekInput = {
    season: game.season, week: game.week, phase, totalWeeks: game.weeks,
    games: weekGames.map((g) => ({
      gameId: g.gameId, week: g.week, homeTeamId: g.homeTeamId, awayTeamId: g.awayTeamId,
      homeScore: g.homeScore, awayScore: g.awayScore, overtime: g.overtime,
    })),
    teams: game.league.teamIds.map((id) => {
      const s = standings.get(id);
      const club = game.clubs.get(id);
      return {
        teamId: id, name: club?.name ?? id, nickname: club?.nickname ?? id,
        wins: s?.wins ?? 0, losses: s?.losses ?? 0, ties: s?.ties ?? 0,
        streak: s?.streak ?? 0, rating: rating(id),
      };
    }),
    players: [...weekLines.entries()].flatMap(([playerId, line]) => {
      const p = byId.get(playerId);
      const season = totals.get(playerId);
      if (p === undefined || season === undefined) return [];
      return [{
        playerId, name: p.name, teamId: line.teamId, position: p.group,
        gamePassYards: line.passYards, gameRushYards: line.rushYards,
        gameRecYards: line.receivingYards,
        gameTouchdowns: line.passTouchdowns + line.rushTouchdowns + line.receivingTouchdowns,
        seasonPassYards: season.pass, seasonRushYards: season.rush,
        seasonRecYards: season.rec, seasonSacks: season.sacks,
      }];
    }),
    injuries: injuries.flatMap((injury) => {
      const p = byId.get(injury.playerId);
      if (p === undefined) return [];
      return [{
        playerId: injury.playerId, name: p.name, teamId: injury.teamId, position: p.group,
        severity: injury.severity as 'minor' | 'shortTerm' | 'majorTerm' | 'seasonEnding',
        weeksOut: injury.weeksOut, starter: starter(injury.teamId, injury.playerId),
      }];
    }),
    // No coach model in the career engine, and no award races defined. Empty
    // is the truth; those detectors stay silent, as they do on the server.
    coaches: [], awardRaces: [],
  };
  return generateWeeklyNews(input, ledger, createRng(newsStream(game.seed, game.season, game.week)));
}
