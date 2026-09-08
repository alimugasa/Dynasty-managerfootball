// Routing lives here, not in the transports.
//
// A transport maps an HTTP request to a route name and a raw body, and this
// module does everything after that: finds the handler, enforces its auth
// requirement, parses the input and runs it. Keeping the route table here means
// the dev shim and the edge function cannot disagree about which name reaches
// which handler -- there is only one table to disagree with.

import { ApiError, unauthorized, type HandlerContext, type Handler } from './context.ts';
import { health } from './health.ts';
import { createSave } from './createSave.ts';
import { simWeek } from './simWeek.ts';
import { deleteSave } from './deleteSave.ts';
import { advanceSeason } from './advanceSeason.ts';
import { save } from './reads/save.ts';
import { team } from './reads/team.ts';
import { roster, setDepthChart } from './reads/roster.ts';
import { league } from './reads/league.ts';
import { schedule } from './reads/schedule.ts';
import { playoffs } from './reads/playoffs.ts';
import { game } from './reads/game.ts';
import { office } from './reads/office.ts';
import { player } from './reads/player.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const ROUTES: Readonly<Record<string, Handler<any, any>>> = {
  health,
  'create-save': createSave,
  'sim-week': simWeek,
  'advance-season': advanceSeason,
  'delete-save': deleteSave,
  save,
  team,
  roster,
  'set-depth-chart': setDepthChart,
  league,
  schedule,
  playoffs,
  game,
  office,
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
  return handler.run(ctx, input);
}

export { ApiError };
