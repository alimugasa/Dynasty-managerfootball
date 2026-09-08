// The offseason, end to end.
//
// Grade the season just played, develop everyone, retire who is finished, expire
// contracts, draft the incoming class, work the market, then make every roster
// legal. Ability moves only in here, so this loop reproduces the league's talent
// dynamics without simulating a single game.

import { OFFSEASON } from './calibration.ts';
import { expireContracts } from './contracts.ts';
import { enforceCompliance, type Release } from './compliance.ts';
import { developAll, NEUTRAL_CONTEXT, type DevelopmentContext } from './development.ts';
import { developmentContext, playingTimeFrom } from './coaches.ts';
import { runCarousel, type CarouselResult, type CoachRecord } from './carousel.ts';
import { STARTERS } from '../types.ts';
import { developProspects, generateClass, namePalette, type IntakeConfig } from './draftClass.ts';
import {
  runDraft, strengthOrder, type DraftOptions, type DraftResult,
} from './draft.ts';
import { runFreeAgency, type FreeAgencyResult, type UserOffer } from './freeAgency.ts';
import { capRules } from './frontOffice.ts';
import { gradeSeason } from './grading.ts';
import {
  meanRosteredAbility, meanRosteredAge, prospectToPlayer, rosterOf,
  ROSTER_QUOTA, ROSTER_SIZE, type League,
} from './league.ts';
import { buildIndex, type RosterIndex } from './rosterIndex.ts';
import { retireAll } from './retirement.ts';
import type { Rng } from '../rng.ts';
import type {
  CareerPlayer, DevelopmentOutcome, OffseasonSummary, SeasonGrade,
} from './types.ts';

export { ROSTER_QUOTA, ROSTER_SIZE, rosterOf, meanRosteredAbility, meanRosteredAge };
export type { League };

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
  /** Who was fired, hired, promoted or retired on the coaching staffs. */
  readonly coaches: CarouselResult;
}

export interface OffseasonInput {
  /** Development context, when a caller wants to override the staffs'. */
  readonly context?: DevelopmentContext;
  readonly intake?: IntakeConfig;
  /**
   * What each club's season was, for the coaching carousel. A caller with no
   * records -- a drift run, a population report -- gets ageing, retirements
   * and hiring, and no firings: there is no evidence to fire anyone on.
   */
  readonly records?: ReadonlyMap<string, CoachRecord>;
}

/** What settling the season produced. The stage before anyone is signed. */
export interface SettleResult {
  readonly grades: readonly SeasonGrade[];
  readonly development: readonly DevelopmentOutcome[];
  readonly retired: readonly CareerPlayer[];
  /** Deals that ran out; the player is in the pool. */
  readonly expired: readonly CareerPlayer[];
  readonly coaches: CarouselResult;
}

/**
 * The offseason in four stages, so it can be played rather than watched.
 *
 * One call runs them in order and is what a report or a test uses. The server
 * calls them one at a time, saving the league between each, which is what
 * makes it possible to stop at the draft and let someone pick.
 *
 * The stages are ordered by dependency, not by taste: development is what the
 * grades are read against, the carousel judges the season that was just
 * played, the draft needs the pool retirement and expiry created, and
 * compliance can only run once the roster is whatever the draft and the market
 * left it.
 */
export function settleSeason(
  league: League, rng: Rng, input: OffseasonInput = {},
): SettleResult {
  const intake = input.intake ?? OFFSEASON.intake;
  // Who develops a player: his club's staff, and how much he plays. A league
  // carrying no coaches -- a save written before staffs existed -- develops
  // everyone at the league rate, which is what it did before they existed.
  const development = input.context ?? (league.coaches.length === 0
    ? NEUTRAL_CONTEXT
    : developmentContext(
      league.coaches, league.teamIds, playingTimeFrom(league.players, STARTERS)));

  // Dead money is carried for the season it was incurred and then written off.
  league.deadMoney.clear();

  const active = league.players.filter((p) => !p.retired && p.teamId !== null);
  const grades = gradeSeason(active, rng, league.season);
  const outcomes = developAll(league.players, development, rng);
  // The carousel runs after development and before the draft, which is the
  // order it happens in: the staff that coached the season is the staff the
  // season is credited to, and the staff that drafts is the new one.
  const coaches = runCarousel(league, input.records ?? new Map(), rng);
  const retired = retireAll(league.players, rng, league.season);
  const expired = expireContracts(league.players);

  // The class several years out enters the pipeline; every class in it grows.
  const incoming = league.season + intake.pipelineYears;
  if (!league.pipeline.has(incoming)) {
    league.pipeline.set(incoming, generateClass(rng, incoming, intake, namePalette(league.players)));
  }
  for (const cls of league.pipeline.values()) developProspects(cls, rng, intake);

  return { grades, development: outcomes, retired, expired, coaches };
}

