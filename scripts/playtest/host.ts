// The game, hosted in the page.
//
// A test rig, not the product. The real client decides nothing: it reads rows
// a handler wrote (ARCHITECTURE.md rule 2). This file runs the same engine
// calls the handlers run -- the same streams, the same order, the same rules --
// in the browser, so the game can be played on a phone without a server. It
// lives under scripts/ with the other engine harnesses for that reason: nothing
// in src/ may import the engine, and nothing here ships in the product.

import { createRng } from '../../supabase/functions/_shared/engine/rng.ts';
import { simulateGame } from '../../supabase/functions/_shared/engine/simulateGame.ts';
import { teamStatesFor, teamStateFor } from '../../supabase/functions/_shared/engine/careerBridge.ts';
import { permuteSchedule, type Fixture } from '../../supabase/functions/_shared/engine/season.ts';
import {
  MissingUnitError, POSITION_GROUPS,
  type PlayerStatLine, type PositionGroup, type TeamBoxScore, type TeamState,
} from '../../supabase/functions/_shared/engine/types.ts';
import {
  capRules, capSheet, runOffseason, type CapSheet, type CareerPlayer, type League,
} from '../../supabase/functions/_shared/engine/offseason/index.ts';
import { retirementReason } from '../../supabase/functions/_shared/engine/offseason/retirement.ts';
import {
  cloneLedger, createLedger, type NewsItem, type NewsLedger,
} from '../../supabase/functions/_shared/engine/news/index.ts';
import { gameStream, offseasonStream, scheduleStream } from '../../supabase/functions/_shared/api/save.ts';
import { weekNews, type Absence } from './news.ts';
import {
  playoffOutcomes, playRound, seedField, type PlayoffGame,
} from './postseason.ts';
import { coachRecords } from './carousel.ts';
import { seasonAwards } from './awards.ts';
import type { AwardResult } from '../../supabase/functions/_shared/engine/offseason/index.ts';
import { ROLE_LABEL } from '../../supabase/functions/_shared/engine/offseason/coaches.ts';
import type { Seed } from '../../supabase/functions/_shared/engine/playoffs.ts';
import { freshSeed32 } from '../../supabase/functions/_shared/seed.ts';
import { clubs, newLeague, openingAbsences, openingSchedule, type Club } from './world.ts';

export interface PlayedGame {
  readonly gameId: string;
  readonly week: number;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly homeScore: number;
  readonly awayScore: number;
  readonly overtime: boolean;
  readonly home: TeamBoxScore;
  readonly away: TeamBoxScore;
  readonly players: readonly PlayerStatLine[];
}

export interface Standing {
  teamId: string; wins: number; losses: number; ties: number;
  pointsFor: number; pointsAgainst: number; streak: number;
}

export interface SeasonRecord {
  readonly season: number; readonly wins: number; readonly losses: number;
  readonly ties: number; readonly rank: number; readonly championId: string;
  /** How the club you manage finished the postseason. */
  readonly playoffResult: string;
}

export interface Move {
  readonly season: number; readonly kind: string; readonly name: string;
  readonly detail: string;
}

export interface Game {
  readonly league: League;
  readonly clubs: ReadonlyMap<string, Club>;
  readonly userTeamId: string;
  readonly seed: number;
  readonly season: number;
  readonly week: number;
  readonly weeks: number;
  readonly phase: 'REGULAR_SEASON' | 'PLAYOFFS' | 'OFFSEASON';
  readonly schedule: readonly Fixture[];
  readonly results: readonly PlayedGame[];
  readonly standings: ReadonlyMap<string, Standing>;
  /** The fourteen, drawn when the regular season ends. Empty before that. */
  readonly seeds: readonly Seed[];
  readonly playoffs: readonly PlayoffGame[];
  readonly news: readonly NewsItem[];
  readonly ledger: NewsLedger;
  readonly absence: ReadonlyMap<string, number>;
  readonly depthChart: Readonly<Record<PositionGroup, readonly string[]>>;
  readonly history: readonly SeasonRecord[];
  /** Every season's awards and all-league teams, newest last. */
  readonly awards: readonly AwardResult[];
  /** What the last offseason did to the club you manage. */
  readonly moves: readonly Move[];
  readonly abandoned: readonly string[];
}

const emptyStanding = (teamId: string): Standing =>
  ({ teamId, wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, streak: 0 });

const freshTable = (teamIds: readonly string[]): Map<string, Standing> =>
  new Map(teamIds.map((id) => [id, emptyStanding(id)]));

