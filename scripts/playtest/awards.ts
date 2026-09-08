// The end of the year, in the play-test build.
//
// The same vote the server runs, from the same engine module, on the season
// this build just played: the engine's grades, the box scores it kept, the
// table it recomputed and the coaches it employs.

import { createRng } from '../../supabase/functions/_shared/engine/rng.ts';
import { awardStream } from '../../supabase/functions/_shared/api/save.ts';
import {
  runAwards, type AwardCandidate, type AwardResult, type CoachCandidate, type SeasonGrade,
} from '../../supabase/functions/_shared/engine/offseason/index.ts';
import { coachRecords } from './carousel.ts';
import type { Game } from './host.ts';

/** What every player did, counted from the games this build actually played. */
function production(game: Game): Map<string, {
  games: number; pass: number; rush: number; rec: number;
  tds: number; sacks: number; ints: number; tackles: number;
}> {
  const out = new Map<string, {
    games: number; pass: number; rush: number; rec: number;
    tds: number; sacks: number; ints: number; tackles: number;
  }>();
  for (const g of game.results) {
    for (const line of g.players) {
      const t = out.get(line.playerId)
        ?? { games: 0, pass: 0, rush: 0, rec: 0, tds: 0, sacks: 0, ints: 0, tackles: 0 };
      t.games += 1;
      t.pass += line.passYards; t.rush += line.rushYards; t.rec += line.receivingYards;
      t.tds += line.passTouchdowns + line.rushTouchdowns + line.receivingTouchdowns;
      t.sacks += line.sacks; t.ints += line.interceptions; t.tackles += line.tackles;
      out.set(line.playerId, t);
    }
  }
  return out;
}

export function seasonAwards(game: Game, grades: readonly SeasonGrade[]): AwardResult {
  const stats = production(game);
  const games = game.weeks - 1;
  const playerOf = new Map(game.league.players.map((p) => [p.id, p]));
  const candidates: AwardCandidate[] = grades.flatMap((grade) => {
    const player = playerOf.get(grade.playerId);
    if (player === undefined || player.teamId === null) return [];
    const t = stats.get(grade.playerId);
    const standing = game.standings.get(player.teamId);
    return [{
      playerId: grade.playerId, name: player.name, teamId: player.teamId, group: player.group,
      grade: grade.grade, gradeZ: grade.gradeZ,
      experience: Math.max(0, player.experience - 1),
      // A player whose position produces no line still played: the absence of
      // a box score is not the absence of a season.
      games: t?.games ?? games - Math.min(games, game.absence.get(grade.playerId) ?? 0),
      teamWins: standing?.wins ?? 0,
      passYards: t?.pass ?? 0, rushYards: t?.rush ?? 0, recYards: t?.rec ?? 0,
      touchdowns: t?.tds ?? 0, sacks: t?.sacks ?? 0, interceptions: t?.ints ?? 0,
      tackles: t?.tackles ?? 0,
    }];
  });

  const records = coachRecords(game);
  const coaches: CoachCandidate[] = game.league.coaches.flatMap((c) => {
    if (c.retired || c.teamId === null || c.role !== 'HEAD_COACH') return [];
    const record = records.get(c.teamId);
    if (record === undefined) return [];
    return [{
      coachId: c.id, name: c.name, teamId: c.teamId,
      wins: record.wins, losses: record.losses, expectedWins: record.expectedWins,
    }];
  });

  return runAwards(game.season, candidates, coaches, games,
    createRng(awardStream(game.seed, game.season)));
}