/**
 * The draft.
 *
 * Built here, after retirement and expiry have already moved players off
 * rosters directly. Those two run without an index -- they are callable on a
 * bare player list -- so indexing before them would leave stale entries that
 * setTeam could not clear, since it short-circuits when the club has not
 * changed. Everything from this line on goes through setTeam.
 */
export interface DraftStageOptions extends DraftOptions {
  /** The order picks are made in. Passed when resuming, because a club's
   *  strength changes as the draft fills its holes and an order recomputed
   *  halfway through would not be the one the first round was made in. */
  readonly order?: readonly string[];
  /**
   * The roster index to work in. Passed when several stages run back to back
   * so they share one, which is not an optimisation: an index carries the
   * order free agents are considered in, and rebuilding it between the draft
   * and the market reorders the pool and changes who signs where.
   */
  readonly index?: RosterIndex;
}

export function draftStage(
  league: League, rng: Rng, options: DraftStageOptions = {},
): DraftResult {
  const rules = capRules(league.season);
  const index = options.index ?? buildIndex(league.teamIds, league.players);
  const declaring = league.pipeline.get(league.season) ?? [];
  const order = options.order ?? strengthOrder(league, index);
  const result = runDraft(league, index, declaring, order, rules, rng, {
    ...(options.startAt === undefined ? {} : { startAt: options.startAt }),
    ...(options.choices === undefined ? {} : { choices: options.choices }),
  });
  // A draft that paused keeps its class on the board for the next call; one
  // that finished has consumed it.
  if (result.paused === null) league.pipeline.delete(league.season);
  else league.pipeline.set(league.season, [...result.onBoard]);
  return result;
}

/** The market. A caller may add offers of its own; everything else is the
 *  engine's clubs bidding against each other. */
export function marketStage(
  league: League, rng: Rng, offers: readonly UserOffer[] = [], sharedIndex?: RosterIndex,
): FreeAgencyResult {
  const rules = capRules(league.season);
  const index = sharedIndex ?? buildIndex(league.teamIds, league.players);
  return runFreeAgency(league, index, rules, rng, offers);
}

/** Camp: every roster made legal, the unsigned pruned, the year turned over. */
export function campStage(
  league: League, rng: Rng, sharedIndex?: RosterIndex,
): readonly Release[] {
  const rules = capRules(league.season);
  const index = sharedIndex ?? buildIndex(league.teamIds, league.players);
  const released: Release[] = [];
  enforceCompliance(league, index, rules, released);
  pruneUnsigned(league);
  league.season += 1;
  // The generator is taken so every stage has the same shape and a caller
  // cannot pass streams in the wrong order without noticing.
  void rng;
  return released;
}

export function runOffseason(
  league: League,
  rng: Rng,
  options: OffseasonInput | DevelopmentContext = {},
  intakeArg?: IntakeConfig,
): OffseasonResult {
  // Callers written before the offseason took records pass a development
  // context positionally. Both shapes are accepted rather than one being
  // silently ignored.
  const input: OffseasonInput = 'playingTime' in options
    ? { context: options, ...(intakeArg === undefined ? {} : { intake: intakeArg }) }
    : { ...options, ...(intakeArg === undefined ? {} : { intake: intakeArg }) };

  const settled = settleSeason(league, rng, input);
  // One index for the three stages that move players, exactly as the offseason
  // held before it was split into stages someone can stop in the middle of.
  const index = buildIndex(league.teamIds, league.players);
  const draft = draftStage(league, rng, { index });
  const freeAgency = marketStage(league, rng, [], index);
  const released = campStage(league, rng, index);

  return {
    summary: {
      season: league.season - 1,
      retired: settled.retired.length,
      drafted: draft.picks.length,
      developed: settled.development.length,
      meanAbility: meanRosteredAbility(league),
      meanAge: meanRosteredAge(league),
      breakouts: settled.development.filter((o) => o.breakout).length,
      busts: settled.development.filter((o) => o.bust).length,
    },
    grades: settled.grades,
    retired: settled.retired,
    draft,
    freeAgency,
    expired: settled.expired,
    released,
    coaches: settled.coaches,
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
