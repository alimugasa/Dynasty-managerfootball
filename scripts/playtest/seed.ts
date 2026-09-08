// The seed, trimmed to what the loader reads, for the play-test build.
//
// The real client never sees this: it reads rows the server projected. This is
// a test rig -- one HTML file that runs the engine in the browser so the game
// can be played on a phone -- and the world has to travel inside it. Only the
// columns careerWorld.ts and the schedule actually read are carried, which is
// the difference between 1.4MB of CSV and about 300KB of JSON.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '../lib/csv.ts';
import type { PackedTable } from './packed.ts';

const SEED = join(process.cwd(), 'legacy', 'seed');

/** Table -> the columns the engine and the schedule need. */
const KEEP: Readonly<Record<string, readonly string[]>> = {
  teams: ['team_id', 'metro_area', 'nickname', 'division_id', 'conference_id',
    'primary_color', 'secondary_color', 'market_size'],
  players: ['player_id', 'display_name', 'team_id', 'position', 'position_group',
    'age', 'experience_years', 'overall_rating', 'potential_rating'],
  player_attributes: ['player_id', 'work_ethic', 'durability', 'football_iq'],
  owners: ['team_id', 'spending_willingness', 'win_now_bias'],
  coaches: ['coach_id', 'team_id'],
  coach_attributes: ['coach_id', 'talent_evaluation'],
  team_rosters: ['player_id', 'team_id', 'roster_status'],
  player_contracts: ['contract_id', 'player_id', 'contract_status', 'start_year',
    'end_year', 'years_total', 'years_remaining', 'average_annual_value', 'guaranteed_money'],
  season_schedule: ['game_id', 'season', 'week', 'home_team_id', 'away_team_id'],
  player_injuries: ['player_id', 'team_id', 'designation', 'weeks_out_estimate'],
};

export function buildSeedJson(): string {
  const out: Record<string, PackedTable> = {};
  for (const [table, columns] of Object.entries(KEEP)) {
    const rows = parseCsv(readFileSync(join(SEED, `${table}.csv`), 'utf8'));
    out[table] = {
      cols: [...columns],
      rows: rows.map((row) => columns.map((column) => {
        const value = row[column];
        // Rule 3: a column the build expects and the CSV does not have stops
        // the build rather than shipping a world with a hole in it.
        if (value === undefined) throw new Error(`${table}.csv has no column "${column}"`);
        return value;
      })),
    };
  }
  return JSON.stringify(out);
}

if (process.argv[1]?.endsWith('seed.ts') === true) {
  const json = buildSeedJson();
  writeFileSync(join(process.cwd(), 'scripts', 'playtest', 'world.json'), json);
  process.stdout.write(`world.json ${String(Math.round(json.length / 1024))}KB\n`);
}
