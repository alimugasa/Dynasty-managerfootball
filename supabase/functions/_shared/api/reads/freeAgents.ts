// The free-agent pool, filtered.
//
// The request lists nine things a manager should be able to filter on, and
// every one of them is a parameter here rather than a column the screen sifts
// after the fact: the pool holds every unsigned player in the league, and a
// screen that reads all of them to show twelve is a screen that gets slower
// every week of the season.
//
// Scheme fit is the one filter that is not a stored column. It is computed
// against the managed club's own scheme, and it is null -- not fifty, not zero
// -- when the club has no scheme on record, so the screen can say "not scouted"
// instead of showing a number nobody measured.

import type { Handler } from '../context.ts';
import { ownedSave, seasonWeeks } from '../save.ts';
import { rawOf, optionalInt, optionalString, requireString } from '../parse.ts';
import {
  DEFAULT_POOL_FILTERS, readPool, type PoolFilters, type PoolPlayer,
} from '../freeAgentPool.ts';

/** Re-exported so a screen types its rows from the read it called rather than
 *  from the module the read happens to build them in. */
export type { PoolPlayer } from '../freeAgentPool.ts';
import { ACTIVE_ROSTER_LIMIT, teamCapPosition, teamRosterCount } from '../rosterSpace.ts';

export interface FreeAgentsIn extends PoolFilters {
  readonly saveId: string;
}

export interface FreeAgentsOut {
  readonly season: number;
  readonly week: number;
  readonly seasonWeeks: number;
  readonly phase: string;
  readonly rosterCount: number;
  readonly rosterLimit: number;
  readonly capSpace: number;
  /** Every unsigned player, before the filters. The screen says "12 of 231". */
  readonly poolSize: number;
  readonly players: readonly PoolPlayer[];
}

const HEALTH = new Set(['ANY', 'HEALTHY', 'INJURED']);
const SORTS = new Set(['OVERALL', 'POTENTIAL', 'ASK', 'AGE', 'NAME']);

export const freeAgents: Handler<FreeAgentsIn, FreeAgentsOut> = {
  auth: 'required',
  parse: (raw) => {
    const r = rawOf(raw);
    const health = optionalString(r, 'health') ?? 'ANY';
    const sort = optionalString(r, 'sort') ?? 'OVERALL';
    return {
      saveId: requireString(r, 'saveId'),
      ...DEFAULT_POOL_FILTERS,
      position: optionalString(r, 'position') ?? null,
      group: optionalString(r, 'group') ?? null,
      maxAge: optionalInt(r, 'maxAge') ?? null,
      minOverall: optionalInt(r, 'minOverall') ?? null,
      minPotential: optionalInt(r, 'minPotential') ?? null,
      minExperience: optionalInt(r, 'minExperience') ?? null,
      maxExperience: optionalInt(r, 'maxExperience') ?? null,
      maxAsk: optionalInt(r, 'maxAsk') ?? null,
      previousTeamId: optionalString(r, 'previousTeamId') ?? null,
      // An unknown value is refused rather than quietly read as the default:
      // a screen asking for something this does not understand is a bug, and
      // silently showing everybody would hide it.
      health: HEALTH.has(health) ? health : 'ANY',
      search: optionalString(r, 'search') ?? null,
      sort: SORTS.has(sort) ? sort : 'OVERALL',
      limit: Math.min(200, Math.max(1, optionalInt(r, 'limit') ?? DEFAULT_POOL_FILTERS.limit)),
    };
  },
  run: async ({ sql, userId }, input) => {
    const save = await ownedSave(sql, userId, input.saveId);
    const weeks = await seasonWeeks(sql, save.id, save.season);
    const players = await readPool(sql, save.id, save.season, save.week, weeks, input);
    const [size] = await sql<{ n: string }[]>`
      select count(*)::text as n
        from public.free_agents f
        join public.players p on p.save_id = f.save_id and p.player_id = f.player_id
       where f.save_id = ${save.id} and p.team_id is null and p.retired_season is null`;
    const cap = await teamCapPosition(sql, save.id, save.season, save.user_team_id);
    return {
      season: save.season, week: save.week, seasonWeeks: weeks, phase: save.phase,
      rosterCount: await teamRosterCount(sql, save.id, save.user_team_id),
      rosterLimit: ACTIVE_ROSTER_LIMIT,
      capSpace: cap.available,
      poolSize: Number(size?.n ?? 0),
      players,
    };
  },
};
