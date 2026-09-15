// Where each stage of the offseason draws its randomness from.
//
// Separate offsets, so stopping between two stages cannot change what either
// of them does: a manager who closes the browser at the draft and comes back
// tomorrow gets the market he would have got today.

import { offseasonStream } from '../save.ts';

const stream = (seed32: number, season: number, offset: number): number =>
  offseasonStream(seed32, season) + offset;

export const OFFSEASON_STREAMS = {
  settle: (seed32: number, season: number): number => stream(seed32, season, 0),
  draft: (seed32: number, season: number, fromPick: number): number =>
    stream(seed32, season, 7919 * fromPick),
  market: (seed32: number, season: number): number => stream(seed32, season, 104_729),
  camp: (seed32: number, season: number): number => stream(seed32, season, 1_299_709),
} as const;
