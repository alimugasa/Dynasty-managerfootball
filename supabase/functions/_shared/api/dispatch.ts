// Routing lives here, not in the transports.
//
// A transport maps an HTTP request to a route name and a raw body, and this
// module does everything after that: finds the handler, enforces its auth
// requirement, parses the input and runs it. Keeping the route table here means
// the dev shim and the edge function cannot disagree about which name reaches
// which handler -- there is only one table to disagree with.

import { ApiError, unauthorized, type HandlerContext, type Handler } from './context.ts';
import { BuildStepError } from './buildSteps.ts';
import { health } from './health.ts';
import { createSave } from './createSave.ts';
import { simWeek } from './simWeek.ts';
import { deleteSave } from './deleteSave.ts';
import { renameSave } from './renameSave.ts';
import { markChecklistItem } from './markChecklist.ts';
import { markNewsRead } from './markNewsRead.ts';
import { advanceSeason } from './advanceSeason.ts';
import { save } from './reads/save.ts';
import { slots } from './reads/slots.ts';
import { clubs } from './reads/clubs.ts';
import { teamProfiles } from './reads/teamProfiles.ts';
import { team } from './reads/team.ts';
import { dashboard } from './reads/dashboard.ts';
import { roster, setDepthChart } from './reads/roster.ts';
import { league } from './reads/league.ts';
import { schedule } from './reads/schedule.ts';
import { playoffs } from './reads/playoffs.ts';
import { game } from './reads/game.ts';
import { office } from './reads/office.ts';
import { news } from './reads/news.ts';
import { camp } from './reads/camp.ts';
import { waiverWire } from './reads/waiverWire.ts';
import { freeAgents } from './reads/freeAgents.ts';
import { transactions } from './reads/transactions.ts';
import { tradeCenter } from './reads/tradeCenter.ts';
import { tradeAssets } from './reads/tradeAssetsRead.ts';
import { staff } from './reads/staff.ts';
import { recap } from './reads/recap.ts';
import { offseason } from './reads/offseason.ts';
import {
  advanceOffseason, makeDraftPick, makeOffer, releasePlayer, reSignPlayer, tradeOffer,
} from './handlers/offseasonMoves.ts';
import {
  advanceCamp, finalize53, previewCut, releaseFromRoster,
} from './handlers/campMoves.ts';
import { claimPlayer, offerContract, withdrawClaim } from './handlers/marketMoves.ts';
import {
  proposeTradeOffer, quoteTradeOffer, respondToTrade, setTradeBlock,
} from './handlers/tradeMoves.ts';
import { player } from './reads/player.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const ROUTES: Readonly<Record<string, Handler<any, any>>> = {
  health,
  'create-save': createSave,
  'sim-week': simWeek,
  'advance-season': advanceSeason,
  'delete-save': deleteSave,
  'rename-save': renameSave,
  'mark-checklist': markChecklistItem,
  'mark-news-read': markNewsRead,
  save,
  slots,
  clubs,
  'team-profiles': teamProfiles,
  team,
  dashboard,
  roster,
  'set-depth-chart': setDepthChart,
  league,
  schedule,
  playoffs,
  game,
  office,
  news,
  camp,
  'waiver-wire': waiverWire,
  'free-agents': freeAgents,
  transactions,
  'claim-player': claimPlayer,
  'withdraw-claim': withdrawClaim,
  'offer-contract': offerContract,
  'trade-center': tradeCenter,
  'trade-assets': tradeAssets,
  'quote-trade': quoteTradeOffer,
  'propose-trade': proposeTradeOffer,
  'respond-trade': respondToTrade,
  'trade-block': setTradeBlock,
  staff,
  recap,
  offseason,
  'advance-offseason': advanceOffseason,
  'advance-camp': advanceCamp,
  'preview-cut': previewCut,
  'cut-player': releaseFromRoster,
  'finalize-roster': finalize53,
  're-sign': reSignPlayer,
  release: releasePlayer,
  'draft-pick': makeDraftPick,
  offer: makeOffer,
  trade: tradeOffer,
  player,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export type RouteName = keyof typeof ROUTES;

export function isRoute(name: string): name is RouteName {
  return Object.prototype.hasOwnProperty.call(ROUTES, name);
}

export async function dispatch(
  name: string, raw: unknown, ctx: HandlerContext,
): Promise<unknown> {
  if (!isRoute(name)) throw new ApiError(404, 'no_such_route', `No route named "${name}"`);
  const handler = ROUTES[name];
  if (handler === undefined) throw new ApiError(404, 'no_such_route', `No route named "${name}"`);
  if (handler.auth === 'required' && ctx.userId === null) throw unauthorized();
  const input: unknown = handler.parse(raw);
  try {
    return await handler.run(ctx, input);
  } catch (error) {
    // A step that named itself keeps its name across the wire, so the screen
    // watching the build can say which one failed. Everything else is passed
    // through untouched.
    if (error instanceof BuildStepError) {
      throw new ApiError(500, 'build_failed', error.message, error.step);
    }
    throw error;
  }
}

export { ApiError };
