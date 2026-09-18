import type { Db } from '../db.ts';
export const RANKING_METRICS = [
  { key: 'offense', label: 'Overall offense', unit: 'yards/game', lower: false, detail: 'Total passing plus rushing yards gained per game.' },
  { key: 'defense', label: 'Overall defense', unit: 'yards allowed/game', lower: true, detail: 'Opponent passing plus rushing yards allowed per game; fewer is better.' },
  { key: 'scoring', label: 'Scoring offense', unit: 'points/game', lower: false, detail: 'Team points scored per game.' },
  { key: 'allowed', label: 'Scoring defense', unit: 'points allowed/game', lower: true, detail: 'Opponent points per game; fewer is better.' },
  { key: 'passing', label: 'Passing offense', unit: 'yards/game', lower: false, detail: 'Recorded passing yards per game.' },
  { key: 'rushing', label: 'Rushing offense', unit: 'yards/game', lower: false, detail: 'Recorded rushing yards per game.' },
  { key: 'passDefense', label: 'Passing defense', unit: 'yards allowed/game', lower: true, detail: 'Opponent passing yards per game.' },
  { key: 'rushDefense', label: 'Rushing defense', unit: 'yards allowed/game', lower: true, detail: 'Opponent rushing yards per game.' },
  { key: 'turnovers', label: 'Turnover differential', unit: 'net takeaways', lower: false, detail: 'Total takeaways minus giveaways. Unlike rate metrics, games played affect this total.' },
] as const;
export type Metric = (typeof RANKING_METRICS)[number]['key'];
export interface RankedTeam {
  readonly teamId: string; readonly name: string; readonly games: number;
  readonly totals: Readonly<Record<Metric, number>>;
}
export interface RankingRow { readonly teamId: string; readonly name: string; readonly games: number;
  readonly rank: number | null; readonly value: number | null }
export interface RankingBoard { readonly key: string; readonly label: string; readonly unit: string;
  readonly detail: string; readonly rows: readonly RankingRow[] }
export function rankTeams(teams: readonly RankedTeam[]): RankingBoard[] {
  return RANKING_METRICS.map((metric) => {
    const value = (t: RankedTeam): number | null => t.games === 0 ? null
      : t.totals[metric.key] / (metric.key === 'turnovers' ? 1 : t.games);
    const sorted = [...teams].sort((a, b) => {
      const av = value(a); const bv = value(b);
      if (av === null || bv === null) return av === bv ? a.teamId.localeCompare(b.teamId) : av === null ? 1 : -1;
      return (metric.lower ? av - bv : bv - av) || a.teamId.localeCompare(b.teamId);
    });
    let previous: number | null = null; let rank = 0;
    return { ...metric, rows: sorted.map((t, i) => {
      const v = value(t);
      if (v !== null && v !== previous) rank = i + 1;
      previous = v;
      return { teamId: t.teamId, name: t.name, games: t.games, rank: v === null ? null : rank,
        value: v === null ? null : Math.round(v * 10) / 10 };
    }) };
  });
}
export async function readTeamRankings(db: Db, saveId: string, season: number, through: number): Promise<RankingBoard[]> {
  const clubs = await db<{ team_id: string; name: string }[]>`
    select team_id, metro_area || ' ' || nickname as name from public.teams where save_id = ${saveId} order by team_id`;
  const games = await db<Record<string, string | number | null>[]>`
    select home_team_id, away_team_id, home_score, away_score,
           home_pass_yards, away_pass_yards, home_rush_yards, away_rush_yards, home_turnovers, away_turnovers
      from public.game_results where save_id = ${saveId} and season = ${season}
       and competition = 'REGULAR' and week <= ${through} order by week, game_id`;
  const teams = new Map(clubs.map((c) => [c.team_id, { teamId: c.team_id, name: c.name, games: 0,
    totals: { offense: 0, defense: 0, scoring: 0, allowed: 0, passing: 0, rushing: 0, passDefense: 0, rushDefense: 0, turnovers: 0 } }]));
  for (const g of games) for (const side of ['home', 'away'] as const) {
    const other = side === 'home' ? 'away' : 'home';
    const teamId = g[side + '_team_id'];
    const team = typeof teamId === 'string' ? teams.get(teamId) : undefined;
    if (team === undefined) throw new Error('A regular-season result names a missing team.');
    const n = (key: string): number => {
      const val = g[key];
      if (typeof val !== 'number' || !Number.isFinite(val)) throw new Error('Missing team-ranking statistic: ' + key);
      return val;
    };
    team.games += 1;
    const pass = n(side + '_pass_yards'); const rush = n(side + '_rush_yards');
    const passAgainst = n(other + '_pass_yards'); const rushAgainst = n(other + '_rush_yards');
    const t = team.totals;
    t.offense += pass + rush; t.defense += passAgainst + rushAgainst;
    t.scoring += n(side + '_score'); t.allowed += n(other + '_score');
    t.passing += pass; t.rushing += rush; t.passDefense += passAgainst; t.rushDefense += rushAgainst;
    t.turnovers += n(other + '_turnovers') - n(side + '_turnovers');
  }
  return rankTeams([...teams.values()]);
}
