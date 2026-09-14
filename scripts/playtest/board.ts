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
import { shapeLeague, type TeamMeasure } from '../../supabase/functions/_shared/api/reads/teamShape.ts';
import {
  draftLabel, draftScore, fanPressure, franchiseStatus, ownerMood,
  quarterbackSituation, ratingBand, rosterTimeline, suggestedMove,
} from '../../supabase/functions/_shared/api/reads/teamOutlook.ts';
import {
  GROUP_STARTERS, ON_FIELD as SIDE_STARTERS, ROUND_VALUE as ROUND_POINTS, YOUNG_AGE,
  type LeagueShape,
} from '../../supabase/functions/_shared/api/reads/teamBoard.ts';
import type { TeamProfile } from '../../supabase/functions/_shared/api/reads/teamProfiles.ts';
import { FIRST_SEASON } from '../../supabase/functions/_shared/engine/careerWorld.ts';

const PACKED = worldJson as unknown as Readonly<Record<string, PackedTable>>;

const table = (name: string): Record<string, string>[] => {
  const packed = PACKED[name];
  if (packed === undefined) throw new Error(`The build carries no "${name}" table`);
  return unpack(packed);
};

/** Mirrors teamProfiles.ts, and takes its constants from the same module the
 *  server's query does, so a starter count or a round value cannot be changed
 *  on one side of the wire only. */
const OFFENCE = new Set(['Quarterback', 'Backfield', 'Receiver', 'O-Line']);
const DEFENCE = new Set(['Front Seven', 'Secondary']);
const SPECIAL = new Set(['Specialist']);
const ON_FIELD = {
  O: SIDE_STARTERS.offence, D: SIDE_STARTERS.defence, S: SIDE_STARTERS.special,
} as const;
const ROUND_VALUE = ROUND_POINTS;

/** The seed's group names, as a scouting report would say them. Mirrors
 *  GROUP_LABEL in teamProfiles.ts. */
const GROUP_LABEL: Readonly<Record<string, string>> = {
  Quarterback: 'Quarterback',
  Backfield: 'Backfield',
  Receiver: 'Receiver',
  'O-Line': 'Offensive line',
  'Front Seven': 'Front seven',
  Secondary: 'Secondary',
  Specialist: 'Special teams',
};

interface Roster {
  readonly name: string;
  readonly position: string;
  readonly group: string;
  readonly age: number | null;
  readonly overall: number | null;
  readonly potential: number | null;
}

type Side = 'O' | 'D' | 'S';

const sideOf = (group: string): Side | null => {
  if (OFFENCE.has(group)) return 'O';
  if (DEFENCE.has(group)) return 'D';
  if (SPECIAL.has(group)) return 'S';
  return null;
};

/**
 * The mean of the best `take`, or null when there is nobody to average.
 *
 * `round` mirrors where the server rounds and where it does not. A unit rating
 * is rounded once to a tenth because it is shown; a group rating is left whole
 * because it is only ever compared, and rounding before a comparison is how
 * two groups a hundredth apart swap places -- which is exactly what
 * tests/api/boardParity caught on Atlanta's weakest room.
 */
function topMean(ratings: number[], take: number, round = true): number | null {
  if (ratings.length === 0) return null;
  const best = [...ratings].sort((a, b) => b - a).slice(0, take);
  const mean = best.reduce((a, b) => a + b, 0) / best.length;
  return round ? Math.round(mean * 10) / 10 : mean;
}

