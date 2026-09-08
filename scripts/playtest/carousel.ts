// What each club's season was, for the rig's coaching carousel.
//
// The same judgement the server makes: a club's record against what its
// roster said it should win, plus who won the final. Built from the rig's own
// table and bracket rather than from rows.

import { expectedWins, type CoachRecord } from '../../supabase/functions/_shared/engine/offseason/index.ts';
import { playoffOutcomes } from './postseason.ts';
import type { Game } from './host.ts';

export function coachRecords(game: Game): Map<string, CoachRecord> {
  const rating = (teamId: string): number => {
    const top = game.league.players
      .filter((p) => p.teamId === teamId && !p.retired)
      .map((p) => p.ability).sort((a, b) => b - a).slice(0, 24);
    return top.reduce((a, b) => a + b, 0) / Math.max(1, top.length);
  };
  const ratings = new Map(game.league.teamIds.map((id) => [id, rating(id)]));
  const values = [...ratings.values()];
  const mean = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
  const outcomes = game.seeds.length === 0 ? new Map() : playoffOutcomes(game);
  const games = Math.max(1, game.weeks - 1);

  const out = new Map<string, CoachRecord>();
  for (const teamId of game.league.teamIds) {
    const standing = game.standings.get(teamId);
    if (standing === undefined) continue;
    const outcome = outcomes.get(teamId);
    out.set(teamId, {
      wins: standing.wins, losses: standing.losses, ties: standing.ties,
      expectedWins: expectedWins(ratings.get(teamId) ?? mean, mean, games),
      champion: outcome === 'CHAMPION',
      madePlayoffs: outcome !== undefined && outcome !== 'MISSED',
    });
  }
  return out;
}
