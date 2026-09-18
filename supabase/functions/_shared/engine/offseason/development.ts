// Offseason development: who got better, who fell off, and by how much.
//
// Ability moves here and nowhere else. Playing a game never changes a rating,
// which is what makes the population loop reproducible without simulating games
// and is how legacy/ENGINE.md isolated the talent-drift bug in the first place.
//
// The shape is a career arc, not a straight line. Before the peak a player
// closes some of the gap to his potential; after it he declines at a rate set by
// his position and accelerating with each year past peak. A separate mental term
// keeps accruing throughout, so a quarterback ages far better than a corner.

import { OFFSEASON, DECLINE_RATE, MENTAL_CAP, PEAK_AGE, POSITION_CEILING } from './calibration.ts';
import { clamp } from '../calibration.ts';
import type { Rng } from '../rng.ts';
import type { CareerPlayer, DevelopmentOutcome } from './types.ts';

// A breakout is a surprise, so it is measured against what this player was
// expected to gain -- not against an absolute number of rating points. An
// absolute threshold just re-detects headroom: a 66 with a ceiling of 92 clears
// four points in a routine year, and calling that a breakout every season makes
// the label meaningless.
/** Growth this far above expectation is a genuine breakout. */
const BREAKOUT_MULTIPLIER = 1.6;
/** Below which a growth year counts as squandered. */
const BUST_MULTIPLIER = 0.35;
/** A breakout must also be worth noticing in absolute terms. */
const BREAKOUT_MIN_DELTA = 2.5;
/** A player needs real room before a small gain counts against him. */
const BUST_HEADROOM = 8;

export interface DevelopmentContext {
  /** 0-1. A starter develops faster than a healthy scratch. */
  readonly playingTime: (player: CareerPlayer) => number;
  /** Team development multiplier, roughly 0.72 to 1.32. Good staffs grow
   *  players; bad ones waste them. */
  readonly coaching: (teamId: string | null) => number;
}

export const NEUTRAL_CONTEXT: DevelopmentContext = {
  playingTime: () => 1,
  coaching: () => 1,
};

/**
 * One offseason of development for one player. Mutates and returns what changed.
 *
 * The variance multipliers are the breakout and bust mechanism. Growth is
 * multiplied by a draw centred on 1 with a wide spread, floored at zero and
 * capped at 2.4: the same player, in the same situation, can gain nothing one
 * year and two and a half times the expected amount the next. Without that term
 * every prospect converges smoothly on his potential and there is no reason to
 * ever be wrong about anyone.
 */
export function developPlayer(
  player: CareerPlayer,
  context: DevelopmentContext,
  rng: Rng,
): DevelopmentOutcome {
  const d = OFFSEASON.development;
  const before = player.ability;
  const peak = PEAK_AGE[player.group];
  const headroom = player.potential - player.ability;
  const growing = player.age <= peak;
  let surprise = 1;

  if (growing) {
    const gap = Math.max(0, headroom);
    const snaps = clamp(context.playingTime(player), 0, 1);
    const expected =
      gap * d.growthGapShare *
      player.devRate *
      context.coaching(player.teamId) *
      (0.55 + 0.45 * snaps) *
      (0.7 + 0.6 * (player.workEthic / 100));
    const variance = clamp(
      rng.normal(1, d.growthVarianceSd), d.growthVarianceMin, d.growthVarianceMax,
    );
    surprise = variance;
    player.ability = Math.min(POSITION_CEILING[player.group], player.ability + expected * variance);
  } else {
    const yearsPast = player.age - peak;
    let drop = DECLINE_RATE[player.group] * (d.declineBase + d.declinePerYearPastPeak * yearsPast);
    drop *= clamp(rng.normal(1, d.declineVarianceSd), d.declineVarianceMin, d.declineVarianceMax);
    // Injury-driven decline. A career's worth of missed games compounds: the
    // body that has broken down keeps breaking down, and this is what separates
    // a player who aged from one who was worn out.
    const wear = Math.max(0, player.gamesMissedCareer - d.injuryDeclineThreshold);
    drop *= 1 + wear * d.injuryDeclinePerGame;
    player.ability = Math.max(d.abilityFloor, player.ability - drop);
  }

  // Experience sharpens the mental side even as the athleticism goes.
  if (player.experience >= 2) {
    player.mental = Math.min(
      MENTAL_CAP[player.group],
      player.mental + d.mentalGainPerSeason * (player.footballIq / 100),
    );
  }

  // Reputation chases ability and never quite arrives.
  const r = OFFSEASON.reputation;
  player.reputation += (player.ability - player.reputation) * r.convergence;
  player.reputation += (player.accolades.allLeague + player.accolades.awards) * r.perAccolade;

  player.age += 1;
  player.experience += 1;
  player.gamesMissedCareer += player.gamesMissedSeason;
  player.gamesMissedSeason = 0;

  const delta = player.ability - before;
  return {
    playerId: player.id,
    before,
    after: player.ability,
    delta,
    breakout: growing && surprise >= BREAKOUT_MULTIPLIER && delta >= BREAKOUT_MIN_DELTA,
    bust: growing && headroom >= BUST_HEADROOM && surprise <= BUST_MULTIPLIER,
  };
}

export function developAll(
  players: readonly CareerPlayer[],
  context: DevelopmentContext,
  rng: Rng,
): DevelopmentOutcome[] {
  const out: DevelopmentOutcome[] = [];
  for (const player of players) {
    if (player.retired) continue;
    out.push(developPlayer(player, context, rng));
  }
  return out;
}
