// Team needs.
//
// A need is not "how many players do we have at this position" but "how good is
// the group we would actually put on the field". A club with six mediocre
// corners needs a corner; a club with three good ones does not.

import { clamp } from '../calibration.ts';
import { POSITION_GROUPS, type PositionGroup } from '../types.ts';
import { ROSTER_QUOTA } from './league.ts';
import type { CareerPlayer } from './types.ts';

/** How many of each group take the field on a base snap. Needs are measured
 *  against the starters, not against the whole roster. */
export const STARTERS: Readonly<Record<PositionGroup, number>> = {
  QB: 1, RB: 1, WR: 3, TE: 1, OL: 5,
  EDGE: 2, DT: 2, LB: 3, CB: 3, S: 2, K: 1, P: 1,
};

/** Positional value: what a club will pay to be good here. A quarterback moves
 *  a season more than a punter does, and boards have to say so. */
export const POSITION_VALUE: Readonly<Record<PositionGroup, number>> = {
  QB: 1.0, EDGE: 0.8, OL: 0.66, CB: 0.68, WR: 0.62, DT: 0.55,
  S: 0.4, TE: 0.38, LB: 0.35, RB: 0.28, K: 0.12, P: 0.1,
};

/** The rating a starting group is measured against. Above this there is no
 *  need; well below it there is an urgent one. */
const ADEQUATE_STARTER = 76;
const NEED_RANGE = 22;
/** What an empty group is treated as, so a hole reads as a maximum need rather
 *  than as a division by zero. */
const EMPTY_GROUP_RATING = 40;

export type TeamNeeds = Readonly<Record<PositionGroup, number>>;

/** 0 (set here) to 1 (desperate), per group. */
export function teamNeeds(roster: readonly CareerPlayer[]): TeamNeeds {
  const byGroup = new Map<PositionGroup, number[]>();
  for (const player of roster) {
    const list = byGroup.get(player.group) ?? [];
    list.push(player.ability + player.mental);
    byGroup.set(player.group, list);
  }

  const needs = {} as Record<PositionGroup, number>;
  for (const group of POSITION_GROUPS) {
    const values = (byGroup.get(group) ?? []).sort((a, b) => b - a);
    const starters = Math.max(1, STARTERS[group]);
    const top = values.slice(0, starters);
    const average = top.length > 0
      ? top.reduce((a, b) => a + b, 0) / top.length
      : EMPTY_GROUP_RATING;
    needs[group] = clamp((ADEQUATE_STARTER - average) / NEED_RANGE, 0, 1);
  }
  return needs;
}

/** True when a club has no room left at a group and no reason to want more.
 *  The quota is passed in because the ceiling during the offseason is not the
 *  ceiling on the season-opening roster. */
export function saturated(
  roster: readonly CareerPlayer[],
  group: PositionGroup,
  needs: TeamNeeds,
  quota: Readonly<Record<PositionGroup, number>> = ROSTER_QUOTA,
): boolean {
  const held = roster.filter((p) => p.group === group).length;
  return held >= quota[group] && (needs[group] ?? 0) < 0.25;
}