function chartFor(league: League, teamId: string): Record<PositionGroup, readonly string[]> {
  return teamStateFor(teamId, league.players,
    { fronts: league.fronts, coaches: league.coaches }).depthChart;
}

export function newDynasty(userTeamId: string): Game {
  const seed = freshSeed32();
  const league = newLeague(seed);
  const schedule = openingSchedule();
  return {
    league, clubs: clubs(), userTeamId, seed,
    season: league.season, week: 1,
    weeks: schedule.reduce((n, f) => Math.max(n, f.week), 0),
    phase: 'REGULAR_SEASON', schedule, results: [], seeds: [], playoffs: [],
    standings: freshTable(league.teamIds), news: [], ledger: createLedger(league.season),
    absence: openingAbsences(), depthChart: chartFor(league, userTeamId),
    history: [], awards: [], moves: [], abandoned: [],
  };
}

function withUserChart(teams: Map<string, TeamState>, game: Game): Map<string, TeamState> {
  const team = teams.get(game.userTeamId);
  if (team === undefined) return teams;
  const onRoster = new Set(team.players.map((p) => p.id));
  const merged = {} as Record<PositionGroup, readonly string[]>;
  for (const group of POSITION_GROUPS) {
    const chosen = (game.depthChart[group] ?? []).filter((id) => onRoster.has(id));
    const rest = team.depthChart[group]?.filter((id) => !chosen.includes(id)) ?? [];
    merged[group] = [...chosen, ...rest];
  }
  teams.set(game.userTeamId, { ...team, depthChart: merged });
  return teams;
}

function withoutAbsent(team: TeamState, out: ReadonlySet<string>): TeamState {
  if (out.size === 0) return team;
  const chart = {} as Record<PositionGroup, string[]>;
  for (const group of POSITION_GROUPS) {
    chart[group] = [...(team.depthChart[group] ?? [])].filter((id) => !out.has(id));
  }
  return { ...team, depthChart: chart };
}

function credit(standings: Map<string, Standing>, game: PlayedGame): void {
  const home = standings.get(game.homeTeamId);
  const away = standings.get(game.awayTeamId);
  if (home === undefined || away === undefined) return;
  home.pointsFor += game.homeScore; home.pointsAgainst += game.awayScore;
  away.pointsFor += game.awayScore; away.pointsAgainst += game.homeScore;
  if (game.homeScore === game.awayScore) {
    home.ties += 1; away.ties += 1; home.streak = 0; away.streak = 0;
    return;
  }
  const won = game.homeScore > game.awayScore ? home : away;
  const lost = game.homeScore > game.awayScore ? away : home;
  won.wins += 1; lost.losses += 1;
  won.streak = won.streak > 0 ? won.streak + 1 : 1;
  lost.streak = lost.streak < 0 ? lost.streak - 1 : -1;
}

export function simWeek(game: Game): Game {
  if (game.phase === 'PLAYOFFS') return playRound(game);
  if (game.phase !== 'REGULAR_SEASON') return game;
  const rng = createRng(gameStream(game.seed, game.season, game.week));
  const teams = withUserChart(
    teamStatesFor(game.league.teamIds, game.league.players,
      { fronts: game.league.fronts, coaches: game.league.coaches }), game);
  const out = new Set(game.absence.keys());
  const standings = new Map([...game.standings].map(([id, s]) => [id, { ...s }]));
  const absence = new Map(game.absence);
  const results = [...game.results];
  const weekGames: PlayedGame[] = [];
  const abandoned: string[] = [];
  const injuries: Absence[] = [];

  for (const fixture of game.schedule.filter((f) => f.week === game.week)) {
    const home = teams.get(fixture.homeTeamId);
    const away = teams.get(fixture.awayTeamId);
    if (home === undefined || away === undefined) continue;
    let played;
    try {
      played = simulateGame(withoutAbsent(home, out), withoutAbsent(away, out), rng, { allowTie: true });
    } catch (error) {
      if (error instanceof MissingUnitError) {
        abandoned.push(`${fixture.homeTeamId} v ${fixture.awayTeamId} (${error.group})`);
        continue;
      }
      throw error;
    }
    const record: PlayedGame = {
      gameId: `S${String(game.season)}W${String(game.week)}_${home.id}_${away.id}`,
      week: game.week, homeTeamId: home.id, awayTeamId: away.id,
      homeScore: played.homeScore, awayScore: played.awayScore, overtime: played.overtime,
      home: played.home, away: played.away, players: played.players,
    };
    results.push(record); weekGames.push(record);
    credit(standings, record);
    for (const injury of played.injuries) {
      if (injury.returnsThisGame) continue;
      injuries.push(injury);
      const weeks = injury.severity === 'seasonEnding'
        ? game.weeks - game.week + 1 : Math.max(1, injury.weeksOut);
      if (weeks > (absence.get(injury.playerId) ?? 0)) absence.set(injury.playerId, weeks);
    }
  }

  const ledger = cloneLedger(game.ledger);
  const news = [...game.news, ...weekNews(
    game, weekGames, results, standings, injuries, teams, ledger, 'REGULAR_SEASON')];
  for (const [id, left] of absence) {
    if (left <= 1) absence.delete(id); else absence.set(id, left - 1);
  }

  // The regular season over, the field is seeded and the bracket opens.
  const ending = game.week + 1 > game.weeks;
  const next: Game = {
    ...game, week: game.week + 1, results, standings, absence, news, ledger, abandoned,
    phase: ending ? 'PLAYOFFS' : 'REGULAR_SEASON',
  };
  return ending ? { ...next, seeds: seedField(next) } : next;
}

