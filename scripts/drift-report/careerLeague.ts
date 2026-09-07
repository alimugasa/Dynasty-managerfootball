// Builds the career-level league from the frozen seed CSVs.
//
// Same 32 clubs and the same players as the game-simulation loader, but carrying
// the fields a career needs -- age, experience, potential, work ethic, football
// intelligence, durability -- rather than the fields a snap needs.

import { numberOrUndefined, readSeedCsv } from '../lib/seedCsv.ts';
import { POSITION_GROUPS, type PositionGroup } from '../../supabase/functions/_shared/engine/types.ts';
import {
  ROSTER_QUOTA, type CareerPlayer, type League,
} from '../../supabase/functions/_shared/engine/offseason/index.ts';

const GROUP_OF: Readonly<Record<string, PositionGroup>> = {
  QB: 'QB', RB: 'RB', FB: 'RB', WR: 'WR', TE: 'TE',
  OT: 'OL', OG: 'OL', C: 'OL',
  EDGE: 'EDGE', DT: 'DT', LB: 'LB', CB: 'CB', S: 'S',
  K: 'K', P: 'P',
};

export const FIRST_SEASON = 2026;

export function loadCareerLeague(): League {
  const teamRows = readSeedCsv('teams');
  const playerRows = readSeedCsv('players');
  const attrRows = readSeedCsv('player_attributes');

  const attrsById = new Map<string, Record<string, string>>();
  for (const row of attrRows) attrsById.set(row['player_id'] ?? '', row);

  const teamIds = teamRows.map((r) => r['team_id'] ?? '').filter((id) => id !== '');
  const known = new Set(teamIds);

  const players: CareerPlayer[] = [];
  for (const row of playerRows) {
    const id = row['player_id'] ?? '';
    const group = GROUP_OF[row['position'] ?? ''];
    const ability = numberOrUndefined(row['overall_rating']);
    const teamId = row['team_id'] ?? '';
    if (id === '' || group === undefined || ability === undefined || !known.has(teamId)) continue;

    const attrs = attrsById.get(id);
    const potential = numberOrUndefined(row['potential_rating']) ?? ability;
    players.push({
      id,
      name: row['display_name'] ?? id,
      group,
      teamId,
      ability,
      // A potential below current ability would mean a player with negative
      // headroom, which the growth term cannot express. Clamp rather than
      // silently produce a gap of zero for a player the data says is peaking.
      potential: Math.max(ability, potential),
      mental: 0,
      // Everyone starts perceived at their ability; the lag builds from here.
      reputation: ability,
      age: numberOrUndefined(row['age']) ?? 25,
      experience: numberOrUndefined(row['experience_years']) ?? 0,
      // The seed has no per-player development rate. Deriving one from the data
      // it does have -- work ethic -- is a documented model choice, not an
      // invented column: it is stated here rather than hidden in the loader.
      devRate: 0.7 + ((numberOrUndefined(attrs?.['work_ethic']) ?? 70) / 100) * 0.6,
      workEthic: numberOrUndefined(attrs?.['work_ethic']) ?? 70,
      durability: numberOrUndefined(attrs?.['durability']) ?? 72,
      footballIq: numberOrUndefined(attrs?.['football_iq']) ?? 70,
      gamesMissedCareer: 0,
      gamesMissedSeason: 0,
      accolades: { allLeague: 0, awards: 0, rings: 0 },
      retired: false,
      retiredInSeason: null,
    });
  }

  if (players.length === 0) throw new Error('Seed data produced no career players');

  // The seed carries roughly 93 players per club, an offseason roster. Trim each
  // club to its 53-man quota by ability; the rest enter the pool as free agents
  // and mostly wash out, which is what happens to them.
  for (const teamId of teamIds) {
    for (const group of POSITION_GROUPS) {
      const held = players
        .filter((p) => p.teamId === teamId && p.group === group)
        .sort((a, b) => b.ability - a.ability);
      for (const player of held.slice(ROSTER_QUOTA[group])) player.teamId = null;
    }
  }

  return { teamIds, players, pipeline: new Map(), season: FIRST_SEASON };
}