const numberOr = (raw: string | undefined): number | null => {
  if (raw === undefined || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

/**
 * The best of a list, by each key in turn, with ties broken last by name.
 *
 * The keys are a list rather than one function because the server's ORDER BY
 * is: two players with the same potential are separated by their rating before
 * they are separated by their names. Sorting on potential alone and falling
 * straight to the name picked a different man on any club with two equal
 * prospects -- which is exactly what tests/api/boardParity caught.
 */
function bestOf(
  players: readonly Roster[], ...keys: readonly ((p: Roster) => number | null)[]
): Roster | undefined {
  return [...players].sort((a, b) => {
    for (const key of keys) {
      const d = (key(b) ?? -1) - (key(a) ?? -1);
      if (d !== 0) return d;
    }
    return a.name.localeCompare(b.name);
  })[0];
}

function playerOut(p: Roster | undefined, withAge = false): TeamProfile['bestPlayer'] {
  if (p === undefined || p.overall === null) return null;
  return {
    name: p.name, position: p.position, overall: p.overall,
    ...(withAge && p.age !== null ? { age: p.age } : {}),
  };
}

/** The season the packed world opens in, so the rig's screens name the same
 *  year the app's do. */
export const BOARD_SEASON = FIRST_SEASON;

/** The shape of the packed league, counted the way the server counts it. The
 *  regular season's length comes from the schedule the seed ships, not from a
 *  constant: eighteen weeks is a fact about this world, not about football. */
export function boardLeague(): LeagueShape {
  const clubIds = new Set(
    table('teams').map((r) => r['team_id'] ?? '').filter((id) => id !== ''));
  const weeks = table('season_schedule')
    .filter((r) => numberOr(r['season']) === FIRST_SEASON)
    .map((r) => numberOr(r['week']) ?? 0);
  return {
    teams: clubIds.size,
    conferences: table('league_conferences').length,
    divisions: table('league_divisions').length,
    regularSeasonWeeks: weeks.length === 0 ? null : Math.max(...weeks),
    draftPicks: table('draft_picks').length,
    season: FIRST_SEASON,
  };
}

/** Every club in the packed world, measured and labelled. */
export function teamProfiles(): TeamProfile[] {
  const conferenceName = new Map(
    table('league_conferences').map((r) => [r['conference_id'] ?? '', r['name'] ?? '']));
  const divisionName = new Map(
    table('league_divisions').map((r) => [r['division_id'] ?? '', r['name'] ?? '']));

  const teams = table('teams').filter((r) => (r['team_id'] ?? '') !== '');
  // Only the thirty-two. The seed parks its free agents on a team_id of "FA",
  // which Postgres rejects through the players-to-teams foreign key and a flat
  // read of the packed table does not: counting them made a thirty-third club
  // that pulled every league average down, and the weakest-room comparison is
  // decided by tenths. tests/api/boardParity is what caught it.
  const clubIds = new Set(teams.map((r) => r['team_id'] ?? ''));

  const rosters = new Map<string, Roster[]>();
  for (const row of table('players')) {
    const teamId = row['team_id'] ?? '';
    if (!clubIds.has(teamId)) continue;
    const held = rosters.get(teamId) ?? [];
    held.push({
      name: row['display_name'] ?? '',
      position: row['position'] ?? '',
      group: row['position_group'] ?? '',
      age: numberOr(row['age']),
      overall: numberOr(row['overall_rating']),
      potential: numberOr(row['potential_rating']),
    });
    rosters.set(teamId, held);
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

  /** Each club's rating in each position room, on the players who start in it. */
  const groupRating = new Map<string, Map<string, number>>();
  for (const [teamId, roster] of rosters) {
    const byGroup = new Map<string, number>();
    for (const [group, starters] of Object.entries(GROUP_STARTERS)) {
      const rated = roster.filter((p) => p.group === group && p.overall !== null)
        .map((p) => p.overall as number);
      const mean = topMean(rated, starters, false);
      if (mean !== null) byGroup.set(group, mean);
    }
    groupRating.set(teamId, byGroup);
  }

  // The league's average for each room, so a club's weakness is measured
  // against everyone else's version of the same room rather than against its
  // own other rooms -- which would call special teams the biggest weakness
  // almost everywhere, a fact about how kickers are rated and not about a club.
  const leagueMean = new Map<string, number>();
  for (const group of Object.keys(GROUP_STARTERS)) {
    const all = [...groupRating.values()]
      .map((m) => m.get(group)).filter((v): v is number => v !== undefined);
    if (all.length > 0) leagueMean.set(group, all.reduce((a, b) => a + b, 0) / all.length);
  }

  const measures: TeamMeasure[] = teams.map((r) => {
    const teamId = r['team_id'] ?? '';
    const roster = rosters.get(teamId) ?? [];
    const side = (s: Side, take: number): number | null => topMean(
      roster.filter((p) => sideOf(p.group) === s && p.overall !== null)
        .map((p) => p.overall as number), take);
    const offense = side('O', ON_FIELD.O);
    const defense = side('D', ON_FIELD.D);
    const specialTeams = side('S', ON_FIELD.S);
    const ages = roster.map((p) => p.age).filter((a): a is number => a !== null);
    const passers = roster.filter((p) => p.position === 'QB' && p.overall !== null)
      .map((p) => p.overall as number).sort((a, b) => b - a);
    return {
      teamId, offense, defense, specialTeams,
      overall: offense === null || defense === null
        ? null
        : Math.round(offense * 0.45 + defense * 0.45 + (specialTeams ?? defense) * 0.1),
      averageAge: ages.length === 0
        ? null
        : Math.round((ages.reduce((a, b) => a + b, 0) / ages.length) * 10) / 10,
      capSpace: capSpace.get(teamId) ?? null,
      draftCapital: capital.get(teamId) ?? null,
      quarterback: passers[0] ?? null,
    };
  });

  const shapes = shapeLeague(measures);

  return teams.map((r, i) => {
    const teamId = r['team_id'] ?? '';
    const m = measures[i] as TeamMeasure;
    const roster = rosters.get(teamId) ?? [];
    const shape = shapes.get(teamId);
    const conferenceId = r['conference_id'] ?? '';
    const divisionId = r['division_id'] ?? '';
    const division = divisionName.get(divisionId) ?? divisionId;
    const metro = r['metro_area'] ?? '';
    const nickname = r['nickname'] ?? '';

    const best = bestOf(roster, (p) => p.overall);
    const young = bestOf(
      roster.filter((p) => p.age !== null && p.age <= YOUNG_AGE
        && (best === undefined || p.name !== best.name)),
      (p) => p.potential, (p) => p.overall);
    const qbs = roster.filter((p) => p.position === 'QB' && p.overall !== null)
      .sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
    const starter = qbs[0];
    const quarterback = quarterbackSituation(
      starter?.overall ?? null, starter?.age ?? null, qbs[1]?.overall ?? null);

    let weakest: { group: string; behind: number } | null = null;
    for (const [group, rating] of groupRating.get(teamId) ?? new Map<string, number>()) {
      const mean = leagueMean.get(group);
      if (mean === undefined) continue;
      const behind = rating - mean;
      if (weakest === null || behind < weakest.behind) weakest = { group, behind };
    }
    const weakness = weakest === null ? null : GROUP_LABEL[weakest.group] ?? weakest.group;
    const score = draftScore(m.draftCapital);
    const outlook = {
      offense: m.offense, defense: m.defense, overall: m.overall,
      averageAge: m.averageAge, capSpace: m.capSpace, draft: score,
      quarterback, weakest: weakness,
      weakestBehind: weakest === null ? null : Math.round(weakest.behind * 10) / 10,
    };
    const marketSize = numberOr(r['market_size']);
    const ownerPatience = patience.get(teamId) ?? null;

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
      overallBand: ratingBand(m.overall),
      offenseBand: ratingBand(m.offense),
      defenseBand: ratingBand(m.defense),
      specialTeamsBand: ratingBand(m.specialTeams),
      capSpace: m.capSpace,
      draftCapital: m.draftCapital,
      draftScore: score,
      draftLabel: draftLabel(score),
      averageAge: m.averageAge,
      rosterCount: roster.length,
      quarterbackStatus: quarterback,
      ownerPatience,
      ownerMood: ownerMood(ownerPatience),
      stadiumCapacity: capacity.get(teamId) ?? null,
      fanPressure: fanPressure(marketSize),
      marketSize,
      bestPlayer: playerOut(best),
      youngPlayer: playerOut(young, true),
      biggestWeakness: weakness,
      rosterTimeline: rosterTimeline(outlook),
      suggestedMove: suggestedMove(outlook),
      franchiseStatus: franchiseStatus(outlook, shape?.difficulty ?? null),
      archetype: shape?.archetype ?? null,
      difficulty: shape?.difficulty ?? null,
      tags: shape?.tags ?? [],
    };
  }).sort((a, b) => (a.conferenceId + a.divisionId + a.city)
    .localeCompare(b.conferenceId + b.divisionId + b.city));
}
