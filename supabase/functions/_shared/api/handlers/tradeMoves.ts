// The moves a manager makes in the Trade Center.
//
// Quote a package, propose it, answer an offer that came in, take a player on
// or off the block. All of them take the save row's lock like every other
// write, so two tabs cannot execute the same trade twice or move a player who
// has already gone.
//
// The one decision worth naming: a proposal to a computer-run club is answered
// in the same call that made it. A club that took a week to reply would be
// realistic and unplayable -- a manager building a deadline deal needs to know
// now, and the negotiation *is* the game. What takes time in this system is
// the deadline, which is the clock that actually matters.

import { badRequest, type Handler, type HandlerContext } from '../context.ts';
import { ownedSave, seasonWeeks, type SaveRow } from '../save.ts';
import { rawOf, optionalString, requireString } from '../parse.ts';
import type { Db } from '../db.ts';
import {
  assetsOf, quoteTrade, requireOwnership, requireWindowOpen, writeProposal,
  type PackageIn, type TradeQuote,
} from '../tradeDeal.ts';
import { valueAssets, type AssetRef } from '../tradeAssets.ts';
import { clubTradeContext } from '../tradeContext.ts';
import { counterFor, evaluateTrade } from '../tradeInterest.ts';
import { executeTrade } from '../tradeExecute.ts';
import { buildCounterPackage } from '../tradeCounter.ts';
import { moraleAfterBlock, moraleAfterUnblock } from '../tradeMorale.ts';
import { tradeStory } from '../tradeNews.ts';
import { insertNews } from '../news.ts';
import { clubNames } from '../transactionLog.ts';

interface SaveOnly { readonly saveId: string }

function locked<In extends SaveOnly, Out>(
  work: (tx: Db, save: SaveRow, input: In) => Promise<Out>,
): (ctx: HandlerContext, input: In) => Promise<Out> {
  return ({ sql, userId }, input) => sql.begin(async (tx) => {
    await tx`select 1 from public.saves where id = ${input.saveId} for update`;
    const save = await ownedSave(tx, userId, input.saveId);
    return work(tx, save, input);
  }) as Promise<Out>;
}

/** A list of "PLAYER:id" / "PICK:id" strings, which is how a package crosses
 *  the wire: one field rather than two parallel arrays that can disagree. */
