// Document -> League.
//
// Validating, not trusting. A save file is the one input to this system that
// was written by an earlier build, possibly years ago, possibly hand-edited,
// possibly truncated by a failed write. ARCHITECTURE.md rule 3 -- missing data
// is reported, never invented -- has its sharpest application here: a loader
// that defaults a missing ability to 50 turns a corrupt save into a league of
// mediocre players and tells nobody.
//
// So every field is checked, and a failure names the path that failed.

import type { League } from '../engine/offseason/league.ts';
import type { CareerPlayer, Prospect } from '../engine/offseason/types.ts';
import type { TeamFront } from '../engine/offseason/frontOffice.ts';
import type { PositionGroup } from '../engine/types.ts';
import { POSITION_GROUPS } from '../engine/types.ts';
import type { SavedPlayer, SavedProspect, SaveDocument } from './types.ts';

export class SaveCorruptError extends Error {
  readonly path: string;

  constructor(path: string, detail: string) {
    super(`Save is unreadable at ${path}: ${detail}`);
    this.name = 'SaveCorruptError';
    this.path = path;
  }
}

function num(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new SaveCorruptError(path, `expected a finite number, got ${JSON.stringify(value)}`);
  }
  return value;
}

function str(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw new SaveCorruptError(path, `expected a string, got ${JSON.stringify(value)}`);
  }
  return value;
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new SaveCorruptError(path, `expected a boolean, got ${JSON.stringify(value)}`);
  }
  return value;
}

function group(value: unknown, path: string): PositionGroup {
  const g = str(value, path);
  if (!(POSITION_GROUPS as readonly string[]).includes(g)) {
    throw new SaveCorruptError(path, `"${g}" is not a position group`);
  }
  return g as PositionGroup;
}

function loadPlayer(raw: SavedPlayer, i: number): CareerPlayer {
  const at = `players[${String(i)}]`;
  const contract = raw.contract === null || raw.contract === undefined ? null : {
    aav: num(raw.contract.aav, `${at}.contract.aav`),
    yearsRemaining: num(raw.contract.yearsRemaining, `${at}.contract.yearsRemaining`),
    years: num(raw.contract.years, `${at}.contract.years`),
    guaranteed: num(raw.contract.guaranteed, `${at}.contract.guaranteed`),
    signedSeason: num(raw.contract.signedSeason, `${at}.contract.signedSeason`),
  };

  return {
    id: str(raw.id, `${at}.id`),
    name: str(raw.name, `${at}.name`),
    group: group(raw.group, `${at}.group`),
    teamId: raw.teamId === null ? null : str(raw.teamId, `${at}.teamId`),
    ability: num(raw.ability, `${at}.ability`),
    potential: num(raw.potential, `${at}.potential`),
    mental: num(raw.mental, `${at}.mental`),
    reputation: num(raw.reputation, `${at}.reputation`),
    age: num(raw.age, `${at}.age`),
    experience: num(raw.experience, `${at}.experience`),
    devRate: num(raw.devRate, `${at}.devRate`),
    workEthic: num(raw.workEthic, `${at}.workEthic`),
    durability: num(raw.durability, `${at}.durability`),
    footballIq: num(raw.footballIq, `${at}.footballIq`),
    gamesMissedCareer: num(raw.gamesMissedCareer, `${at}.gamesMissedCareer`),
    gamesMissedSeason: num(raw.gamesMissedSeason, `${at}.gamesMissedSeason`),
    accolades: {
      allLeague: num(raw.allLeague, `${at}.allLeague`),
      awards: num(raw.awards, `${at}.awards`),
      rings: num(raw.rings, `${at}.rings`),
    },
    retired: bool(raw.retired, `${at}.retired`),
    retiredInSeason: raw.retiredInSeason === null
      ? null : num(raw.retiredInSeason, `${at}.retiredInSeason`),
    personality: raw.personality,
    contract,
    previousTeamId: raw.previousTeamId === null
      ? null : str(raw.previousTeamId, `${at}.previousTeamId`),
  };
}

function loadProspect(raw: SavedProspect, year: string, i: number): Prospect {
  const at = `pipeline["${year}"][${String(i)}]`;
  return {
    id: str(raw.id, `${at}.id`),
    name: str(raw.name, `${at}.name`),
    group: group(raw.group, `${at}.group`),
    draftYear: num(raw.draftYear, `${at}.draftYear`),
    personality: raw.personality,
    ability: num(raw.ability, `${at}.ability`),
    potential: num(raw.potential, `${at}.potential`),
    age: num(raw.age, `${at}.age`),
    devRate: num(raw.devRate, `${at}.devRate`),
    workEthic: num(raw.workEthic, `${at}.workEthic`),
    durability: num(raw.durability, `${at}.durability`),
    footballIq: num(raw.footballIq, `${at}.footballIq`),
  };
}

export interface LoadedSave {
  readonly league: League;
  readonly document: SaveDocument;
}

/**
 * Rebuilds the runtime league.
 *
 * The document must already be at the current version -- call migrate() first.
 * Taking an already-migrated document rather than migrating here keeps the two
 * concerns apart: a migration step rewrites data, and this turns data into
 * objects. A loader that did both would have to know every historical shape.
 */
export function deserialize(document: SaveDocument): LoadedSave {
  const teamIds = document.teamIds;
  if (!Array.isArray(teamIds) || teamIds.length === 0) {
    throw new SaveCorruptError('teamIds', 'a league with no clubs is not a league');
  }

  const fronts = new Map<string, TeamFront>();
  for (const [id, front] of Object.entries(document.fronts)) fronts.set(id, front);

  const known = new Set(teamIds);
  for (const id of fronts.keys()) {
    if (!known.has(id)) {
      throw new SaveCorruptError(`fronts["${id}"]`, 'front office for a club not in the league');
    }
  }

  const players = document.players.map(loadPlayer);

  const pipeline = new Map<number, Prospect[]>();
  for (const [year, list] of Object.entries(document.pipeline)) {
    const parsed = Number(year);
    if (!Number.isInteger(parsed)) {
      throw new SaveCorruptError(`pipeline["${year}"]`, 'draft year is not a number');
    }
    pipeline.set(parsed, list.map((p, i) => loadProspect(p, year, i)));
  }

  // Only the current season's charges become live dead money; older seasons
  // stay in the document as history. Summing every year would charge a club
  // twice for a release it already paid for.
  const season = num(document.meta.season, 'meta.season');
  const deadMoney = new Map<string, number>();
  for (const [teamId, bySeason] of Object.entries(document.deadMoney)) {
    const amount = bySeason[String(season)];
    if (amount !== undefined) deadMoney.set(teamId, num(amount, `deadMoney["${teamId}"]`));
  }

  return {
    league: { teamIds, fronts, players, pipeline, deadMoney, season },
    document,
  };
}
