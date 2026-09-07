// Creates a dynasty: one call to create_save(), which clones the template.
//
// The seed is generated here, on the server, and never accepted from the
// client. It decides every draft, every injury and every result for the life
// of the save; a client that could choose it could choose its outcomes, which
// is rule 2's whole concern. It is also never returned: the client has no use
// for it and no right to it.

import { ApiError, badRequest, type Handler } from './context.ts';

export interface CreateSaveIn {
  readonly name: string;
  readonly teamId: string;
}

export interface CreateSaveOut {
  readonly saveId: string;
  readonly season: number;
  readonly userTeamId: string;
}

/** A 62-bit positive integer that is never zero. Zero is the template's
 *  placeholder and create_save() refuses it. */
function freshSeed(): bigint {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let seed = 0n;
  for (const b of bytes) seed = (seed << 8n) | BigInt(b);
  seed &= (1n << 62n) - 1n;
  return seed === 0n ? 1n : seed;
}

export const createSave: Handler<CreateSaveIn, CreateSaveOut> = {
  auth: 'required',
  parse: (raw) => {
    const r = (raw ?? {}) as Partial<Record<string, unknown>>;
    const name = typeof r['name'] === 'string' ? r['name'].trim() : '';
    const teamId = typeof r['teamId'] === 'string' ? r['teamId'].trim() : '';
    if (name === '') throw badRequest('name is required');
    if (teamId === '') throw badRequest('teamId is required');
    return { name, teamId };
  },
  run: async ({ sql, userId }, input) => {
    if (userId === null) throw new ApiError(401, 'unauthorized', 'no user');
    const seed = freshSeed();
    const version = '0.1.0';

    let saveId: string;
    try {
      const [row] = await sql<{ id: string }[]>`
        select public.create_save(${userId}::uuid, ${input.name}, ${input.teamId},
                                  ${seed.toString()}::bigint, ${version}) as id`;
      if (row === undefined) throw new Error('create_save returned no id');
      saveId = row.id;
    } catch (error) {
      // The function raises on an unknown club or a missing template; both are
      // the caller's problem, not a 500.
      const message = error instanceof Error ? error.message : String(error);
      if (/team|template/i.test(message)) throw badRequest(message);
      throw error;
    }

    const [save] = await sql<{ season: number; user_team_id: string }[]>`
      select season, user_team_id from public.saves where id = ${saveId}`;
    if (save === undefined) throw new Error('created save not found');
    return { saveId, season: save.season, userTeamId: save.user_team_id };
  },
};
