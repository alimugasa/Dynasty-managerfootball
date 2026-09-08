// The offseason, end to end.
//
// Grade the season just played, develop everyone, retire who is finished, expire
// contracts, draft the incoming class, work the market, then make every roster
// legal. Ability moves only in here, so this loop reproduces the league's talent
// dynamics without simulating a single game.

import { OFFSEASON } from './calibration.ts';
import { deadMoneyIfCut, capSheet, expireContracts, cutAppeal } from './contracts.ts';
import { developAll, NEUTRAL_CONTEXT, type DevelopmentContext } from './development.ts';
import { developmentContext, playingTimeFrom } from './coaches.ts';
import { STARTERS } from '../types.ts';
import { developProspects, generateClass, namePalette, type IntakeConfig } from './draftClass.ts';
import { runDraft, strengthOrder, type DraftResult } from './draft.ts';
import { runFreeAgency, type FreeAgencyResult } from './freeAgency.ts';
import { capRules, type CapRules } from './frontOffice.ts';
import { gradeSeason } from './grading.ts';
import {
  meanRosteredAbility, meanRosteredAge, prospectToPlayer, rosterOf, rosterValue,
  ROSTER_QUOTA, ROSTER_SIZE, type League,
} from './league.ts';
import {
  bestAvailable, buildIndex, roster as indexedRoster, setTeam,
  type RosterIndex,
} from './rosterIndex.ts';
import { retireAll } from './retirement.ts';
import { POSITION_GROUPS } from '../types.ts';
import type { Rng } from '../rng.ts';
import type { CareerPlayer, OffseasonSummary, SeasonGrade } from './types.ts';

export { ROSTER_QUOTA, ROSTER_SIZE, rosterOf, meanRosteredAbility, meanRosteredAge };
export type { League };

/** A player a club let go, and what it cost. Reported rather than left for a
 *  caller to infer from a before-and-after diff, which could not see a rookie
 *  drafted and cut in the same offseason. */
export interface Release {
  readonly playerId: string;
  readonly teamId: string;
  readonly deadMoney: number;
  /** Why: one body too many in his group, or the money. */
  readonly reason: 'QUOTA' | 'CAP';
}

function release(
  league: League, index: RosterIndex, player: CareerPlayer, log: Release[],
  reason: Release['reason'],
): void {
  const teamId = player.teamId;
  if (teamId === null) return;
  const dead = deadMoneyIfCut(player);
  if (dead > 0) league.deadMoney.set(teamId, (league.deadMoney.get(teamId) ?? 0) + dead);
  log.push({ playerId: player.id, teamId, deadMoney: dead, reason });
  setTeam(index, player, null);
  player.contract = null;
}

function signMinimum(
  index: RosterIndex, player: CareerPlayer, teamId: string, rules: CapRules, season: number,
): void {
  setTeam(index, player, teamId);
  player.contract = {
    aav: rules.veteranMinimum, years: 1, yearsRemaining: 1,
    guaranteed: 0, signedSeason: season,
  };
}

/**
 * Make every roster legal.
 *
 * Runs after the draft and the market, so it is a tidying step rather than a
 * team-building one: clubs cut what they cannot carry and fill what they must,
 * at the minimum, from whoever is left. A club that drafted and signed well has
 * little for this pass to do.
 */
export function enforceCompliance(
  league: League, index: RosterIndex, rules: CapRules, released: Release[] = [],
): number {
  let moves = 0;

  // Three league-wide passes, not one pass per club.
  //
  // Interleaving them means the first club fills its holes from a pool the last
  // club has not yet released its surplus into. That left clubs a quarterback
  // short while spare quarterbacks sat unsigned -- a shortage created purely by
  // the order the clubs were visited in.

  // 1. Everyone cuts down to quota, worst first.
  for (const teamId of league.teamIds) {
    for (const group of POSITION_GROUPS) {
      const held = indexedRoster(index, teamId)
        .filter((p) => p.group === group)
        .sort((a, b) => rosterValue(b) - rosterValue(a));
      for (const player of held.slice(ROSTER_QUOTA[group])) {
        release(league, index, player, released, 'QUOTA');
        moves += 1;
      }
    }
  }

  // 2 then 3, each once. Getting under the cap and filling the roster are not
  // independent -- filling signs minimum-salary bodies, and a club that has cut
  // its way to exactly zero goes straight back over when it signs eight of them
  // -- so the cut pass reserves the room the fill pass is going to need.
  //
  // Reserving, rather than alternating cut and fill until they settle. That was
  // tried and is much worse: every cut charges dead money, so a club that is
  // over the cap cuts, becomes more over, and cuts again. Four alternating
  // rounds turned one club into 183M of dead money and released the first
  // overall pick. Cutting is not a fixed-point operation and must not be
  // iterated as if it were.
  moves += cutToCap(league, index, rules, released);
  moves += fillRosters(league, index, rules);

  return moves;
}

/** How many holes a club must still fill, and therefore how many minimum
 *  salaries the cap pass has to leave room for. */
function holesAt(index: RosterIndex, teamId: string): number {
  let holes = 0;
  for (const group of POSITION_GROUPS) {
    const held = indexedRoster(index, teamId).filter((p) => p.group === group).length;
    holes += Math.max(0, ROSTER_QUOTA[group] - held);
  }
  return holes;
}

