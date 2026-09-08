// The routes behind an offseason a manager plays: one step forward, and the
// five decisions he can make while he is in it.
//
// Every one takes the save under a row lock, exactly as sim-week does: two
// browsers open on the same dynasty must not both make the same pick.

import { badRequest, type Handler, type HandlerContext } from '../context.ts';
import { ownedSave, type SaveRow } from '../save.ts';
import type { Db } from '../db.ts';
import { optionalInt, rawOf, requireString, requireStringList } from '../parse.ts';
import { stepOffseason, type StepOutcome } from '../steps.ts';
import {
  draftPick, offer, proposeTrade, release, reSign,
  type MoveOutcome, type TradeOutcome,
} from '../moves.ts';

interface SaveOnly { readonly saveId: string }

/** Runs `work` with the save row locked, so two clients cannot make the same
 *  move twice. The same guard sim-week and advance-season use. */
function locked<In extends SaveOnly, Out>(
  work: (tx: Db, save: SaveRow, input: In) => Promise<Out>,
): (ctx: HandlerContext, input: In) => Promise<Out> {
  return ({ sql, userId }, input) => sql.begin(async (tx) => {
    await tx`select 1 from public.saves where id = ${input.saveId} for update`;
    const save = await ownedSave(tx, userId, input.saveId);
    return work(tx, save, input);
  }) as Promise<Out>;
}

const years = (raw: ReturnType<typeof rawOf>): number => {
  const value = optionalInt(raw, 'years') ?? 3;
  if (value < 1 || value > 5) throw badRequest('A deal runs one to five years');
  return value;
};

export const advanceOffseason: Handler<SaveOnly, StepOutcome> = {
  auth: 'required',
  parse: (raw) => ({ saveId: requireString(rawOf(raw), 'saveId') }),
  run: locked<SaveOnly, StepOutcome>((tx, save) => stepOffseason(tx, save)),
};

interface ReSignIn extends SaveOnly {
  readonly playerId: string;
  readonly years: number;
  readonly aav?: number;
}

export const reSignPlayer: Handler<ReSignIn, MoveOutcome> = {
  auth: 'required',
  parse: (raw) => {
    const r = rawOf(raw);
    const aav = optionalInt(r, 'aav');
    return {
      saveId: requireString(r, 'saveId'),
      playerId: requireString(r, 'playerId'),
      years: years(r),
      ...(aav === undefined ? {} : { aav }),
    };
  },
  run: locked<ReSignIn, MoveOutcome>((tx, save, input) =>
    reSign(tx, save, input.playerId, input.years, input.aav)),
};

interface PlayerIn extends SaveOnly { readonly playerId: string }

export const releasePlayer: Handler<PlayerIn, MoveOutcome> = {
  auth: 'required',
  parse: (raw) => {
    const r = rawOf(raw);
    return { saveId: requireString(r, 'saveId'), playerId: requireString(r, 'playerId') };
  },
  run: locked<PlayerIn, MoveOutcome>((tx, save, input) => release(tx, save, input.playerId)),
};

interface DraftPickIn extends SaveOnly { readonly prospectId: string }

export const makeDraftPick: Handler<DraftPickIn, MoveOutcome> = {
  auth: 'required',
  parse: (raw) => {
    const r = rawOf(raw);
    return { saveId: requireString(r, 'saveId'), prospectId: requireString(r, 'prospectId') };
  },
  run: locked<DraftPickIn, MoveOutcome>((tx, save, input) =>
    draftPick(tx, save, input.prospectId)),
};

interface OfferIn extends SaveOnly {
  readonly playerId: string;
  readonly aav: number;
  readonly years: number;
}

export const makeOffer: Handler<OfferIn, MoveOutcome> = {
  auth: 'required',
  parse: (raw) => {
    const r = rawOf(raw);
    return {
      saveId: requireString(r, 'saveId'),
      playerId: requireString(r, 'playerId'),
      // Zero withdraws an offer rather than making a free one.
      aav: optionalInt(r, 'aav') ?? 0,
      years: years(r),
    };
  },
  run: locked<OfferIn, MoveOutcome>((tx, save, input) =>
    offer(tx, save, input.playerId, input.aav, input.years)),
};

interface TradeIn extends SaveOnly {
  readonly teamId: string;
  readonly give: readonly string[];
  readonly get: readonly string[];
}

export const tradeOffer: Handler<TradeIn, TradeOutcome> = {
  auth: 'required',
  parse: (raw) => {
    const r = rawOf(raw);
    return {
      saveId: requireString(r, 'saveId'), teamId: requireString(r, 'teamId'),
      give: requireStringList(r, 'give'), get: requireStringList(r, 'get'),
    };
  },
  run: locked<TradeIn, TradeOutcome>((tx, save, input) =>
    proposeTrade(tx, save, input.teamId, input.give, input.get)),
};
