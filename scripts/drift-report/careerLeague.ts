// Builds the career-level league from the frozen seed CSVs.
//
// Same 32 clubs and the same players as the game-simulation loader, but carrying
// the fields a career needs -- age, experience, potential, work ethic, football
// intelligence, durability -- rather than the fields a snap needs.

import { numberOrUndefined, readSeedCsv } from '../lib/seedCsv.ts';
import { POSITION_GROUPS, type PositionGroup } from '../../supabase/functions/_shared/engine/types.ts';
import {
  capRules, FA_PERSONALITIES, marketValue, ROSTER_QUOTA,
  type CareerPlayer, type FaPersonality, type League, type TeamFront,
} from '../../supabase/functions/_shared/engine/offseason/index.ts';

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
  const ownerRows = readSeedCsv('owners');
  const coachRows = readSeedCsv('coaches');
  const coachAttrRows = readSeedCsv('coach_attributes');

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
      personality: personalityFor(id),
      contract: null,
      previousTeamId: teamId,
    });
  }

  if (players.length === 0) throw new Error('Seed data produced no career players');

  // The seed has a contracts table, but not one that maps onto this model's
  // deal structure, so contracts are derived from market value here. Remaining
  // years are staggered one to four by a stable hash of the player id: without
  // the stagger every deal in the league would expire in the same offseason and
  // the first market would be the only one that ever mattered.
  const rules = capRules(FIRST_SEASON);
  for (const player of players) {
    if (player.teamId === null) continue;
    const years = 1 + hashInt(`${player.id}:years`, 4);
    const aav = marketValue(player, rules);
    player.contract = {
      aav,
      years,
      yearsRemaining: years,
      guaranteed: Math.round(aav * years * 0.45),
      signedSeason: FIRST_SEASON - 1,
    };
  }

  // The seed carries roughly 93 players per club, an offseason roster. Trim each
  // club to its 53-man quota by ability; the rest enter the pool as free agents
  // and mostly wash out, which is what happens to them.
  for (const teamId of teamIds) {
    for (const group of POSITION_GROUPS) {
      const held = players
        .filter((p) => p.teamId === teamId && p.group === group)
        .sort((a, b) => b.ability - a.ability);
      for (const player of held.slice(ROSTER_QUOTA[group])) {
        player.previousTeamId = player.teamId;
        player.teamId = null;
        // The contract goes with the club. Clearing teamId alone left 1,152
        // players holding a deal with nobody, and expireContracts skips
        // unrostered players, so those contracts never expired -- a save that
        // asserted something untrue from the moment it was created.
        player.contract = null;
      }
    }
  }

  const league: League = {
    teamIds, fronts, players, pipeline: new Map(),
    deadMoney: new Map(), season: FIRST_SEASON,
  };

  // KNOWN DEFECT, deliberately left. Seven of the 32 clubs come out of the seed
  // over the salary cap -- one by 84M, 28% of it -- because contracts are
  // derived from market value and market value knows nothing about the cap. The
  // first offseason's compliance pass resolves it, and from that point the
  // league stays legal; tests/save/save.test.ts bounds the overage so it cannot
  // quietly grow.
  //
  // Two corrections were tried and both cost more than the defect. Running the
  // engine's compliance pass here releases players and charges dead money, and
  // a from-scratch world has no history to charge: one club came out with 276M
  // of dead money, further over than it started. Scaling wages to fit works
  // arithmetically, but this league's intake, market and drift baselines are all
  // calibrated against these exact contracts -- scaling broke the draft-need
  // test and pushed the first offseason hard enough to release two first-round
  // rookies on guaranteed deals.
  //
  // The fix belongs to the seed importer that will build the production
  // template world, where each club's wages can be constructed inside a cap
  // budget from the start, and the calibration re-run once against the result.
  // Retro-fitting it onto a harness loader trades a bounded, visible defect for
  // an unbounded, invisible one.
  return league;
}
