// The week's stories: what the generator is told, and where they land.
//
// The inputs are built from what actually happened -- the lines just written,
// the totals just rolled up, the table just recomputed -- not from a parallel
// tally kept in memory. One input the engine has no model for stays empty and
// is named as such: no award races have been defined.

import type { Db } from './db.ts';
import { expectedWins, type League } from '../engine/offseason/index.ts';
import type { PlayerStatLine, TeamState } from '../engine/types.ts';
import { STARTERS } from '../engine/types.ts';
import type { NewsItem, WeekInput } from '../engine/news/types.ts';
import type { PlayedGame, InjuryRow } from './project/stats.ts';
import type { Standing } from './project/standings.ts';

export interface WeekFacts {
  readonly season: number;
  readonly week: number;
  readonly weeks: number;
  /** REGULAR_SEASON or PLAYOFFS: the generator words a knockout differently. */
  readonly phase: string;
  readonly league: League;
  /** The clubs as they took the field, depth charts included. */
  readonly teams: ReadonlyMap<string, TeamState>;
  readonly played: readonly PlayedGame[];
  readonly injuries: readonly InjuryRow[];
  readonly standings: ReadonlyMap<string, Standing>;
}

interface IdentityRow { team_id: string; metro_area: string; nickname: string }
interface TotalsRow {
  player_id: string; pass_yards: number; rush_yards: number; rec_yards: number; sacks: string;
}

/** Roster strength: the mean of a club's best 24 abilities. */
function rating(league: League, teamId: string): number {
  const top = league.players
    .filter((p) => p.teamId === teamId && !p.retired)
    .map((p) => p.ability)
    .sort((a, b) => b - a)
    .slice(0, 24);
  return top.reduce((a, b) => a + b, 0) / Math.max(top.length, 1);
}

export async function buildWeekNews(db: Db, saveId: string, f: WeekFacts): Promise<WeekInput> {
  // The league's mean roster strength, which every club's expectation is
  // measured against.
  const meanRating = f.league.teamIds.reduce((a, id) => a + rating(f.league, id), 0)
    / Math.max(1, f.league.teamIds.length);
  const identities = await db<IdentityRow[]>`
    select team_id, metro_area, nickname from public.teams where save_id = ${saveId}`;
  const nameOf = new Map(identities.map((t) => [t.team_id, t]));
  const byId = new Map(f.league.players.map((p) => [p.id, p]));

  const weekLines = new Map<string, PlayerStatLine>();
  for (const g of f.played) for (const line of g.result.players) weekLines.set(line.playerId, line);

  const totals = await db<TotalsRow[]>`
    select player_id, pass_yards, rush_yards, rec_yards, sacks::text as sacks
      from public.player_season_stats
     where save_id = ${saveId} and season = ${f.season} and competition = 'REGULAR'
       and player_id = any(${[...weekLines.keys()]}::text[])`;
  const totalOf = new Map(totals.map((t) => [t.player_id, t]));

  const isStarter = (teamId: string, playerId: string): boolean => {
    const team = f.teams.get(teamId);
    const player = byId.get(playerId);
    if (team === undefined || player === undefined) return false;
    return (team.depthChart[player.group] ?? []).indexOf(playerId) < STARTERS[player.group];
  };

  return {
    season: f.season,
    week: f.week,
    phase: f.phase,
    totalWeeks: f.weeks,
    games: f.played.map((g) => ({
      gameId: g.gameId, week: g.week,
      homeTeamId: g.result.homeTeamId, awayTeamId: g.result.awayTeamId,
      homeScore: g.result.homeScore, awayScore: g.result.awayScore,
      overtime: g.result.overtime,
    })),
    teams: f.league.teamIds.map((id) => {
      const s = f.standings.get(id);
      const identity = nameOf.get(id);
      return {
        teamId: id,
        name: identity === undefined ? id : `${identity.metro_area} ${identity.nickname}`,
        nickname: identity?.nickname ?? id,
        wins: s?.wins ?? 0, losses: s?.losses ?? 0, ties: s?.ties ?? 0,
        streak: s?.streak ?? 0,
        rating: rating(f.league, id),
      };
    }),
    players: [...weekLines.entries()].flatMap(([playerId, line]) => {
      const p = byId.get(playerId);
      const season = totalOf.get(playerId);
      if (p === undefined || season === undefined) return [];
      return [{
        playerId, name: p.name, teamId: line.teamId, position: p.group,
        gamePassYards: line.passYards, gameRushYards: line.rushYards,
        gameRecYards: line.receivingYards,
        gameTouchdowns: line.passTouchdowns + line.rushTouchdowns + line.receivingTouchdowns,
        seasonPassYards: season.pass_yards, seasonRushYards: season.rush_yards,
        seasonRecYards: season.rec_yards, seasonSacks: Number(season.sacks),
      }];
    }),
    injuries: f.injuries.flatMap((injury) => {
      const p = byId.get(injury.playerId);
      if (p === undefined) return [];
      return [{
        playerId: injury.playerId, name: p.name, teamId: injury.teamId, position: p.group,
        severity: injury.severity as 'minor' | 'shortTerm' | 'majorTerm' | 'seasonEnding',
        weeksOut: injury.weeksOut, starter: isStarter(injury.teamId, injury.playerId),
      }];
    }),
    // Every head coach in the league, against what his roster promised. The
    // expectation is pro-rated to the games played, because the detector
    // compares it with the wins a club has in week nine, not with a full
    // season's.
    coaches: f.league.coaches.flatMap((coach) => {
      if (coach.retired || coach.teamId === null || coach.role !== 'HEAD_COACH') return [];
      const standing = f.standings.get(coach.teamId);
      if (standing === undefined) return [];
      const played = standing.wins + standing.losses + standing.ties;
      if (played === 0) return [];
      const games = Math.max(1, f.weeks - 1);
      const full = expectedWins(rating(f.league, coach.teamId), meanRating, games);
      return [{
        coachId: coach.id, name: coach.name, teamId: coach.teamId,
        wins: standing.wins, losses: standing.losses,
        expectedWins: (full * played) / games,
        seasonsWithTeam: Math.max(1, Math.round(coach.yearsWithTeam)),
        hotSeat: coach.hotSeat,
      }];
    }),
    // No award races defined; that category stays silent rather than
    // inventing a race nobody is running.
    awardRaces: [],
  };
}

export async function insertNews(db: Db, saveId: string, items: readonly NewsItem[]): Promise<void> {
  if (items.length === 0) return;
  await db`
    insert into public.news (
      save_id, season, week, phase, category, headline, body, team_id, player_id,
      game_id, importance)
    select ${saveId}, u.season, u.week, u.phase, u.category, u.headline, u.body,
           u.team_id, u.player_id, u.game_id, u.importance
      from unnest(
        ${items.map((i) => i.season)}::int[], ${items.map((i) => i.week)}::int[],
        ${items.map((i) => i.phase)}::text[], ${items.map((i) => i.category)}::text[],
        ${items.map((i) => i.headline)}::text[], ${items.map((i) => i.body)}::text[],
        ${items.map((i) => i.teamId)}::text[], ${items.map((i) => i.playerId)}::text[],
        ${items.map((i) => i.gameId)}::text[], ${items.map((i) => i.importance)}::int[]
      ) as u(season, week, phase, category, headline, body, team_id, player_id, game_id, importance)`;
}
