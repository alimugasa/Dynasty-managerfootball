// The scouting board, built in the browser from the packed seed.
//
// The same measurements the server's team-profiles read takes, over the same
// columns, put through the same shapeLeague -- so a club that is a Playoff
// Push in the app is a Playoff Push here. The two builds compute the numbers
// separately because they have different worlds to read; they must not have
// different opinions about what the numbers mean, which is why the judgement
// lives in one shared module and only the gathering is duplicated.

import { unpack, type PackedTable } from './packed.ts';
import worldJson from './world.json';
import {
  quarterbackStatus, shapeLeague, type TeamMeasure,
} from '../../supabase/functions/_shared/api/reads/teamShape.ts';
import type { TeamProfile } from '../../supabase/functions/_shared/api/reads/teamProfiles.ts';
import { FIRST_SEASON } from '../../supabase/functions/_shared/engine/careerWorld.ts';

const PACKED = worldJson as unknown as Readonly<Record<string, PackedTable>>;

const table = (name: string): Record<string, string>[] => {
  const packed = PACKED[name];
  if (packed === undefined) throw new Error(`The build carries no "${name}" table`);
  return unpack(packed);
};

/** Mirrors teamProfiles.ts. A group that moves has to move in both. */
const OFFENCE = new Set(['Quarterback', 'Backfield', 'Receiver', 'O-Line']);
const DEFENCE = new Set(['Front Seven', 'Secondary']);
const SPECIAL = new Set(['Specialist']);
const ON_FIELD = { O: 11, D: 11, S: 3 } as const;
const ROUND_VALUE = [100, 60, 36, 22, 13, 8, 5];

type Side = 'O' | 'D' | 'S';

const sideOf = (group: string): Side | null => {
  if (OFFENCE.has(group)) return 'O';
  if (DEFENCE.has(group)) return 'D';
  if (SPECIAL.has(group)) return 'S';
  return null;
};

/** The mean of the best `take`, or null when there is nobody to average. */
function topMean(ratings: number[], take: number): number | null {
  if (ratings.length === 0) return null;
  const best = [...ratings].sort((a, b) => b - a).slice(0, take);
  const sum = best.reduce((a, b) => a + b, 0);
  return Math.round((sum / best.length) * 10) / 10;
}

const numberOr = (raw: string | undefined): number | null => {
  if (raw === undefined || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

/** Every club in the packed world, measured and labelled. */
export function teamProfiles(): TeamProfile[] {
  const conferenceName = new Map(
    table('league_conferences').map((r) => [r['conference_id'] ?? '', r['name'] ?? '']));
  const divisionName = new Map(
    table('league_divisions').map((r) => [r['division_id'] ?? '', r['name'] ?? '']));

  const units = new Map<string, Record<Side, number[]>>();
  const ages = new Map<string, number[]>();
  const quarterbacks = new Map<string, number>();
  for (const row of table('players')) {
    const teamId = row['team_id'] ?? '';
    if (teamId === '') continue;
    const rating = numberOr(row['overall_rating']);
    const side = sideOf(row['position_group'] ?? '');
    if (rating !== null && side !== null) {
      const held = units.get(teamId) ?? { O: [], D: [], S: [] };
      held[side].push(rating);
      units.set(teamId, held);
    }
    const age = numberOr(row['age']);
    if (age !== null) ages.set(teamId, [...(ages.get(teamId) ?? []), age]);
    if (rating !== null && (row['position'] ?? '') === 'QB') {
      quarterbacks.set(teamId, Math.max(quarterbacks.get(teamId) ?? 0, rating));
    }
  }

  const capital = new Map<string, number>();
  for (const row of table('draft_picks')) {
    const teamId = row['current_owner_team_id'] ?? '';
    const round = numberOr(row['round']);
    if (teamId === '' || round === null) continue;
    capital.set(teamId, (capital.get(teamId) ?? 0) + (ROUND_VALUE[round - 1] ?? 0));
  }

  const capSpace = new Map<string, number>();
  for (const row of table('salary_cap')) {
    if (numberOr(row['season']) !== FIRST_SEASON) continue;
    const available = numberOr(row['available']);
    if (available !== null) capSpace.set(row['team_id'] ?? '', available);
  }

  const patience = new Map<string, number | null>(
    table('owners').map((r) => [r['team_id'] ?? '', numberOr(r['patience'])]));
  const capacity = new Map<string, number | null>(
    table('stadiums').map((r) => [r['team_id'] ?? '', numberOr(r['capacity'])]));

  const teams = table('teams').filter((r) => (r['team_id'] ?? '') !== '');

  const measures: TeamMeasure[] = teams.map((r) => {
    const teamId = r['team_id'] ?? '';
    const held = units.get(teamId) ?? { O: [], D: [], S: [] };
    const offense = topMean(held.O, ON_FIELD.O);
    const defense = topMean(held.D, ON_FIELD.D);
    const specialTeams = topMean(held.S, ON_FIELD.S);
    const age = ages.get(teamId) ?? [];
    return {
      teamId, offense, defense, specialTeams,
      overall: offense === null || defense === null
        ? null
        : Math.round(offense * 0.45 + defense * 0.45 + (specialTeams ?? defense) * 0.1),
      averageAge: age.length === 0
        ? null
        : Math.round((age.reduce((a, b) => a + b, 0) / age.length) * 10) / 10,
      capSpace: capSpace.get(teamId) ?? null,
      draftCapital: capital.get(teamId) ?? null,
      quarterback: quarterbacks.get(teamId) ?? null,
    };
  });

  const shapes = shapeLeague(measures);

  return teams.map((r, i) => {
    const teamId = r['team_id'] ?? '';
    const m = measures[i] as TeamMeasure;
    const shape = shapes.get(teamId);
    const conferenceId = r['conference_id'] ?? '';
    const divisionId = r['division_id'] ?? '';
    const division = divisionName.get(divisionId) ?? divisionId;
    const metro = r['metro_area'] ?? '';
    const nickname = r['nickname'] ?? '';
    return {
      teamId, abbreviation: teamId, city: metro, teamName: nickname,
      fullName: `${metro} ${nickname}`.trim(),
      conferenceId, conferenceName: conferenceName.get(conferenceId) ?? conferenceId,
      divisionId, divisionName: division,
      divisionShort: division.startsWith(`${conferenceId} `)
        ? division.slice(conferenceId.length + 1)
        : division,
      primary: r['primary_color'] ?? '#28353F',
      secondary: r['secondary_color'] ?? '#8698A8',
      overall: m.overall, offense: m.offense, defense: m.defense,
      specialTeams: m.specialTeams,
      capSpace: m.capSpace, draftCapital: m.draftCapital, averageAge: m.averageAge,
      quarterbackStatus: quarterbackStatus(m.quarterback),
      ownerPatience: patience.get(teamId) ?? null,
      stadiumCapacity: capacity.get(teamId) ?? null,
      fanPressure: null,
      archetype: shape?.archetype ?? null,
      difficulty: shape?.difficulty ?? null,
      tags: shape?.tags ?? [],
    };
  }).sort((a, b) => (a.conferenceId + a.divisionId + a.city)
    .localeCompare(b.conferenceId + b.divisionId + b.city));
}
