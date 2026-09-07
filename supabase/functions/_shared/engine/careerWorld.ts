// Builds the career-level league from the seed tables.
//
// The reader is injected and there is no I/O anywhere in this file. The
// scripts bind it to CSV files on disk (scripts/drift-report/careerLeague.ts);
// the server binds it to a save's world rows in Postgres (_shared/api/world.ts).
// One loader, two sources, so the world a report measures and the world a
// dynasty plays are built by the same rules.
//
// Same 32 clubs and the same players as the game-simulation loader, but carrying
// the fields a career needs -- age, experience, potential, work ethic, football
// intelligence, durability -- rather than the fields a snap needs. The roster
// is the seed's own (team_rosters.roster_status), the contracts are the seed's
// own (player_contracts), and the players the seed lists without a club enter
// the free-agent pool.

import type { PositionGroup } from './types.ts';
import {
  FA_PERSONALITIES, type CareerPlayer, type FaPersonality, type League, type TeamFront,
} from './offseason/index.ts';

/** A cell as a number, or undefined when it is empty or not numeric. Never
 *  zero for a blank: rule 3. */
export function numberOrUndefined(v: string | undefined): number | undefined {
  if (v === undefined || v === '') return undefined;
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Stable pseudo-random integer in [0, n) from a string. */
function hashInt(text: string, n: number): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash % n;
}

/** The seed has no personality column. Derived from the player id by hash
 *  rather than drawn at random: the loader takes no generator, and a stable
 *  mapping means the same seed player is the same character every run. */
function personalityFor(id: string): FaPersonality {
  return FA_PERSONALITIES[hashInt(id, FA_PERSONALITIES.length)] as FaPersonality;
}

export const GROUP_OF: Readonly<Record<string, PositionGroup>> = {
  QB: 'QB', RB: 'RB', FB: 'RB', WR: 'WR', TE: 'TE',
  OT: 'OL', OG: 'OL', C: 'OL',
  EDGE: 'EDGE', DT: 'DT', LB: 'LB', CB: 'CB', S: 'S',
  K: 'K', P: 'P',
};

export const FIRST_SEASON = 2026;

/** How the loader gets a table. Injectable so the browser build can hand it
 *  bundled CSV strings instead of a filesystem, and run the same loader rather
 *  than a second one that drifts from it. */
export type SeedReader = (name: string) => Record<string, string>[];

