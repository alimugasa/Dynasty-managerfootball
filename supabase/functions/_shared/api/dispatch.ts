// Routing lives here, not in the transports.
//
// A transport maps an HTTP request to a route name and a raw body, and this
// module does everything after that: finds the handler, enforces its auth
// requirement, parses the input and runs it. Keeping the route table here means
// the dev shim and the edge function cannot disagree about which name reaches
// which handler -- there is only one table to disagree with.

import { ApiError, unauthorized, type HandlerContext, type Handler } from './context.ts';
import { health } from './health.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const ROUTES: Readonly<Record<string, Handler<any, any>>> = {
  health,
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
