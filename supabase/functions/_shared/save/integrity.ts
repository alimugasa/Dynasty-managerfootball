// What must be true of a save, checked rather than assumed.
//
// These run against the document, not against the database, so they hold for a
// save on disk, a save in Postgres and a league in memory alike. Three
// families, because three different things go wrong:
//
//   Nulls. A required field that arrived as null or NaN. Usually a serialiser
//   that wrote a field the loader does not read, or arithmetic that produced
//   NaN and was stored without anyone looking.
//   Orphans. A reference to something that is not there -- a contract on a
//   retired player, a roster spot at a club that does not exist, a draft class
//   for a year already played. These are what a long save accumulates.
//   Cap violations. A club over the salary cap, a roster over the limit, a
//   contract outside the rules it was signed under.
//
// Every failure names the thing that failed, because "integrity check failed"
// at season 40 of a 10-season test run is not a diagnosis.

import { capSheet } from '../engine/offseason/contracts.ts';
import { capRules } from '../engine/offseason/frontOffice.ts';
import { OFFSEASON_ROSTER_LIMIT } from '../engine/offseason/league.ts';
import type { SaveDocument, SavedCoach, SavedPlayer } from './types.ts';

export interface Violation {
  readonly kind: 'NULL' | 'ORPHAN' | 'CAP';
  readonly where: string;
  readonly detail: string;
}

/** Numeric fields that must always hold a finite number. Listed rather than
 *  discovered by reflection: a field added to the document should have to be
 *  classified deliberately, not swept in by a loop over Object.keys. */
const REQUIRED_NUMBERS: readonly (keyof SavedPlayer)[] = [
  'ability', 'potential', 'mental', 'reputation', 'age', 'experience',
  'devRate', 'workEthic', 'durability', 'footballIq',
  'gamesMissedCareer', 'gamesMissedSeason', 'allLeague', 'awards', 'rings',
];

/** The same rule for a coach: a rating that is not a number is a corrupt
 *  save, not a coach who happens to be average. */
const REQUIRED_COACH_NUMBERS: readonly (keyof SavedCoach)[] = [
  'age', 'experience', 'yearsWithTeam', 'seasonsAsHeadCoach',
  'playCalling', 'gameManagement', 'clockManagement', 'aggressiveness',
  'development', 'evaluation', 'leadership', 'ability', 'reputation',
  'careerWins', 'careerLosses', 'careerTies', 'rings', 'hotSeat',
];

function checkNulls(document: SaveDocument): Violation[] {
  const out: Violation[] = [];

  for (const c of document.coaches) {
    for (const field of REQUIRED_COACH_NUMBERS) {
      const value = c[field];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        out.push({ kind: 'NULL', where: `coach ${c.id}.${String(field)}`,
          detail: `is ${JSON.stringify(value)}` });
      }
    }
    if (c.id === '' || c.name === '') {
      out.push({ kind: 'NULL', where: `coach ${c.id}`, detail: 'blank id or name' });
    }
    if (c.teamId !== null && c.role === null) {
      out.push({ kind: 'NULL', where: `coach ${c.id}.role`,
        detail: 'employed by a club with no job' });
    }
  }

  for (const p of document.players) {
    for (const field of REQUIRED_NUMBERS) {
      const value = p[field];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        out.push({ kind: 'NULL', where: `player ${p.id}.${String(field)}`,
          detail: `is ${JSON.stringify(value)}` });
      }
    }
    if (p.id === '' || p.name === '') {
      out.push({ kind: 'NULL', where: `player ${p.id}`, detail: 'blank id or name' });
    }
    if (p.contract !== null) {
      for (const [field, value] of Object.entries(p.contract)) {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          out.push({ kind: 'NULL', where: `player ${p.id}.contract.${field}`,
            detail: `is ${JSON.stringify(value)}` });
        }
      }
    }
  }

  for (const [year, list] of Object.entries(document.pipeline)) {
    for (const prospect of list) {
      if (!Number.isFinite(prospect.ability) || !Number.isFinite(prospect.potential)) {
        out.push({ kind: 'NULL', where: `prospect ${prospect.id} (${year})`,
          detail: 'ability or potential is not a number' });
      }
    }
  }

  return out;
}

