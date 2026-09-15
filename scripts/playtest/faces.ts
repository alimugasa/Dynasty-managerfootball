// Faces in the rig.
//
// The app's seed is a column: sha256(save_id || ':' || player_id), written by
// a trigger and editable by a commissioner. The rig has no Postgres and no
// save row, so it cannot reproduce that and does not pretend to -- it derives
// its own from the game's numeric seed and the player id. Rig faces are
// rig-local, which is the honest position for a rig that is explicitly not the
// deployable path (scripts/playtest/README.md).
//
// What it does share with the app is everything that matters for playing: the
// same generator, the same trait libraries, the same renderer. A player looks
// the same every time you open him, the same in week 1 and week 17, and the
// same after you reload the page, because the derivation is a pure function of
// two things the save already holds.

import { hashStream } from '../../supabase/functions/_shared/avatar/seed';

/** Sixteen hex characters, shaped like the column's value so nothing
 *  downstream has to care which side it came from. */
export function rigSeed(gameSeed: number, playerId: string): string {
  const a = hashStream(String(gameSeed), playerId);
  const b = hashStream(playerId, String(gameSeed));
  return `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
}
