// Construction of a PlayEvent. Split out of the game loop so the loop reads as
// the sequence of football decisions it is, rather than as object assembly.

import type { InjuryEvent, PlayEvent, PlayType } from './types.ts';
import type { PlayResolution } from './plays.ts';

export interface EventContext {
  readonly index: number;
  readonly quarter: number;
  readonly clock: number;
  readonly offense: string;
  readonly defense: string;
  readonly down: number;
  readonly distance: number;
  readonly yardLine: number;
  readonly homeScore: number;
  readonly awayScore: number;
}

/** Optional participant fields are omitted entirely rather than set to
 *  undefined, which `exactOptionalPropertyTypes` requires and which keeps a
 *  serialized event free of null noise. */
export function makePlayEvent(
  context: EventContext,
  playType: PlayType,
  resolution: PlayResolution,
  clockConsumed: number,
  points: number,
  firstDown: boolean,
  injury: InjuryEvent | undefined,
): PlayEvent {
  return {
    ...context,
    playType,
    outcome: resolution.outcome,
    yards: resolution.yards,
    firstDown,
    points,
    clockConsumed,
    ...(resolution.wasSack ? { sack: true as const } : {}),
    ...(resolution.passer !== undefined ? { passer: resolution.passer.id } : {}),
    ...(resolution.rusher !== undefined ? { rusher: resolution.rusher.id } : {}),
    ...(resolution.receiver !== undefined ? { receiver: resolution.receiver.id } : {}),
    ...(resolution.defender !== undefined ? { defender: resolution.defender.id } : {}),
    ...(resolution.kicker !== undefined ? { kicker: resolution.kicker.id } : {}),
    ...(injury !== undefined ? { injury } : {}),
  };
}