function parseAssets(raw: Record<string, unknown>, key: string): readonly AssetRef[] {
  const value = raw[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw badRequest(`${key} must be a list of assets`);
  return value.map((entry) => {
    if (typeof entry !== 'string') throw badRequest(`${key} must be a list of assets`);
    const [kind, ...rest] = entry.split(':');
    const id = rest.join(':');
    if ((kind !== 'PLAYER' && kind !== 'PICK') || id === '') {
      throw badRequest(`${key} entries look like "PLAYER:<id>" or "PICK:<id>"`);
    }
    return { kind, id };
  });
}

// ------------------------------------------------------------------ quoting

export interface QuoteIn extends SaveOnly {
  readonly teamId: string;
  readonly give: readonly AssetRef[];
  readonly get: readonly AssetRef[];
}

/** What they make of it. Writes nothing: the screen calls this on every
 *  change while a package is being built. */
export const quoteTradeOffer: Handler<QuoteIn, TradeQuote> = {
  auth: 'required',
  parse: (raw) => {
    const r = rawOf(raw);
    return {
      saveId: requireString(r, 'saveId'), teamId: requireString(r, 'teamId'),
      give: parseAssets(r, 'give'), get: parseAssets(r, 'get'),
    };
  },
  run: async ({ sql, userId }, input) => {
    const save = await ownedSave(sql, userId, input.saveId);
    return quoteTrade(sql, save, input.teamId, { give: input.give, get: input.get });
  },
};

// ---------------------------------------------------------------- proposing

export interface ProposeOut {
  readonly tradeId: number;
  readonly answer: 'ACCEPTED' | 'REJECTED' | 'COUNTERED';
  readonly quote: TradeQuote;
  /** Set when they answered with terms of their own. */
  readonly counterTradeId: number | null;
  readonly summary: string;
}

/**
 * Puts the package to them, and hears back.
 *
 * Accepted trades execute inside this transaction. A deal that was agreed and
 * then applied in a second call is a deal that can be agreed twice, and the
 * roster it moves is the same roster either way.
 */
export const proposeTradeOffer: Handler<QuoteIn, ProposeOut> = {
  auth: 'required',
  parse: (raw) => quoteTradeOffer.parse(raw),
  run: locked<QuoteIn, ProposeOut>(async (tx, save, input) => {
    await requireWindowOpen(tx, save);
    const pkg: PackageIn = { give: input.give, get: input.get };
    const quote = await quoteTrade(tx, save, input.teamId, pkg);

    const tradeId = await writeProposal(
      tx, save, save.user_team_id, input.teamId, pkg, quote, quote.giving, quote.getting);

    if (quote.accepted) {
      const done = await executeTrade(tx, save, tradeId);
      await insertNews(tx, save.id, await tradeStory(tx, save, done, 'USER'));
      return {
        tradeId, answer: 'ACCEPTED', quote, counterTradeId: null,
        summary: `${quote.them.name} accepted. ${String(done.moved)} assets moved.`,
      };
    }

    // Close but not enough: they answer with terms of their own, built from
    // the gap rather than from a template.
    if (quote.counter !== null) {
      const counter = await buildCounterPackage(
        tx, save, input.teamId, pkg, quote.counter);
      if (counter !== null) {
        const counterId = await writeProposal(
          tx, save, input.teamId, save.user_team_id,
          { give: counter.give, get: counter.get },
          null, counter.giving, counter.getting);
        await tx`
          update public.trades set state = 'COUNTERED', countered_by = ${counterId},
                 resolved_at = now()
           where save_id = ${save.id} and trade_id = ${tradeId}`;
        return {
          tradeId, answer: 'COUNTERED', quote, counterTradeId: counterId,
          summary: `${quote.them.name} countered: ${counter.summary}`,
        };
      }
    }

    await tx`
      update public.trades set state = 'REJECTED', resolved_at = now()
       where save_id = ${save.id} and trade_id = ${tradeId}`;
    return {
      tradeId, answer: 'REJECTED', quote, counterTradeId: null,
      summary: quote.blocked ?? quote.reasons[0] ?? `${quote.them.name} said no.`,
    };
  }),
};

// ----------------------------------------------------------- answering one

export interface RespondIn extends SaveOnly {
  readonly tradeId: number;
  readonly action: 'ACCEPT' | 'REJECT' | 'WITHDRAW';
}

export interface RespondOut {
  readonly tradeId: number;
  readonly state: string;
  readonly summary: string;
}

/** Accept an offer that came in, turn it down, or take back one of your own. */
export const respondToTrade: Handler<RespondIn, RespondOut> = {
  auth: 'required',
  parse: (raw) => {
    const r = rawOf(raw);
    const action = optionalString(r, 'action') ?? '';
    if (action !== 'ACCEPT' && action !== 'REJECT' && action !== 'WITHDRAW') {
      throw badRequest('action must be ACCEPT, REJECT or WITHDRAW');
    }
    const tradeId = Number(r['tradeId']);
    if (!Number.isInteger(tradeId)) throw badRequest('tradeId is required');
    return { saveId: requireString(r, 'saveId'), tradeId, action };
  },
  run: locked<RespondIn, RespondOut>(async (tx, save, input) => {
    const [trade] = await tx<{
      state: string; from_team_id: string; to_team_id: string;
    }[]>`
      select state, from_team_id, to_team_id from public.trades
       where save_id = ${save.id} and trade_id = ${input.tradeId}`;
    if (trade === undefined) throw badRequest('That trade is not on record');
    if (trade.state !== 'PROPOSED') {
      throw badRequest(`That trade has already been ${trade.state.toLowerCase()}`);
    }

    if (input.action === 'WITHDRAW') {
      if (trade.from_team_id !== save.user_team_id) {
        throw badRequest('Only the club that made an offer can withdraw it');
      }
      await tx`
        update public.trades set state = 'WITHDRAWN', resolved_at = now()
         where save_id = ${save.id} and trade_id = ${input.tradeId}`;
      return { tradeId: input.tradeId, state: 'WITHDRAWN', summary: 'Offer withdrawn.' };
    }

    if (trade.to_team_id !== save.user_team_id) {
      throw badRequest('Only the club an offer was made to can answer it');
    }
    if (input.action === 'REJECT') {
      await tx`
        update public.trades set state = 'REJECTED', resolved_at = now()
         where save_id = ${save.id} and trade_id = ${input.tradeId}`;
      return { tradeId: input.tradeId, state: 'REJECTED', summary: 'Offer turned down.' };
    }

    // Accepting. The window is checked again here rather than only at
    // proposal: an offer made before the deadline and accepted after it would
    // be a trade completed after the deadline, which is the one thing a
    // deadline exists to prevent.
    await requireWindowOpen(tx, save);
    const { byTeam } = await assetsOf(tx, save.id, input.tradeId);
    for (const [teamId, assets] of byTeam) {
      await requireOwnership(tx, save.id, teamId, assets);
    }
    const done = await executeTrade(tx, save, input.tradeId);
    await insertNews(tx, save.id, await tradeStory(tx, save, done, 'USER'));
    const names = await clubNames(tx, save.id);
    return {
      tradeId: input.tradeId, state: 'ACCEPTED',
      summary: `Trade agreed with ${names.get(trade.from_team_id) ?? trade.from_team_id}.`,
    };
  }),
};

// --------------------------------------------------------------- the block

export interface BlockIn extends SaveOnly {
  readonly playerId: string;
  readonly listed: boolean;
  readonly note: string | null;
}

export interface BlockOut {
  readonly playerId: string;
  readonly listed: boolean;
  readonly morale: number | null;
  readonly summary: string;
}

/**
 * Puts a player on the trade block, or takes him off.
 *
 * Being made available is not a compliment, and the player notices. That is
 * the one place morale is created rather than only moved: a player nobody has
 * ever recorded a feeling about acquires one the moment his club tells the
 * league he is for sale.
 */
export const setTradeBlock: Handler<BlockIn, BlockOut> = {
  auth: 'required',
  parse: (raw) => {
    const r = rawOf(raw);
    return {
      saveId: requireString(r, 'saveId'),
      playerId: requireString(r, 'playerId'),
      listed: r['listed'] !== false,
      note: optionalString(r, 'note') ?? null,
    };
  },
  run: locked<BlockIn, BlockOut>(async (tx, save, input) => {
    const [player] = await tx<{ display_name: string; morale: number | null }[]>`
      select p.display_name, p.morale
        from public.team_rosters r
        join public.players p on p.save_id = r.save_id and p.player_id = r.player_id
       where r.save_id = ${save.id} and r.team_id = ${save.user_team_id}
         and r.player_id = ${input.playerId}`;
    if (player === undefined) throw badRequest('That player is not on your roster');

    if (!input.listed) {
      await tx`
        delete from public.trade_block
         where save_id = ${save.id} and player_id = ${input.playerId}`;
      const morale = moraleAfterUnblock(player.morale);
      if (morale !== null) {
        await tx`
          update public.players set morale = ${morale}
           where save_id = ${save.id} and player_id = ${input.playerId}`;
      }
      return {
        playerId: input.playerId, listed: false, morale,
        summary: `${player.display_name} is off the trade block.`,
      };
    }

    await tx`
      insert into public.trade_block (
        save_id, player_id, team_id, listed_season, listed_week, asking_note)
      values (${save.id}, ${input.playerId}, ${save.user_team_id},
              ${save.season}, ${save.week}, ${input.note})
      on conflict (save_id, player_id) do update
        set asking_note = excluded.asking_note,
            listed_season = excluded.listed_season,
            listed_week = excluded.listed_week`;
    const morale = moraleAfterBlock(player.morale);
    await tx`
      update public.players set morale = ${morale}
       where save_id = ${save.id} and player_id = ${input.playerId}`;
    return {
      playerId: input.playerId, listed: true, morale,
      summary: `${player.display_name} is on the trade block. He knows.`,
    };
  }),
};

export { seasonWeeks, clubTradeContext, evaluateTrade, counterFor, valueAssets };
