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
import { optionalInt, optionalString, rawOf } from './parse.ts';
import { freshSeed62 } from '../seed.ts';
import { loadWorld } from './world.ts';
import { PostgresSaveStore } from './saveStore.ts';
import { ownedSave, rngSeed32, touchSave } from './save.ts';
import { defaultDepthChart, projectWorld, seedStandings, writeDepthChart } from './project/index.ts';
import { createRng } from '../engine/rng.ts';
import { primePipeline } from '../engine/offseason/population.ts';
import { serialize } from '../save/index.ts';
import type { Db } from './db.ts';

export interface CreateSaveIn {
  readonly name: string;
  readonly teamId: string;
  /** The save file the player picked. Omitted by callers with no menu behind
   *  them (the tests, the seed scripts), which take the lowest free slot. */
  readonly slot?: number;
  /** Both names or neither. A save with neither reports that it has no GM
   *  rather than being given a placeholder one. */
  readonly gmFirstName?: string;
  readonly gmLastName?: string;
}

export interface CreateSaveOut {
  readonly saveId: string;
  readonly season: number;
  readonly userTeamId: string;
  readonly slot: number;
}

export const ENGINE_VERSION = '0.1.0';

/** The first slot this player has nothing in. Used only when the caller names
 *  no slot; the menu always names one. */
async function lowestFreeSlot(db: Db, userId: string): Promise<number> {
  const rows = await db<{ slot: number }[]>`
    select slot from public.saves
     where user_id = ${userId} and not is_template order by slot`;
  const used = new Set(rows.map((r) => r.slot));
  let slot = 1;
  while (used.has(slot)) slot += 1;
  return slot;
}

export const createSave: Handler<CreateSaveIn, CreateSaveOut> = {
  auth: 'required',
  parse: (raw) => {
    const r = rawOf(raw);
    const name = typeof r['name'] === 'string' ? r['name'].trim() : '';
    const teamId = typeof r['teamId'] === 'string' ? r['teamId'].trim() : '';
    if (name === '') throw badRequest('name is required');
    if (teamId === '') throw badRequest('teamId is required');
    const slot = optionalInt(r, 'slot');
    if (slot !== undefined && slot < 1) throw badRequest('slot must be 1 or greater');
    const gmFirstName = optionalString(r, 'gmFirstName');
    const gmLastName = optionalString(r, 'gmLastName');
    // Half a name is worse than none: it would put "Vance" on a slot screen
    // with nothing in front of it and no way to tell whether the first name was
    // lost or never given.
    if ((gmFirstName === undefined) !== (gmLastName === undefined)) {
      throw badRequest('a general manager needs both a first and a last name');
    }
    return {
      name, teamId,
      ...(slot === undefined ? {} : { slot }),
      ...(gmFirstName === undefined ? {} : { gmFirstName }),
      ...(gmLastName === undefined ? {} : { gmLastName }),
    };
  },
  run: async ({ sql, userId }, input) => {
    if (userId === null) throw new ApiError(401, 'unauthorized', 'no user');
    const seed = freshSeed62();

    return sql.begin(async (tx) => {
      // The slot is settled before the world is cloned: 25,000 rows copied and
      // then rolled back is a slow way to say "that file is in use". The unique
      // index is still what guarantees it -- two tabs claiming one slot at the
      // same moment is a race this query cannot see, and the index can.
      const slot = input.slot ?? await lowestFreeSlot(tx, userId);
      const [taken] = await tx<{ id: string }[]>`
        select id from public.saves
         where user_id = ${userId} and not is_template and slot = ${slot}`;
      if (taken !== undefined) throw badRequest(`save file ${String(slot)} is already in use`);

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

      await tx`
        update public.saves
           set slot = ${slot},
               gm_first_name = ${input.gmFirstName ?? null},
               gm_last_name = ${input.gmLastName ?? null}
         where id = ${saveId}`;

      const save = await ownedSave(tx, userId, saveId);
      const seed32 = rngSeed32(save.rng_seed);

      // The world from the save's own rows, then the draft classes the first
      // offseasons will draw on: a league with an empty pipeline drafts nobody
      // for three years, which the reports guard against the same way.
      const league = await loadWorld(tx, saveId, save.season);
      primePipeline(league, createRng(seed32));

      await projectWorld(tx, saveId, league);
      // The seed's injury list describes the clubs as the season opens: a
      // player it lists as out for n weeks misses the first n-1. Dating those
      // rows to week 0 of this season is what lets the week runner read them.
      // Nine clubs' only kicker or punter is on the long-term list; they play
      // anyway, with the other specialist doing both jobs (roster.ts), until
      // in-season signing lets a club do better.
      await tx`
        update public.player_injuries set injured_season = ${save.season}, injured_week = 0
         where save_id = ${saveId} and injured_season is null`;
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

      return { saveId, season: save.season, userTeamId: input.teamId, slot };
    });
  },
};
