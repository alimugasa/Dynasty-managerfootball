// The offseason, end to end.
//
// Grade the season just played, develop everyone, retire who is finished, expire
// contracts, draft the incoming class, work the market, then make every roster
// legal. Ability moves only in here, so this loop reproduces the league's talent
// dynamics without simulating a single game.

import { OFFSEASON } from './calibration.ts';
import { deadMoneyIfCut, capSheet, expireContracts, cutAppeal } from './contracts.ts';
import { developAll, NEUTRAL_CONTEXT, type DevelopmentContext } from './development.ts';
import { developProspects, generateClass, type IntakeConfig } from './draftClass.ts';
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

function release(league: League, index: RosterIndex, player: CareerPlayer): void {
  const teamId = player.teamId;
  if (teamId === null) return;
  const dead = deadMoneyIfCut(player);
  if (dead > 0) league.deadMoney.set(teamId, (league.deadMoney.get(teamId) ?? 0) + dead);
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
  league: League, index: RosterIndex, rules: CapRules,
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
        release(league, index, player);
        moves += 1;
      }
    }
  }

  // 2. Everyone gets under the cap. Cut the worst value for money, replacing
  //    with a minimum-salary body so the roster stays legal in shape as well as
  //    in cost.
  for (const teamId of league.teamIds) {
    let guard = 0;
    while (guard < 40) {
      guard += 1;
      const held = indexedRoster(index, teamId);
      const sheet = capSheet(teamId, held, rules, league.deadMoney.get(teamId) ?? 0);
      if (sheet.available >= 0) break;
      // Cut whoever frees the most money per point of ability lost. Ranking on
      // cap hit alone targets rookies, whose deals are guaranteed and therefore
      // save nothing.
      const worst = held
        .filter((p) => (p.contract?.aav ?? 0) > rules.veteranMinimum)
        .filter((p) => cutAppeal(p, rules) > 0)
        .sort((a, b) => cutAppeal(b, rules) - cutAppeal(a, rules))[0];
      if (worst === undefined) break;
      release(league, index, worst);
      moves += 1;
    }
  }

  // 3. Only now does anyone fill. The best body available, not a random one:
  //    clubs are not stupid about the bottom of a roster, they are just poor.
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
}

export function runOffseason(
  league: League,
  rng: Rng,
  context: DevelopmentContext = NEUTRAL_CONTEXT,
  intake: IntakeConfig = OFFSEASON.intake,
): OffseasonResult {
  const rules = capRules(league.season);

  // Dead money is carried for the season it was incurred and then written off.
  league.deadMoney.clear();

  const active = league.players.filter((p) => !p.retired && p.teamId !== null);
  const grades = gradeSeason(active, rng, league.season);

  const outcomes = developAll(league.players, context, rng);
  const retired = retireAll(league.players, rng, league.season);
  expireContracts(league.players);

  // Built here, after retirement and expiry have already moved players off
  // rosters directly. Those two run without an index -- they are callable on a
  // bare player list -- so indexing before them would leave stale entries that
  // setTeam could not clear, since it short-circuits when the club has not
  // changed. Everything from this line on goes through setTeam.
  const index = buildIndex(league.teamIds, league.players);

  // The class several years out enters the pipeline; every class in it grows.
  const incoming = league.season + intake.pipelineYears;
  if (!league.pipeline.has(incoming)) {
    league.pipeline.set(incoming, generateClass(rng, incoming, intake));
  }
  for (const cls of league.pipeline.values()) developProspects(cls, rng, intake);

  const declaring = league.pipeline.get(league.season) ?? [];
  league.pipeline.delete(league.season);

  const draft = runDraft(league, index, declaring, strengthOrder(league, index), rules, rng);
  const freeAgency = runFreeAgency(league, index, rules, rng);
  enforceCompliance(league, index, rules);
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
  };
}

/** Seeds the pipeline so the first few seasons have classes to draw on. */
export function primePipeline(
  league: League, rng: Rng, intake: IntakeConfig = OFFSEASON.intake,
): void {
  for (let i = 0; i <= intake.pipelineYears; i += 1) {
    const year = league.season + i;
    if (!league.pipeline.has(year)) league.pipeline.set(year, generateClass(rng, year, intake));
  }
}

/** Prospect conversion, re-exported for callers building a league by hand. */
export { prospectToPlayer };
