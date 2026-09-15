// The draft.
//
// Every club builds its own board from its own scouting, so the same class
// produces thirty-two different orderings. A pick is then the top of that club's
// board, not the top of anyone's truth. Reaches and steals are not injected as
// noise afterwards; they are what happens when clubs act on different
// information.
//
// Three things make a club miss:
//
//   its fog        a poorly scouted prospect is estimated badly
//   its needs      a win-now club will take the position it must fill over the
//                  better player, and sometimes that is the wrong call
//   its posture    a rebuilding club chases upside it cannot verify, a
//                  contending one pays up for certainty
//
// None of these are mistakes in the code. They are the reason a draft is worth
// playing.

import { POSITION_VALUE, teamNeeds, type TeamNeeds } from './needs.ts';
import { rookieContract } from './contracts.ts';
import { prospectToPlayer, type League } from './league.ts';
import { roster as rosterOf, setTeam, type RosterIndex } from './rosterIndex.ts';
import { scoutClass, type ScoutingReport } from './scouting.ts';
import type { CapRules, TeamFront } from './frontOffice.ts';
import type { Rng } from '../rng.ts';
import type { PositionGroup } from '../types.ts';
import type { CareerPlayer, Prospect } from './types.ts';

export const DRAFT = {
  /** Split between what a prospect is now and what he might become. */
  currentWeight: 0.55,
  potentialWeight: 0.45,
  /** Positional value compresses rather than dominates: a great back still
   *  outranks a mediocre passer. */
  positionFloor: 0.72,
  positionSpan: 0.55,
  /** Rating points a maximum need is worth on the board. */
  needWeight: 13,
  /**
   * Front offices disagree. Without this term every club with similar scouting
   * builds nearly the same board and the draft becomes a queue.
   */
  disagreementSd: 3.2,
  /**
   * Risk posture. A win-now club discounts a prospect it cannot read; a
   * rebuilding one is happy to gamble, because a wide range contains the
   * outcomes it needs. Same fog, opposite response.
   */
  riskWeight: 0.6,
  /** Share of undrafted prospects who catch on somewhere. */
  undraftedSignRate: 0.35,
} as const;

export interface DraftPick {
  readonly season: number;
  readonly round: number;
  readonly overall: number;
  readonly teamId: string;
  readonly prospectId: string;
  readonly group: string;
  /** What the club believed at the time. */
  readonly estimate: number;
  /** What he actually was. Never visible to the club. */
  readonly trueAbility: number;
  readonly bandLow: number;
  readonly bandHigh: number;
  /** The club's need at that position when it picked, 0-1. */
  readonly need: number;
  /**
   * Where that position ranked among the club's needs, 1 being the largest.
   * Raw need cannot distinguish a club that ignored a hole from one that did
   * not have a hole to ignore; the rank can.
   */
  readonly needRank: number;
  /** Positions above the pick on a true-ability ranking. Positive is a reach. */
  readonly reach: number;
}

export interface DraftResult {
  readonly picks: readonly DraftPick[];
  readonly undrafted: readonly CareerPlayer[];
  readonly signedUndrafted: number;
  /** Set when the draft stopped for a caller's pick, naming the pick it is
   *  waiting on. Null when the draft ran to the end. */
  readonly paused: { readonly overall: number; readonly round: number; readonly teamId: string } | null;
  /** Prospects still available, when it paused. Empty otherwise: a finished
   *  draft leaves an undrafted list, not a board. */
  readonly onBoard: readonly Prospect[];
}

interface BoardEntry {
  readonly prospect: Prospect;
  readonly score: number;
  readonly report: ScoutingReport;
}