export function loadCareerWorld(read: SeedReader): League {
  const teamRows = read('teams');
  const playerRows = read('players');
  const attrRows = read('player_attributes');
  const ownerRows = read('owners');
  const coachRows = read('coaches');
  const coachAttrRows = read('coach_attributes');
  const rosterRows = read('team_rosters');
  const contractRows = read('player_contracts');

  const attrsById = new Map<string, Record<string, string>>();
  for (const row of attrRows) attrsById.set(row['player_id'] ?? '', row);

  const teamIds = teamRows.map((r) => r['team_id'] ?? '').filter((id) => id !== '');
  const known = new Set(teamIds);

  // Front-office state, built from the seed rather than invented: the owner
  // rows carry spending willingness and win-now bias, and the scouting
  // department is read off whichever coach evaluates talent for the club.
  const ownerByTeam = new Map<string, Record<string, string>>();
  for (const row of ownerRows) ownerByTeam.set(row['team_id'] ?? '', row);

  const coachAttrById = new Map<string, Record<string, string>>();
  for (const row of coachAttrRows) coachAttrById.set(row['coach_id'] ?? '', row);

  const evaluatorByTeam = new Map<string, number>();
  for (const row of coachRows) {
    const teamId = row['team_id'] ?? '';
    if (teamId === '') continue;
    const evaluation = numberOrUndefined(
      coachAttrById.get(row['coach_id'] ?? '')?.['talent_evaluation'],
    );
    if (evaluation === undefined) continue;
    const best = evaluatorByTeam.get(teamId);
    if (best === undefined || evaluation > best) evaluatorByTeam.set(teamId, evaluation);
  }

  const fronts = new Map<string, TeamFront>();
  for (const row of teamRows) {
    const teamId = row['team_id'] ?? '';
    if (teamId === '') continue;
    const owner = ownerByTeam.get(teamId);
    const spending = numberOrUndefined(owner?.['spending_willingness']) ?? 60;
    const marketSize = numberOrUndefined(row['market_size']) ?? 5;
    fronts.set(teamId, {
      id: teamId,
      scouting: evaluatorByTeam.get(teamId) ?? 60,
      spending,
      winNow: numberOrUndefined(owner?.['win_now_bias']) ?? 0.5,
      // Standing a player is buying into. Market size is the seed's own proxy.
      prestige: Math.max(20, Math.min(99, 38 + marketSize * 5)),
      recentWinRate: 0.5,
      // A club that will spend on players will spend on scouts.
      scoutingSpend: 0.6 + (spending / 99) * 0.8,
    });
  }

  // The seed's own designation of who is on the 53: team_rosters.roster_status.
  // The rest of a club's ninety (practice-squad candidates, camp bodies) enter
  // the pool as free agents with the club as their previous club.
  const activeClub = new Map<string, string>();
  for (const row of rosterRows) {
    if (row['roster_status'] !== 'ACTIVE') continue;
    const id = row['player_id'] ?? '';
    const teamId = row['team_id'] ?? '';
    if (id !== '' && known.has(teamId)) activeClub.set(id, teamId);
  }

  // The seed's own deals. Same shape as the engine's: an average annual value,
  // a term, years left, a guaranteed total, and the season it was signed.
  const contractByPlayer = new Map<string, Record<string, string>>();
  for (const row of contractRows) {
    if ((row['contract_status'] ?? 'ACTIVE') !== 'ACTIVE') continue;
    const id = row['player_id'] ?? '';
    const held = contractByPlayer.get(id);
    if (held === undefined
        || (numberOrUndefined(row['end_year']) ?? 0) > (numberOrUndefined(held['end_year']) ?? 0)) {
      contractByPlayer.set(id, row);
    }
  }

  const players: CareerPlayer[] = [];
  for (const row of playerRows) {
    const id = row['player_id'] ?? '';
    const group = GROUP_OF[row['position'] ?? ''];
    const ability = numberOrUndefined(row['overall_rating']);
    if (id === '' || group === undefined || ability === undefined) continue;

    // 'FA' is the CSV's sentinel for no club; the database says NULL.
    const raw = row['team_id'] ?? '';
    const club = known.has(raw) ? raw : null;
    const rostered = club !== null && activeClub.get(id) === club;

    const attrs = attrsById.get(id);
    const potential = numberOrUndefined(row['potential_rating']) ?? ability;
    players.push({
      id,
      name: row['display_name'] ?? id,
      group,
      teamId: rostered ? club : null,
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
      personality: personalityFor(id),
      contract: rostered ? seedContract(id, contractByPlayer.get(id)) : null,
      previousTeamId: club,
    });
  }

  if (players.length === 0) throw new Error('Seed data produced no career players');

  // KNOWN DEFECT, in the seed and deliberately left visible. With the seed's
  // own 53-man rosters and its own contracts, six clubs open the first season
  // over the salary cap -- one by 69M, 23% of it -- even though the seed's
  // salary_cap table claims every club is under. The first offseason's
  // compliance pass resolves it and from then on the league stays legal;
  // tests/save/save.test.ts bounds the overage so it cannot quietly grow.
  // Resolving it here would mean cutting players the seed says are on the
  // roster, which is the engine's decision to make in the offseason, not the
  // loader's to make silently.
  return {
    teamIds, fronts, players, pipeline: new Map(),
    deadMoney: new Map(), season: FIRST_SEASON,
  };
}

/** Rule 3: a rostered player without a deal, or a deal missing a number, is
 *  reported. The seed carries a contract for every rostered player; a source
 *  that does not is a different seed and must say so. */
function seedContract(
  playerId: string, row: Record<string, string> | undefined,
): CareerPlayer['contract'] {
  if (row === undefined) throw new Error(`Rostered player ${playerId} has no contract in the seed`);
  const need = (column: string): number => {
    const value = numberOrUndefined(row[column]);
    if (value === undefined) {
      throw new Error(`Contract ${row['contract_id'] ?? '?'} for ${playerId} has no ${column}`);
    }
    return value;
  };
  return {
    aav: need('average_annual_value'),
    years: need('years_total'),
    yearsRemaining: need('years_remaining'),
    guaranteed: need('guaranteed_money'),
    signedSeason: need('start_year') - 1,
  };
}
