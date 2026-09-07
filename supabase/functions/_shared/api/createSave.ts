// Creates a dynasty: create_save() clones the template, and then the engine's
// state is built from the clone and projected back over it.
//
// The seed is generated here, on the server, and never accepted from the
// client. It decides every draft, every injury and every result for the life
// of the save; a client that could choose it could choose its outcomes, which
// is rule 2's whole concern. It is also never returned: the client has no use
// for it and no right to it.
//
// One transaction. A save either exists with its document, its rosters, its
// contracts, its cap sheet, its opening table and its depth chart, or it does
// not exist at all.

import { ApiError, badRequest, type Handler } from './context.ts';
import { freshSeed62 } from '../seed.ts';
import { loadWorld } from './world.ts';
import { PostgresSaveStore } from './saveStore.ts';
import { ownedSave, rngSeed32, touchSave } from './save.ts';
import { defaultDepthChart, projectWorld, seedStandings, writeDepthChart } from './project/index.ts';
import { createRng } from '../engine/rng.ts';
import { primePipeline } from '../engine/offseason/population.ts';
import { serialize } from '../save/index.ts';

export interface CreateSaveIn {
  readonly name: string;
  readonly teamId: string;
}

export interface CreateSaveOut {
  readonly saveId: string;
  readonly season: number;
  readonly userTeamId: string;
}

export const ENGINE_VERSION = '0.1.0';

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
    const seed = freshSeed62();

    return sql.begin(async (tx) => {
      let saveId: string;
      try {
        const [row] = await tx<{ id: string }[]>`
          select public.create_save(${userId}::uuid, ${input.name}, ${input.teamId},
                                    ${seed.toString()}::bigint, ${ENGINE_VERSION}) as id`;
        if (row === undefined) throw new Error('create_save returned no id');
        saveId = row.id;
      } catch (error) {
        // The function raises on an unknown club or a missing template; both are
        // the caller's problem, not a 500.
        const message = error instanceof Error ? error.message : String(error);
        if (/team|template/i.test(message)) throw badRequest(message);
        throw error;
      }

      const save = await ownedSave(tx, userId, saveId);
      const seed32 = rngSeed32(save.rng_seed);

      // The world from the save's own rows, then the draft classes the first
      // offseasons will draw on: a league with an empty pipeline drafts nobody
      // for three years, which the reports guard against the same way.
      const league = await loadWorld(tx, saveId, save.season);
      primePipeline(league, createRng(seed32));

      await projectWorld(tx, saveId, league);
      await writeDepthChart(tx, saveId, input.teamId, defaultDepthChart(league, input.teamId));
      await seedStandings(tx, saveId, save.season, league.teamIds);

      const now = new Date().toISOString();
      await new PostgresSaveStore(tx).write(saveId, serialize(league, {
        meta: {
          saveId, name: input.name, userTeamId: input.teamId,
          season: save.season, week: 1, phase: 'REGULAR_SEASON',
          seed: seed32, engineVersion: ENGINE_VERSION, createdAt: now, updatedAt: now,
        },
      }));
      await touchSave(tx, saveId, { week: 1, phase: 'REGULAR_SEASON' });

      return { saveId, season: save.season, userTeamId: input.teamId };
    });
  },
};
