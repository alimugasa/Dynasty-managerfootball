// The face data for a list of players, in one call.
//
// Every screen that shows a player could have had avatar_seed bolted onto its
// existing payload, and thirteen payload shapes would then each carry a field
// about drawing. This is the other choice: one read, asked for a list of ids,
// answering only the question "what do these men look like".
//
// It is also the choice rule 3 forces. The seed is a stored column a
// commissioner can edit, so a client that derived it from the save and player
// ids -- which it could, the backfill is exactly that hash -- would be
// inventing a value and would ignore every edit ever made. A face comes from
// the row or it does not come at all.

import { badRequest, type Handler } from '../context.ts';
import { ownedSave } from '../save.ts';
import { rawOf, requireString, requireStringList } from '../parse.ts';

/** A list long enough for a roster, a draft class page or a league leaderboard,
 *  and short enough that a caller cannot ask for the whole world in one go. */
const MAX_IDS = 400;

export interface AvatarsIn {
  readonly saveId: string;
  readonly playerIds: readonly string[];
}

export interface AvatarRow {
  readonly playerId: string;
  readonly seed: string;
  readonly position: string;
  readonly age: number;
  /** players.heritage. Null where the row has none, which is every row until a
   *  commissioner sets one -- the generator draws from the seed in that case
   *  and the null is the honest report that nothing is stored. */
  readonly heritage: readonly string[] | null;
  /** players.avatar_overrides, as stored. Passed through untouched: this read
   *  does not know what a renderer will do with it. */
  readonly overrides: unknown;
}

export interface AvatarsOut { readonly rows: readonly AvatarRow[] }

export const avatars: Handler<AvatarsIn, AvatarsOut> = {
  auth: 'required',
  parse: (raw) => {
    const r = rawOf(raw);
    const playerIds = requireStringList(r, 'playerIds');
    if (playerIds.length > MAX_IDS) {
      throw badRequest(`playerIds must hold at most ${String(MAX_IDS)} ids`);
    }
    return { saveId: requireString(r, 'saveId'), playerIds };
  },
  run: async ({ sql, userId }, input) => {
    const s = await ownedSave(sql, userId, input.saveId);
    if (input.playerIds.length === 0) return { rows: [] };
    const rows = await sql<{
      player_id: string; avatar_seed: string; position: string; age: number;
      heritage: string[] | null; avatar_overrides: unknown;
    }[]>`
      select player_id, avatar_seed, position, age, heritage, avatar_overrides
        from public.players
       where save_id = ${s.id} and player_id = any(${input.playerIds}::text[])`;
    return {
      rows: rows.map((r) => ({
        playerId: r.player_id,
        seed: r.avatar_seed,
        position: r.position,
        age: r.age,
        heritage: r.heritage,
        overrides: r.avatar_overrides,
      })),
    };
  },
};
