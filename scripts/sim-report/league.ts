// Builds the real 32-club league from the frozen seed CSVs.
//
// The report measures the actual starting world rather than synthetic clubs,
// because that is the league the game ships with: talent is unevenly spread,
// depth charts are uneven, and win totals only mean something when the teams
// differ. legacy/ is read here, never written; it stays frozen reference data.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  POSITION_GROUPS,
  type EnginePlayer,
  type PositionGroup,
  type TeamState,
} from '../../supabase/functions/_shared/engine/types.ts';

const SEED = join(process.cwd(), 'legacy', 'seed');

/** Minimal CSV reader: handles quoted fields and CRLF line endings. */
function readCsv(name: string): Record<string, string>[] {
  const text = readFileSync(join(SEED, `${name}.csv`), 'utf8');
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }

  const header = rows.shift() ?? [];
  return rows
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const num = (v: string | undefined): number | undefined => {
  if (v === undefined || v === '') return undefined;
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/** Seed positions collapse into the engine's groups. LS has no group and is
 *  dropped: the engine does not model long snapping. */
const GROUP_OF: Readonly<Record<string, PositionGroup>> = {
  QB: 'QB', RB: 'RB', FB: 'RB', WR: 'WR', TE: 'TE',
  OT: 'OL', OG: 'OL', C: 'OL',
  EDGE: 'EDGE', DT: 'DT', LB: 'LB', CB: 'CB', S: 'S',
  K: 'K', P: 'P',
};

/** Active-roster allocation per group. The seed carries ~93 players per club,
 *  which is an offseason roster; a club that plays a game dresses far fewer. */
const ACTIVE: Readonly<Record<PositionGroup, number>> = {
  QB: 3, RB: 4, WR: 6, TE: 3, OL: 9,
  EDGE: 4, DT: 4, LB: 6, CB: 6, S: 4, K: 1, P: 1,
};

/** Detailed attributes are sparse in the seed and position-specific. Anything
 *  absent falls back to `overall` inside the engine, which is a declared
 *  substitution rather than an invented number. */
function ratingsFor(
  overall: number, attrs: Record<string, string> | undefined,
): EnginePlayer['ratings'] {
  const pick = (key: string): number | undefined => num(attrs?.[key]);
  const mean = (...keys: string[]): number | undefined => {
    const found = keys.map(pick).filter((v): v is number => v !== undefined);
    return found.length === 0
      ? undefined
      : found.reduce((a, b) => a + b, 0) / found.length;
  };
  const entries: [string, number | undefined][] = [
    ['passBlock', mean('pass_block', 'pass_protection')],
    ['runBlock', pick('run_block')],
    ['passRush', mean('pass_rush', 'power_move', 'finesse_move')],
    ['runStop', mean('run_defense', 'block_shedding')],
    ['coverage', mean('coverage', 'man_coverage', 'zone_coverage')],
    ['tackling', pick('tackling')],
    ['catching', mean('catching', 'catch_in_traffic')],
    ['routeRunning', mean('route_running', 'separation')],
    ['elusiveness', pick('elusiveness')],
    ['breakTackle', mean('break_tackle', 'contact_balance')],
    ['accuracy', mean('short_accuracy', 'medium_accuracy', 'deep_accuracy')],
    ['decisionMaking', pick('decision_making')],
    ['pocketPresence', pick('pocket_presence')],
    ['kickAccuracy', pick('kick_accuracy')],
    ['kickPower', pick('kick_power')],
    ['puntPower', pick('punt_power')],
  ];
  const ratings: Record<string, number> = { overall };
  for (const [key, value] of entries) {
    if (value !== undefined) ratings[key] = Math.round(value);
  }
  return ratings as EnginePlayer['ratings'];
}

export interface Fixture {
  readonly week: number;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
}

export interface League {
  readonly teams: readonly TeamState[];
  readonly schedule: readonly Fixture[];
  readonly weeks: number;
}

export function loadLeague(): League {
  const teamRows = readCsv('teams');
  const playerRows = readCsv('players');
  const attrRows = readCsv('player_attributes');
  const schemeRows = readCsv('team_schemes');
  const coachRows = readCsv('coaches');
  const scheduleRows = readCsv('season_schedule');

  const attrsById = new Map<string, Record<string, string>>();
  for (const row of attrRows) attrsById.set(row['player_id'] ?? '', row);

  const schemeByTeam = new Map<string, Record<string, string>>();
  for (const row of schemeRows) schemeByTeam.set(row['team_id'] ?? '', row);

  const headCoachByTeam = new Map<string, Record<string, string>>();
  for (const row of coachRows) {
    if (row['role'] === 'Head Coach') headCoachByTeam.set(row['team_id'] ?? '', row);
  }

  const byTeam = new Map<string, EnginePlayer[]>();
  for (const row of playerRows) {
    const teamId = row['team_id'] ?? '';
    const group = GROUP_OF[row['position'] ?? ''];
    const overall = num(row['overall_rating']);
    const id = row['player_id'] ?? '';
    if (teamId === '' || group === undefined || overall === undefined || id === '') continue;
    const attrs = attrsById.get(id);
    const list = byTeam.get(teamId) ?? [];
    list.push({
      id,
      name: row['display_name'] ?? id,
      group,
      ratings: ratingsFor(overall, attrs),
      durability: num(attrs?.['durability']) ?? 70,
      stamina: num(attrs?.['stamina']) ?? 70,
    });
    byTeam.set(teamId, list);
  }

  const teams: TeamState[] = [];
  for (const row of teamRows) {
    const teamId = row['team_id'] ?? '';
    const roster = byTeam.get(teamId);
    if (roster === undefined) {
      throw new Error(`Seed data has no players for team ${teamId}`);
    }

    // Within a group the engine treats the list as a depth chart, so order by
    // rating and cut to an active-roster allocation.
    const depthChart = {} as Record<PositionGroup, string[]>;
    const active: EnginePlayer[] = [];
    for (const group of POSITION_GROUPS) {
      const inGroup = roster
        .filter((p) => p.group === group)
        .sort((a, b) => b.ratings.overall - a.ratings.overall)
        .slice(0, ACTIVE[group]);
      if (inGroup.length === 0) {
        throw new Error(`Team ${teamId} has no ${group} in the seed data`);
      }
      depthChart[group] = inGroup.map((p) => p.id);
      active.push(...inGroup);
    }

    const scheme = schemeByTeam.get(teamId);
    const coach = headCoachByTeam.get(teamId);
    const coachRating = num(coach?.['overall_rating']) ?? 65;
    teams.push({
      id: teamId,
      abbreviation: teamId,
      players: active,
      depthChart,
      scheme: {
        runPassBalance: num(scheme?.['run_pass_balance']) ?? 0.445,
        blitzRate: num(scheme?.['blitz_rate']) ?? 0.26,
        fourthDownAggression: num(scheme?.['fourth_down_aggression']) ?? 50,
        tempo: 50,
      },
      coaching: {
        playCalling: coachRating,
        gameManagement: coachRating,
        clockManagement: coachRating,
        aggressiveness: 50,
      },
    });
  }

  const known = new Set(teams.map((t) => t.id));
  const schedule: Fixture[] = [];
  for (const row of scheduleRows) {
    const week = num(row['week']);
    const home = row['home_team_id'] ?? '';
    const away = row['away_team_id'] ?? '';
    if (week === undefined || !known.has(home) || !known.has(away)) continue;
    schedule.push({ week, homeTeamId: home, awayTeamId: away });
  }
  if (schedule.length === 0) throw new Error('Seed schedule is empty');

  const weeks = schedule.reduce((max, f) => (f.week > max ? f.week : max), 0);
  return { teams, schedule, weeks };
}
