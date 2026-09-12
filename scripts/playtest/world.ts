// The world, for the play-test build.
//
// Same loader the server uses (careerWorld.ts), reading the packed seed that
// travels inside the page instead of rows from Postgres. Everything below is
// what the server's create-save handler does, in the order it does it.

import worldJson from './world.json';
import { unpack, type PackedWorld } from './packed.ts';
import { loadCareerWorld, FIRST_SEASON } from '../../supabase/functions/_shared/engine/careerWorld.ts';
import { primePipeline } from '../../supabase/functions/_shared/engine/offseason/population.ts';
import { createRng } from '../../supabase/functions/_shared/engine/rng.ts';
import type { League } from '../../supabase/functions/_shared/engine/offseason/index.ts';
import type { Fixture } from '../../supabase/functions/_shared/engine/season.ts';

const PACKED = worldJson as unknown as PackedWorld;

const table = (name: string): Record<string, string>[] => {
  const packed = PACKED[name];
  if (packed === undefined) throw new Error(`The build carries no "${name}" table`);
  return unpack(packed);
};

export interface Club {
  readonly id: string;
  readonly metro: string;
  readonly nickname: string;
  readonly name: string;
  readonly conferenceId: string;
  readonly divisionId: string;
  readonly primary: string;
  readonly secondary: string;
}

export function clubs(): Map<string, Club> {
  const out = new Map<string, Club>();
  for (const row of table('teams')) {
    const id = row['team_id'] ?? '';
    if (id === '') continue;
    const metro = row['metro_area'] ?? '';
    const nickname = row['nickname'] ?? '';
    out.set(id, {
      id, metro, nickname, name: `${metro} ${nickname}`.trim(),
      conferenceId: row['conference_id'] ?? '', divisionId: row['division_id'] ?? '',
      primary: row['primary_color'] ?? '#28353F', secondary: row['secondary_color'] ?? '#8698A8',
    });
  }
  return out;
}

/** A conference or a division, by the name the league gives it. Mirrors
 *  LeagueGroup in the server's league read. */
export interface Group {
  readonly id: string;
  readonly name: string;
  readonly conferenceId: string | null;
}

export function conferences(): Group[] {
  return table('league_conferences')
    .map((row) => ({ id: row['conference_id'] ?? '', name: row['name'] ?? '', conferenceId: null }))
    .filter((g) => g.id !== '')
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function divisions(): Group[] {
  return table('league_divisions')
    .map((row) => ({
      id: row['division_id'] ?? '', name: row['name'] ?? '',
      conferenceId: row['conference_id'] ?? '',
    }))
    .filter((g) => g.id !== '')
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** The seed's own first-season schedule: 272 games over 18 weeks, with byes. */
export function openingSchedule(): Fixture[] {
  return table('season_schedule')
    .filter((row) => Number(row['season']) === FIRST_SEASON)
    .map((row) => ({
      week: Number(row['week']),
      homeTeamId: row['home_team_id'] ?? '',
      awayTeamId: row['away_team_id'] ?? '',
    }))
    .sort((a, b) => a.week - b.week);
}

/** Who starts the season hurt: the seed's whole injury list, as the server
 *  dates it. A club whose only kicker is on it plays with the punter kicking. */
export function openingAbsences(): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of table('player_injuries')) {
    const weeks = Number(row['weeks_out_estimate']);
    const id = row['player_id'] ?? '';
    if (id === '' || !Number.isFinite(weeks) || weeks < 2) continue;
    out.set(id, weeks - 1);
  }
  return out;
}

/** A league at the first season, its draft pipeline primed. */
export function newLeague(seed: number): League {
  const league = loadCareerWorld((name) => table(name));
  league.season = FIRST_SEASON;
  primePipeline(league, createRng(seed));
  return league;
}

export { FIRST_SEASON };