/** One club's ordering of a class. */
export function buildBoard(
  prospects: readonly Prospect[],
  front: TeamFront,
  needs: TeamNeeds,
  rng: Rng,
): BoardEntry[] {
  const reports = scoutClass(prospects, front, needs, rng);
  const board: BoardEntry[] = [];

  for (const prospect of prospects) {
    const report = reports.get(prospect.id);
    if (report === undefined) continue;

    const talent =
      report.estimate * DRAFT.currentWeight + report.potentialEstimate * DRAFT.potentialWeight;
    let score = talent * (DRAFT.positionFloor + DRAFT.positionSpan * POSITION_VALUE[prospect.group]);
    score += (needs[prospect.group] ?? 0) * DRAFT.needWeight * (0.5 + front.winNow);
    // Uncertainty cuts both ways depending on what the club is trying to do.
    score += (0.5 - front.winNow) * report.sigma * DRAFT.riskWeight;
    score += rng.normal(0, DRAFT.disagreementSd);

    board.push({ prospect, score, report });
  }

  board.sort((a, b) => b.score - a.score);
  return board;
}

/**
 * Run a draft.
 *
 * `order` is the first-round order, reused each round. Boards are built once,
 * before any pick: a club does not re-scout between selections, and rebuilding
 * boards mid-draft would let later picks quietly benefit from information the
 * club never had.
 */
/**
 * How a caller takes part in the draft.
 *
 * A club named here picks for itself: the engine makes every other pick and
 * stops when it reaches one of this club's that the caller has not already
 * chosen. The draft is resumed by calling again with the same order and the
 * overall it stopped at, which is why the order is passed in rather than
 * recomputed -- a club's strength changes as the draft fills its holes, and an
 * order recomputed halfway through would not be the order the first round was
 * made in.
 */
export interface DraftChoices {
  readonly teamId: string;
  /** Overall pick number -> the prospect the caller took with it. */
  readonly picks?: ReadonlyMap<number, string>;
  /** Stop at this club's next unchosen pick instead of picking for it. */
  readonly stopForUser?: boolean;
}

export interface DraftOptions {
  /** Where to begin, 1-based. Defaults to the top of the draft. */
  readonly startAt?: number;
  readonly choices?: DraftChoices;
}