/** Everyone gets under the cap, with room for the bodies they still need. */
function cutToCap(
  league: League, index: RosterIndex, rules: CapRules, released: Release[],
): number {
  let moves = 0;
  for (const teamId of league.teamIds) {
    let guard = 0;
    while (guard < 40) {
      guard += 1;
      const held = indexedRoster(index, teamId);
      const sheet = capSheet(teamId, held, rules, league.deadMoney.get(teamId) ?? 0);
      // The reservation. Only the largest 51 hits count, so a club already at
      // 51 bodies pays nothing more to fill and reserves nothing.
      const reserve = Math.max(0, Math.min(holesAt(index, teamId), 51 - held.length))
        * rules.veteranMinimum;
      if (sheet.available >= reserve) break;
      // Cut whoever frees the most money per point of ability lost. Ranking on
      // cap hit alone targets rookies, whose deals are guaranteed and therefore
      // save nothing.
      const worst = held
        .filter((p) => (p.contract?.aav ?? 0) > rules.veteranMinimum)
        .filter((p) => cutAppeal(p, rules) > 0)
        .sort((a, b) => cutAppeal(b, rules) - cutAppeal(a, rules))[0];
      if (worst === undefined) break;
      release(league, index, worst, released, 'CAP');
      moves += 1;
    }
  }

  return moves;
}

/** Fill to quota. The best body available, not a random one: clubs are not
 *  stupid about the bottom of a roster, they are just poor. */
function fillRosters(league: League, index: RosterIndex, rules: CapRules): number {
  let moves = 0;
  for (const teamId of league.teamIds) {
    for (const group of POSITION_GROUPS) {
      let held = indexedRoster(index, teamId).filter((p) => p.group === group).length;
      while (held < ROSTER_QUOTA[group]) {
        const best = bestAvailable(index, group);
        if (best === undefined) break;
        signMinimum(index, best, teamId, rules, league.season);
        held += 1;
        moves += 1;
      }
    }
  }

  return moves;
}

/** Unsigned players eventually leave the game rather than accumulating forever. */
function pruneUnsigned(league: League): void {
  league.players = league.players.filter(
    (p) => !p.retired && (p.teamId !== null || p.experience <= 3),
  );
}

export interface OffseasonResult {
  readonly summary: OffseasonSummary;
  readonly grades: readonly SeasonGrade[];
  /** Returned rather than left on the league: retired players are pruned from
   *  the population at the end of the offseason. */
  readonly retired: readonly CareerPlayer[];
  readonly draft: DraftResult;
  readonly freeAgency: FreeAgencyResult;
  /** Deals that ran out this offseason; the player went to the pool. */
  readonly expired: readonly CareerPlayer[];
  /** Players cut by the compliance pass, drafted rookies included. */
  readonly released: readonly Release[];
}

export function runOffseason(
  league: League,
  rng: Rng,
  context?: DevelopmentContext,
  intake: IntakeConfig = OFFSEASON.intake,
): OffseasonResult {
  const rules = capRules(league.season);
  // Who develops a player: his club's staff, and how much he plays. A league
  // carrying no coaches -- a save written before staffs existed -- develops
  // everyone at the league rate, which is what it did before they existed.
  const development = context ?? (league.coaches.length === 0
    ? NEUTRAL_CONTEXT
    : developmentContext(
      league.coaches, league.teamIds, playingTimeFrom(league.players, STARTERS)));

  // Dead money is carried for the season it was incurred and then written off.
  league.deadMoney.clear();

  const active = league.players.filter((p) => !p.retired && p.teamId !== null);
  const grades = gradeSeason(active, rng, league.season);

  const outcomes = developAll(league.players, development, rng);
  const retired = retireAll(league.players, rng, league.season);
  const expired = expireContracts(league.players);
  const released: Release[] = [];

  // Built here, after retirement and expiry have already moved players off
  // rosters directly. Those two run without an index -- they are callable on a
  // bare player list -- so indexing before them would leave stale entries that
  // setTeam could not clear, since it short-circuits when the club has not
  // changed. Everything from this line on goes through setTeam.
  const index = buildIndex(league.teamIds, league.players);

  // The class several years out enters the pipeline; every class in it grows.
  const incoming = league.season + intake.pipelineYears;
  if (!league.pipeline.has(incoming)) {
    league.pipeline.set(incoming, generateClass(rng, incoming, intake, namePalette(league.players)));
  }
  for (const cls of league.pipeline.values()) developProspects(cls, rng, intake);

  const declaring = league.pipeline.get(league.season) ?? [];
  league.pipeline.delete(league.season);

  const draft = runDraft(league, index, declaring, strengthOrder(league, index), rules, rng);
  const freeAgency = runFreeAgency(league, index, rules, rng);
  enforceCompliance(league, index, rules, released);
  pruneUnsigned(league);
  league.season += 1;

  return {
    summary: {
      season: league.season - 1,
      retired: retired.length,
      drafted: draft.picks.length,
      developed: outcomes.length,
      meanAbility: meanRosteredAbility(league),
      meanAge: meanRosteredAge(league),
      breakouts: outcomes.filter((o) => o.breakout).length,
      busts: outcomes.filter((o) => o.bust).length,
    },
    grades,
    retired,
    draft,
    freeAgency,
    expired,
    released,
  };
}

/** Seeds the pipeline so the first few seasons have classes to draw on. */
export function primePipeline(
  league: League, rng: Rng, intake: IntakeConfig = OFFSEASON.intake,
): void {
  for (let i = 0; i <= intake.pipelineYears; i += 1) {
    const year = league.season + i;
    if (!league.pipeline.has(year)) {
      league.pipeline.set(year, generateClass(rng, year, intake, namePalette(league.players)));
    }
  }
}

/** Prospect conversion, re-exported for callers building a league by hand. */
export { prospectToPlayer };
