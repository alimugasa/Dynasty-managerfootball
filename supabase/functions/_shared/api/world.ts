// A save's world, read from its own rows.
//
// create_save() clones the template's world tables under the new save id.
// This reads the eight of them the career loader consumes and hands them to that
// loader as cells, exactly as the CSV reader would. The loader does not know
// which source it was given, and that is the point: the league a dynasty plays
// is built by the same code, from the same rules, as the league every report
// and every test measures.
//
// Every value becomes a string because the loader parses strings. NULL becomes
// the empty cell the CSV had, which the loader already treats as absent.

import type { Db } from './db.ts';
import { loadCareerWorld, type SeedReader } from '../engine/careerWorld.ts';
import type { League } from '../engine/offseason/index.ts';

/** Ordered by primary key so the same rows build the same league every time:
 *  the loader's output order is the league's player order, and a query with no
 *  ORDER BY has no order to speak of. */
const WORLD_TABLES: readonly { readonly table: string; readonly key: string }[] = [
  { table: 'teams', key: 'team_id' },
  { table: 'players', key: 'player_id' },
  { table: 'player_attributes', key: 'player_id' },
  { table: 'owners', key: 'owner_id' },
  { table: 'coaches', key: 'coach_id' },
  { table: 'coach_attributes', key: 'coach_id' },
  { table: 'team_rosters', key: 'player_id' },
  { table: 'player_contracts', key: 'contract_id' },
];

function asCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}

export async function loadWorld(db: Db, saveId: string, season: number): Promise<League> {
  const tables = new Map<string, Record<string, string>[]>();
  for (const { table, key } of WORLD_TABLES) {
    const rows = await db<Record<string, unknown>[]>`
      select * from public.${db(table)} where save_id = ${saveId} order by ${db(key)}`;
    tables.set(table, rows.map((row) =>
      Object.fromEntries(Object.entries(row).map(([k, v]) => [k, asCell(v)]))));
  }

  const read: SeedReader = (name) => {
    const rows = tables.get(name);
    if (rows === undefined) {
      throw new Error(`World table "${name}" is not one the loader reads from a save`);
    }
    return rows;
  };

  const league = loadCareerWorld(read);
  league.season = season;
  return league;
}
