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
  // The league names its own conferences and divisions. The rig shows those
  // names rather than deriving labels from the ids, exactly as the server's
  // league read does.
  // abbreviation, short_name and region are carried so the rig builds its
  // conference and division labels from the same columns the app does.
  league_conferences: ['conference_id', 'name', 'abbreviation', 'short_name'],
  league_divisions: ['division_id', 'conference_id', 'name', 'region'],
  players: ['player_id', 'display_name', 'team_id', 'position', 'position_group',
    'age', 'experience_years', 'overall_rating', 'potential_rating'],
  player_attributes: ['player_id', 'work_ethic', 'durability', 'football_iq'],
  // owner_name and archetype are carried so the rig's dashboard can name the
  // owner the way the app's does. The engine does not read either.
  owners: ['team_id', 'owner_name', 'archetype', 'spending_willingness', 'win_now_bias', 'patience'],
  // Carried for the scouting board on Select Team, which measures the same
  // things the server's team-profiles read measures. Four hundred and eighty
  // short rows between them; the alternative is a board whose cap and draft
  // columns are blank in the build people actually play.
  stadiums: ['team_id', 'capacity'],
  draft_picks: ['round', 'current_owner_team_id'],
  salary_cap: ['team_id', 'season', 'available'],
  coaches: ['coach_id', 'display_name', 'team_id', 'role', 'age', 'years_experience',
    'coaching_tree', 'prior_head_coach', 'hot_seat_rating', 'overall_rating'],
  coach_attributes: ['coach_id', 'play_calling', 'game_management', 'player_development',
    'talent_evaluation', 'leadership', 'aggressiveness', 'clock_management'],
  team_coaching_staff: ['coach_id', 'team_id', 'role', 'side_of_ball', 'years_with_team',
    'play_calling_duty'],
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