function checkOrphans(document: SaveDocument): Violation[] {
  const out: Violation[] = [];
  const clubs = new Set(document.teamIds);
  const playerIds = new Set<string>();

  for (const p of document.players) {
    if (playerIds.has(p.id)) {
      out.push({ kind: 'ORPHAN', where: `player ${p.id}`, detail: 'duplicate player id' });
    }
    playerIds.add(p.id);

    if (p.teamId !== null && !clubs.has(p.teamId)) {
      out.push({ kind: 'ORPHAN', where: `player ${p.id}`,
        detail: `rostered at "${p.teamId}", which is not a club in this league` });
    }
    if (p.previousTeamId !== null && !clubs.has(p.previousTeamId)) {
      out.push({ kind: 'ORPHAN', where: `player ${p.id}`,
        detail: `previousTeamId "${p.previousTeamId}" is not a club in this league` });
    }
    // A retired player holding a roster spot is the orphan that matters most:
    // he counts against the cap and the roster limit for ever, and nothing
    // else in the engine will ever look at him again.
    if (p.retired && p.teamId !== null) {
      out.push({ kind: 'ORPHAN', where: `player ${p.id}`,
        detail: 'retired but still on a roster' });
    }
    if (p.retired && p.contract !== null) {
      out.push({ kind: 'ORPHAN', where: `player ${p.id}`,
        detail: 'retired but still under contract' });
    }
    if (p.contract !== null && p.teamId === null) {
      out.push({ kind: 'ORPHAN', where: `player ${p.id}`,
        detail: 'under contract but on no roster' });
    }
    if (p.contract !== null && p.contract.yearsRemaining <= 0) {
      out.push({ kind: 'ORPHAN', where: `player ${p.id}`,
        detail: 'contract has expired but was not removed' });
    }
  }

  for (const teamId of Object.keys(document.fronts)) {
    if (!clubs.has(teamId)) {
      out.push({ kind: 'ORPHAN', where: `front office ${teamId}`,
        detail: 'no such club' });
    }
  }
  for (const teamId of Object.keys(document.deadMoney)) {
    if (!clubs.has(teamId)) {
      out.push({ kind: 'ORPHAN', where: `dead money ${teamId}`, detail: 'no such club' });
    }
  }

  // A draft class for a year already played is never drafted and never freed.
  for (const year of Object.keys(document.pipeline)) {
    if (Number(year) < document.meta.season) {
      out.push({ kind: 'ORPHAN', where: `pipeline ${year}`,
        detail: `class for a season already played (now ${String(document.meta.season)})` });
    }
  }

  return out;
}

function checkCap(document: SaveDocument): Violation[] {
  const out: Violation[] = [];
  const rules = capRules(document.meta.season);

  const byTeam = new Map<string, SavedPlayer[]>();
  for (const p of document.players) {
    if (p.teamId === null || p.retired) continue;
    const list = byTeam.get(p.teamId) ?? [];
    list.push(p);
    byTeam.set(p.teamId, list);
  }

  for (const teamId of document.teamIds) {
    const roster = byTeam.get(teamId) ?? [];
    const dead = Object.values(document.deadMoney[teamId] ?? {})
      .reduce((a, b) => a + b, 0);

    const sheet = capSheet(teamId, roster.map((p) => ({
      contract: p.contract === null ? null : { aav: p.contract.aav },
    })), rules, dead);

    if (sheet.available < 0) {
      out.push({ kind: 'CAP', where: `club ${teamId}`,
        detail: `over the cap by ${String(Math.round(-sheet.available))} `
          + `(committed ${String(sheet.committed)} + dead ${String(dead)} `
          + `vs cap ${String(rules.salaryCap)})` });
    }
    if (roster.length > OFFSEASON_ROSTER_LIMIT) {
      out.push({ kind: 'CAP', where: `club ${teamId}`,
        detail: `${String(roster.length)} players, limit ${String(OFFSEASON_ROSTER_LIMIT)}` });
    }

    for (const p of roster) {
      if (p.contract === null) continue;
      if (p.contract.aav < 0) {
        out.push({ kind: 'CAP', where: `player ${p.id}`, detail: 'negative salary' });
      }
      if (p.contract.guaranteed > p.contract.aav * p.contract.years) {
        out.push({ kind: 'CAP', where: `player ${p.id}`,
          detail: 'guaranteed money exceeds the whole contract' });
      }
      if (p.contract.yearsRemaining > p.contract.years) {
        out.push({ kind: 'CAP', where: `player ${p.id}`,
          detail: 'more years remaining than the contract has' });
      }
    }
  }

  return out;
}

export function checkIntegrity(document: SaveDocument): Violation[] {
  return [...checkNulls(document), ...checkOrphans(document), ...checkCap(document)];
}

/** A short, readable account of what is wrong, for a test failure message. */
export function describeViolations(violations: readonly Violation[], limit = 12): string {
  if (violations.length === 0) return 'none';
  const shown = violations.slice(0, limit)
    .map((v) => `  [${v.kind}] ${v.where}: ${v.detail}`);
  const rest = violations.length - shown.length;
  return `${String(violations.length)} violation(s)\n${shown.join('\n')}`
    + (rest > 0 ? `\n  ... and ${String(rest)} more` : '');
}
