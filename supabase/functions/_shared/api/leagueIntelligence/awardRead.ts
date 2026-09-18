import type { Db } from '../db.ts';
import { positionGroup } from '../positionGroup.ts';
import { rankAwardRaces, type RacePlayer } from './awardModel.ts';

const FIELDS = {
  passYards: 'pass_yards', passAttempts: 'pass_att', passTD: 'pass_tds', thrownINT: 'interceptions',
  rushYards: 'rush_yards', rushes: 'rushes', rushTD: 'rush_tds',
  recYards: 'rec_yards', targets: 'targets', recTD: 'rec_tds',
  tackles: 'tackles', sacks: 'sacks', interceptions: 'ints_caught',
} as const;
export async function readAwardRaces(db: Db, saveId: string, season: number, through: number) {
  const rows = await db<Record<string, unknown>[]>`
    select g.*, p.display_name, p.position, p.experience_years
      from public.player_game_stats g left join public.players p on p.save_id = g.save_id and p.player_id = g.player_id
     where g.save_id = ${saveId} and g.season = ${season} and g.competition = 'REGULAR'
       and g.week <= ${through} order by g.week, g.game_id, g.player_id`;
  const games = await db<{ team_id: string; games: number }[]>`
    select team_id, count(*)::int as games from (
      select home_team_id as team_id from public.game_results
       where save_id = ${saveId} and season = ${season} and competition = 'REGULAR' and week <= ${through}
      union all
      select away_team_id from public.game_results
       where save_id = ${saveId} and season = ${season} and competition = 'REGULAR' and week <= ${through}
    ) g group by team_id`;
  const recordedSides = new Set(rows.map((r) => String(r['game_id']) + ':' + String(r['team_id'])));
  if (recordedSides.size !== games.reduce((n, g) => n + g.games, 0)) {
    throw new Error('Missing player game statistics for a completed regular-season fixture.');
  }
  const total = new Map<string, RacePlayer>();
  for (const r of rows) {
    const text = (key: string): string => {
      const value = r[key];
      if (typeof value !== 'string' || value === '') throw new Error('Missing award-race data: ' + key);
      return value;
    };
    const n = (key: string): number => {
      const raw = r[key];
      if (raw === null || raw === undefined || !Number.isFinite(Number(raw))) throw new Error('Missing award-race statistic: ' + key);
      return Number(raw);
    };
    const id = text('player_id'); const position = text('position'); const group = positionGroup(position);
    if (group === undefined) throw new Error('Unknown award-race position ' + position);
    const prior = total.get(id);
    const sums = Object.fromEntries(Object.entries(FIELDS).map(([key, column]) =>
      [key, n(column) + (prior === undefined ? 0 : prior[key as keyof typeof FIELDS])])) as Pick<RacePlayer, keyof typeof FIELDS>;
    total.set(id, { ...sums, playerId: id, name: text('display_name'), teamId: text('team_id'),
      position, group, experience: n('experience_years'), games: prior === undefined ? 1 : prior.games + 1 });
  }
  return rankAwardRaces([...total.values()], new Map(games.map((g) => [g.team_id, g.games])));
}
