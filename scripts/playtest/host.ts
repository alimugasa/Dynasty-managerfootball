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
import { buildSchedule, type Fixture } from '../../supabase/functions/_shared/engine/season.ts';
import {
  MissingUnitError, POSITION_GROUPS, STARTERS,
  type PlayerStatLine, type PositionGroup, type TeamBoxScore, type TeamState,
} from '../../supabase/functions/_shared/engine/types.ts';
import {
  capRules, capSheet, runOffseason, type CapSheet, type CareerPlayer, type League,
} from '../../supabase/functions/_shared/engine/offseason/index.ts';
import { retirementReason } from '../../supabase/functions/_shared/engine/offseason/retirement.ts';
import {
  cloneLedger, createLedger, generateWeeklyNews,
  type NewsItem, type NewsLedger,
} from '../../supabase/functions/_shared/engine/news/index.ts';
import type { WeekInput } from '../../supabase/functions/_shared/engine/news/types.ts';
import { gameStream, newsStream, offseasonStream } from '../../supabase/functions/_shared/api/save.ts';
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
  readonly phase: 'REGULAR_SEASON' | 'OFFSEASON';
  readonly schedule: readonly Fixture[];
  readonly results: readonly PlayedGame[];
  readonly standings: ReadonlyMap<string, Standing>;
  readonly news: readonly NewsItem[];
  readonly ledger: NewsLedger;
  readonly absence: ReadonlyMap<string, number>;
  readonly depthChart: Readonly<Record<PositionGroup, readonly string[]>>;
  readonly history: readonly SeasonRecord[];
  /** What the last offseason did to the club you manage. */
  readonly moves: readonly Move[];
  readonly abandoned: readonly string[];
}

const emptyStanding = (teamId: string): Standing =>
  ({ teamId, wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, streak: 0 });

const freshTable = (teamIds: readonly string[]): Map<string, Standing> =>
  new Map(teamIds.map((id) => [id, emptyStanding(id)]));

function chartFor(league: League, teamId: string): Record<PositionGroup, readonly string[]> {
  return teamStateFor(teamId, league.players, { fronts: league.fronts }).depthChart;
}

export function newDynasty(userTeamId: string): Game {
  const seed = freshSeed32();
  const league = newLeague(seed);
  const schedule = openingSchedule();
  return {
    league, clubs: clubs(), userTeamId, seed,
    season: league.season, week: 1,
    weeks: schedule.reduce((n, f) => Math.max(n, f.week), 0),
    phase: 'REGULAR_SEASON', schedule, results: [],
    standings: freshTable(league.teamIds), news: [], ledger: createLedger(league.season),
    absence: openingAbsences(), depthChart: chartFor(league, userTeamId),
    history: [], moves: [], abandoned: [],
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
  if (game.phase !== 'REGULAR_SEASON') return game;
  const rng = createRng(gameStream(game.seed, game.season, game.week));
  const teams = withUserChart(
    teamStatesFor(game.league.teamIds, game.league.players, { fronts: game.league.fronts }), game);
  const out = new Set(game.absence.keys());
  const standings = new Map([...game.standings].map(([id, s]) => [id, { ...s }]));
  const absence = new Map(game.absence);
  const results = [...game.results];
  const weekGames: PlayedGame[] = [];
  const abandoned: string[] = [];
  const injuries: { playerId: string; teamId: string; severity: string; weeksOut: number }[] = [];

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
  const news = [...game.news, ...weekNews(game, weekGames, results, standings, injuries, teams, ledger)];
  for (const [id, left] of absence) {
    if (left <= 1) absence.delete(id); else absence.set(id, left - 1);
  }

  return {
    ...game, week: game.week + 1, results, standings, absence, news, ledger, abandoned,
    phase: game.week + 1 > game.weeks ? 'OFFSEASON' : 'REGULAR_SEASON',
  };
}

function weekNews(
  game: Game, weekGames: readonly PlayedGame[], all: readonly PlayedGame[],
  standings: ReadonlyMap<string, Standing>,
  injuries: readonly { playerId: string; teamId: string; severity: string; weeksOut: number }[],
  teams: ReadonlyMap<string, TeamState>, ledger: NewsLedger,
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
    season: game.season, week: game.week, phase: 'REGULAR_SEASON', totalWeeks: game.weeks,
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
  const champion = table[0];
  const closing = game.standings.get(game.userTeamId) ?? emptyStanding(game.userTeamId);

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
  const result = runOffseason(game.league, createRng(offseasonStream(game.seed, season)));

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

  const teamIds = game.league.teamIds;
  const schedule = buildSchedule(teamIds, game.weeks)
    .filter((f) => f.homeTeamId !== '__BYE__' && f.awayTeamId !== '__BYE__');
  const userTeamId = teamIds.includes(game.userTeamId) ? game.userTeamId : (teamIds[0] ?? '');

  return {
    ...game,
    season: game.league.season, week: 1, phase: 'REGULAR_SEASON',
    schedule, results: [], standings: freshTable(teamIds),
    news: [], ledger: createLedger(game.league.season),
    absence: new Map(), userTeamId, depthChart: chartFor(game.league, userTeamId),
    history: [...game.history, {
      season, wins: closing.wins, losses: closing.losses, ties: closing.ties,
      rank: mine + 1, championId: champion?.teamId ?? '',
    }],
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
