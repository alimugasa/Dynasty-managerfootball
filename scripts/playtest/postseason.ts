// The postseason, in the play-test build.
//
// The same engine module the server calls (engine/playoffs.ts), given the
// same inputs: the table as the regular season left it, and every playoff
// game played so far. The bracket is derived from those two, never stored,
// so a dynasty restored from the browser's storage picks the round back up
// exactly where it was.

import { createRng } from '../../supabase/functions/_shared/engine/rng.ts';
import { simulateGame } from '../../supabase/functions/_shared/engine/simulateGame.ts';
import { teamStatesFor } from '../../supabase/functions/_shared/engine/careerBridge.ts';
import { postseasonStream, gameStream } from '../../supabase/functions/_shared/api/save.ts';
import {
  bracket, outcomes, seedLeague, ROUND_LABEL,
  type ClubRecord, type PlayoffOutcome, type PlayoffResult, type Result, type Seed,
} from '../../supabase/functions/_shared/engine/playoffs.ts';
import { cloneLedger } from '../../supabase/functions/_shared/engine/news/index.ts';
import type { PlayoffRound } from '../../supabase/functions/_shared/engine/playoffs.ts';
import { weekNews, type Absence } from './news.ts';
import type { Game, PlayedGame } from './host.ts';

export interface PlayoffGame extends PlayedGame {
  readonly round: PlayoffRound;
  readonly neutralSite: boolean;
}

export { ROUND_LABEL, type PlayoffRound, type Seed };

/** The table as the regular season left it, with the records the
 *  tiebreakers read. Counted from the games, like the server's standings. */
export function clubRecords(game: Game): ClubRecord[] {
  const zero = (teamId: string): ClubRecord => ({
    teamId,
    conferenceId: game.clubs.get(teamId)?.conferenceId ?? '',
    divisionId: game.clubs.get(teamId)?.divisionId ?? '',
    wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0,
    divisionWins: 0, divisionLosses: 0, divisionTies: 0,
    conferenceWins: 0, conferenceLosses: 0, conferenceTies: 0,
  });
  const table = new Map<string, ClubRecord>(game.league.teamIds.map((id) => [id, zero(id)]));
  const credit = (id: string, opponent: string, pf: number, pa: number): void => {
    const r = table.get(id);
    if (r === undefined) return;
    const w = pf > pa ? 1 : 0; const l = pf < pa ? 1 : 0; const t = pf === pa ? 1 : 0;
    const sameDivision = game.clubs.get(id)?.divisionId === game.clubs.get(opponent)?.divisionId;
    const sameConference = game.clubs.get(id)?.conferenceId === game.clubs.get(opponent)?.conferenceId;
    table.set(id, {
      ...r, wins: r.wins + w, losses: r.losses + l, ties: r.ties + t,
      pointsFor: r.pointsFor + pf, pointsAgainst: r.pointsAgainst + pa,
      divisionWins: r.divisionWins + (sameDivision ? w : 0),
      divisionLosses: r.divisionLosses + (sameDivision ? l : 0),
      divisionTies: r.divisionTies + (sameDivision ? t : 0),
      conferenceWins: r.conferenceWins + (sameConference ? w : 0),
      conferenceLosses: r.conferenceLosses + (sameConference ? l : 0),
      conferenceTies: r.conferenceTies + (sameConference ? t : 0),
    });
  };
  for (const g of game.results) {
    credit(g.homeTeamId, g.awayTeamId, g.homeScore, g.awayScore);
    credit(g.awayTeamId, g.homeTeamId, g.awayScore, g.homeScore);
  }
  return [...table.values()];
}

const asResults = (games: readonly PlayedGame[]): Result[] => games.map((g) => ({
  homeTeamId: g.homeTeamId, awayTeamId: g.awayTeamId,
  homeScore: g.homeScore, awayScore: g.awayScore,
}));

const asPlayoffResults = (games: readonly PlayoffGame[]): PlayoffResult[] => games.map((g) => ({
  round: g.round, homeTeamId: g.homeTeamId, awayTeamId: g.awayTeamId,
  homeScore: g.homeScore, awayScore: g.awayScore, neutralSite: g.neutralSite,
}));

/** The fourteen, seeded. Drawn once, when the regular season ends. */
export function seedField(game: Game): Seed[] {
  return seedLeague(clubRecords(game), asResults(game.results),
    createRng(postseasonStream(game.seed, game.season)));
}

/** The round waiting to be played, and its fixtures. */
export function nextRound(game: Game): { round: PlayoffRound | null; champion: string | null } {
  const state = bracket(game.seeds, asPlayoffResults(game.playoffs));
  return { round: state.round, champion: state.champion };
}

/** How far each club got, once the final is played. */
export function playoffOutcomes(game: Game): Map<string, PlayoffOutcome> {
  return outcomes(game.seeds, asPlayoffResults(game.playoffs), game.league.teamIds);
}

/**
 * Plays the round the bracket is on. A playoff game cannot end level and the
 * final is played on neutral ground, both of which the engine is told; the
 * higher seed hosting is the bracket's own doing.
 */
export function playRound(game: Game): Game {
  const state = bracket(game.seeds, asPlayoffResults(game.playoffs));
  if (state.round === null || state.fixtures.length === 0) {
    return { ...game, phase: 'OFFSEASON' };
  }
  const rng = createRng(gameStream(game.seed, game.season, game.week));
  const teams = teamStatesFor(game.league.teamIds, game.league.players,
    { fronts: game.league.fronts, coaches: game.league.coaches });
  const playoffs = [...game.playoffs];
  const weekGames: PlayedGame[] = [];
  const injuries: Absence[] = [];

  for (const fixture of state.fixtures) {
    const home = teams.get(fixture.homeTeamId);
    const away = teams.get(fixture.awayTeamId);
    if (home === undefined || away === undefined) continue;
    const played = simulateGame(home, away, rng, {
      allowTie: false, neutralSite: fixture.neutralSite,
    });
    const record: PlayoffGame = {
      gameId: `S${String(game.season)}P${String(game.week)}_${home.id}_${away.id}`,
      week: game.week, homeTeamId: home.id, awayTeamId: away.id,
      homeScore: played.homeScore, awayScore: played.awayScore, overtime: played.overtime,
      home: played.home, away: played.away, players: played.players,
      round: state.round, neutralSite: fixture.neutralSite,
    };
    playoffs.push(record);
    weekGames.push(record);
    for (const injury of played.injuries) {
      if (injury.returnsThisGame) continue;
      injuries.push(injury);
    }
  }

  const ledger = cloneLedger(game.ledger);
  const news = [...game.news, ...weekNews(
    game, weekGames, [...game.results, ...playoffs], game.standings, injuries, teams, ledger,
    'PLAYOFFS')];
  const after = bracket(game.seeds, asPlayoffResults(playoffs));
  return {
    ...game, week: game.week + 1, playoffs, news, ledger,
    phase: after.champion === null ? 'PLAYOFFS' : 'OFFSEASON',
  };
}