/** Where a club finished, by the table the season ended on. */
export function ranking(standings: ReadonlyMap<string, Standing>): Standing[] {
  return [...standings.values()].sort((a, b) => {
    const played = (s: Standing): number => Math.max(1, s.wins + s.losses + s.ties);
    const pct = (s: Standing): number => (s.wins + s.ties / 2) / played(s);
    return pct(b) - pct(a)
      || (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst)
      || a.teamId.localeCompare(b.teamId);
  });
}

export function advanceSeason(game: Game): Game {
  const table = ranking(game.standings);
  const mine = table.findIndex((s) => s.teamId === game.userTeamId);
  const finished = playoffOutcomes(game);
  const champion = [...finished.entries()].find(([, outcome]) => outcome === 'CHAMPION')?.[0] ?? null;
  const closing = game.standings.get(game.userTeamId) ?? emptyStanding(game.userTeamId);
  // The one accolade the career model counts, and it is won on the field.
  for (const player of game.league.players) {
    if (player.teamId === champion && !player.retired) player.accolades.rings += 1;
  }

  const played = new Map<string, number>();
  for (const g of game.results) {
    for (const line of g.players) played.set(line.playerId, (played.get(line.playerId) ?? 0) + 1);
  }
  for (const player of game.league.players) {
    if (player.teamId === null || player.retired) continue;
    player.gamesMissedSeason = Math.max(0, game.weeks - (played.get(player.id) ?? game.weeks));
    player.gamesMissedCareer += player.gamesMissedSeason;
  }

  const before = new Map(game.league.players.map((p) => [p.id, p.teamId]));
  const season = game.season;
  const headBefore = game.league.coaches.find(
    (c) => c.teamId === game.userTeamId && c.role === 'HEAD_COACH')?.id ?? null;
  const result = runOffseason(game.league, createRng(offseasonStream(game.seed, season)),
    { records: coachRecords(game) });
  // Voted on the season just played, before development moves anyone's rating
  // again. An award is a career fact: it goes on the player.
  const voted = seasonAwards({ ...game, season }, result.grades);
  const byId = new Map(game.league.players.map((p) => [p.id, p]));
  for (const award of voted.awards) {
    const winner = award.winner.playerId === null ? undefined : byId.get(award.winner.playerId);
    if (winner !== undefined) winner.accolades.awards += 1;
  }
  for (const honour of voted.honours) {
    if (honour.team !== 'ALL_LEAGUE_FIRST') continue;
    const player = byId.get(honour.playerId);
    if (player !== undefined) player.accolades.allLeague += 1;
  }

  const mineNow = (p: CareerPlayer): boolean => p.teamId === game.userTeamId;
  const moves: Move[] = [];
  for (const p of result.draft.picks) {
    if (p.teamId !== game.userTeamId) continue;
    const player = game.league.players.find((x) => x.id === p.prospectId);
    moves.push({
      season, kind: 'DRAFTED', name: player?.name ?? p.prospectId,
      detail: `Round ${String(p.round)}, pick ${String(p.overall)} · ${p.group} · ${String(Math.round(player?.ability ?? 0))} ovr`,
    });
  }
  for (const s of result.freeAgency.signings) {
    if (s.teamId !== game.userTeamId) continue;
    const player = game.league.players.find((x) => x.id === s.playerId);
    moves.push({
      season, kind: 'SIGNED', name: player?.name ?? s.playerId,
      detail: `${String(s.years)} yrs · ${(s.aav / 1e6).toFixed(1)}M · ${String(s.bids)} bids`,
    });
  }
  for (const p of result.retired) {
    if (before.get(p.id) !== game.userTeamId) continue;
    moves.push({
      season, kind: retirementReason(p) === 'RETIREMENT' ? 'RETIRED' : 'OUT OF THE LEAGUE',
      name: p.name, detail: `${p.group} · age ${String(Math.round(p.age))}`,
    });
  }
  for (const r of result.released) {
    if (r.teamId !== game.userTeamId) continue;
    const player = game.league.players.find((x) => x.id === r.playerId);
    moves.push({
      season, kind: 'RELEASED', name: player?.name ?? r.playerId,
      detail: r.reason === 'QUOTA' ? 'Cut to the roster limit' : 'Cut to the cap',
    });
  }
  for (const p of result.expired) {
    if (before.get(p.id) !== game.userTeamId || mineNow(p)) continue;
    moves.push({ season, kind: 'LEFT', name: p.name, detail: `${p.group} · deal ran out` });
  }
  for (const m of result.coaches.moves) {
    if (m.teamId !== game.userTeamId && m.fromTeamId !== game.userTeamId) continue;
    moves.push({
      season, kind: m.kind === 'FIRED' ? 'COACH FIRED' : m.kind === 'RETIRED' ? 'COACH RETIRED'
        : m.kind === 'PROMOTED' ? 'COACH PROMOTED' : 'COACH HIRED',
      name: m.name,
      detail: m.kind === 'FIRED'
        ? `Let go${m.record === null ? '' : ` after ${m.record}`}`
        : m.role === null ? 'Left the staff' : ROLE_LABEL[m.role],
    });
  }
  const headAfter = game.league.coaches.find(
    (c) => c.teamId === game.userTeamId && c.role === 'HEAD_COACH')?.id ?? null;
  if (headBefore !== headAfter && headAfter !== null) {
    const hired = game.league.coaches.find((c) => c.id === headAfter);
    if (hired !== undefined) {
      moves.push({
        season, kind: 'NEW HEAD COACH', name: hired.name,
        detail: `${String(Math.round(hired.ability))} overall · ${String(Math.round(hired.experience))} seasons coaching`,
      });
    }
  }

  const teamIds = game.league.teamIds;
  // Next year keeps this year's shape -- 17 games, 18 weeks, the byes where
  // they were -- with the clubs renamed by a seeded permutation.
  const schedule = permuteSchedule(
    game.schedule, teamIds, createRng(scheduleStream(game.seed, game.league.season)));
  const userTeamId = teamIds.includes(game.userTeamId) ? game.userTeamId : (teamIds[0] ?? '');

  return {
    ...game,
    season: game.league.season, week: 1, phase: 'REGULAR_SEASON',
    schedule, results: [], seeds: [], playoffs: [], standings: freshTable(teamIds),
    news: [], ledger: createLedger(game.league.season),
    absence: new Map(), userTeamId, depthChart: chartFor(game.league, userTeamId),
    history: [...game.history, {
      season, wins: closing.wins, losses: closing.losses, ties: closing.ties,
      rank: mine + 1, championId: champion ?? '',
      playoffResult: finished.get(game.userTeamId) ?? 'MISSED',
    }],
    awards: [...game.awards, voted],
    moves, abandoned: [],
  };
}

export function reorder(
  game: Game, group: PositionGroup, playerId: string, direction: -1 | 1,
): Game {
  const order = [...(game.depthChart[group] ?? [])];
  const from = order.indexOf(playerId);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= order.length) return game;
  const moved = order[from];
  const displaced = order[to];
  if (moved === undefined || displaced === undefined) return game;
  order[from] = displaced; order[to] = moved;
  return { ...game, depthChart: { ...game.depthChart, [group]: order } };
}

export function squad(game: Game, teamId: string): CareerPlayer[] {
  return game.league.players.filter((p) => p.teamId === teamId && !p.retired);
}

export function capFor(game: Game, teamId: string): CapSheet {
  return capSheet(teamId, squad(game, teamId), capRules(game.season),
    game.league.deadMoney.get(teamId) ?? 0);
}