export function runDraft(
  league: League,
  index: RosterIndex,
  prospects: readonly Prospect[],
  order: readonly string[],
  rules: CapRules,
  rng: Rng,
  options: DraftOptions = {},
): DraftResult {
  if (prospects.length === 0) {
    return { picks: [], undrafted: [], signedUndrafted: 0, paused: null, onBoard: [] };
  }
  const startAt = options.startAt ?? 1;
  const choices = options.choices;

  // Truth, for measuring reaches after the fact. No club sees this.
  const trueRank = new Map<string, number>();
  [...prospects]
    .sort((a, b) => (b.ability + b.potential * 0.4) - (a.ability + a.potential * 0.4))
    .forEach((p, i) => trueRank.set(p.id, i + 1));

  const boards = new Map<string, BoardEntry[]>();
  const needsByTeam = new Map<string, TeamNeeds>();
  for (const teamId of order) {
    const front = league.fronts.get(teamId);
    if (front === undefined) continue;
    const needs = teamNeeds(rosterOf(index, teamId));
    needsByTeam.set(teamId, needs);
    boards.set(teamId, buildBoard(prospects, front, needs, rng));
  }

  const taken = new Set<string>();
  const picks: DraftPick[] = [];

  let paused: DraftResult['paused'] = null;
  for (let round = 1; round <= rules.draftRounds && paused === null; round += 1) {
    for (let slot = 0; slot < order.length; slot += 1) {
      const teamId = order[slot];
      if (teamId === undefined) continue;
      const overall = (round - 1) * order.length + slot + 1;
      // Picks already made in an earlier call are skipped rather than made
      // again: the players they brought in are already on the roster.
      if (overall < startAt) continue;
      const board = boards.get(teamId);
      if (board === undefined) continue;

      const mine = choices !== undefined && choices.teamId === teamId;
      const chosen = mine ? choices.picks?.get(overall) : undefined;
      if (mine && chosen === undefined && choices.stopForUser === true) {
        paused = { overall, round, teamId };
        break;
      }
      const entry = chosen === undefined
        ? board.find((e) => !taken.has(e.prospect.id))
        : board.find((e) => e.prospect.id === chosen && !taken.has(e.prospect.id));
      if (entry === undefined) {
        // A caller naming a prospect who is gone, or not in this class, is a
        // defect in the caller and is reported rather than quietly replaced
        // with whoever the engine liked.
        if (chosen !== undefined) {
          throw new Error(`Pick ${String(overall)} names ${chosen}, who is not on the board`);
        }
        continue;
      }
      taken.add(entry.prospect.id);
      const player = prospectToPlayer(entry.prospect);
      league.players.push(player);
      index.free.add(player);
      setTeam(index, player, teamId);
      player.contract = rookieContract(round, overall, rules, league.season);

      const needs = needsByTeam.get(teamId);
      picks.push({
        season: league.season,
        round,
        overall,
        teamId,
        prospectId: entry.prospect.id,
        group: entry.prospect.group,
        estimate: entry.report.estimate,
        trueAbility: entry.prospect.ability,
        bandLow: entry.report.low,
        bandHigh: entry.report.high,
        need: needs?.[entry.prospect.group] ?? 0,
        needRank: needs === undefined ? 0 : rankOfNeed(needs, entry.prospect.group),
        reach: (trueRank.get(entry.prospect.id) ?? 0) - overall,
      });
    }
  }

  // A draft that stopped for the caller keeps its class: the players nobody
  // took are still on the board, and the undrafted free agents are only
  // decided once the last pick has been made.
  if (paused !== null) {
    return {
      picks, undrafted: [], signedUndrafted: 0, paused,
      onBoard: prospects.filter((p) => !taken.has(p.id)),
    };
  }

  // Everyone else. Most never play; some catch on at the minimum.
  const undrafted: CareerPlayer[] = [];
  let signedUndrafted = 0;
  for (const prospect of prospects) {
    if (taken.has(prospect.id)) continue;
    const player = prospectToPlayer(prospect);
    league.players.push(player);
    index.free.add(player);
    if (rng.chance(DRAFT.undraftedSignRate) && order.length > 0) {
      const teamId = order[rng.int(0, order.length - 1)];
      if (teamId !== undefined) {
        setTeam(index, player, teamId);
        player.contract = rookieContract(0, 0, rules, league.season);
        signedUndrafted += 1;
      }
    }
    undrafted.push(player);
  }

  return { picks, undrafted, signedUndrafted, paused: null, onBoard: [] };
}

/**
 * Pick order, weakest club first.
 *
 * Without simulated results there is no standings table, so order is taken from
 * roster strength, which is what the standings would mostly reflect. Stated
 * plainly because it is a stand-in: once the season loop feeds real records in,
 * this is the seam to replace.
 */
export function strengthOrder(league: League, index: RosterIndex): string[] {
  return [...league.teamIds].sort((a, b) => {
    const strength = (teamId: string): number => {
      const held = rosterOf(index, teamId);
      if (held.length === 0) return 0;
      const top = held.map((p) => p.ability + p.mental).sort((x, y) => y - x).slice(0, 24);
      return top.reduce((s, v) => s + v, 0) / top.length;
    };
    return strength(a) - strength(b);
  });
}

/** Position of a group in a club's need ordering, 1 being the biggest. */
export function rankOfNeed(needs: TeamNeeds, group: PositionGroup): number {
  const ordered = (Object.entries(needs) as [PositionGroup, number][])
    .sort((a, b) => b[1] - a[1]);
  return ordered.findIndex(([g]) => g === group) + 1;
}

/** Whether a pick addressed a genuine hole. Used to measure how often clubs
 *  miss on need, which they should sometimes do. */
export function addressedNeed(pick: DraftPick, threshold = 0.35): boolean {
  return pick.need >= threshold;
}

/** Whether the pick landed on one of the club's biggest holes. */
export function addressedTopNeed(pick: DraftPick, within = 3): boolean {
  return pick.needRank >= 1 && pick.needRank <= within;
}
