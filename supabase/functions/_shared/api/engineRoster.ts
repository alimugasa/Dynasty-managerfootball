// Moving a player in the engine's own state.
//
// This is the half of an in-season transaction that is easy to forget and
// impossible to notice. The relational tables are what every screen reads, so
// a claim that writes team_rosters, a contract and a cap sheet *looks* right
// from every direction a person can look. But the week runner does not build
// its teams from those tables. It builds them from the save document, and the
// projection runs the other way -- document to tables -- at every rollover.
//
// So a signing that only wrote rows had two consequences, both silent. The
// player never took a snap, because the eleven men on the field came from a
// document that still had him unattached. And at the next rollover the
// projection overwrote his roster row from that same document, so the move
// undid itself in March and nothing anywhere said it had.
//
// Every path that moves a player in-season goes through here as well.

import type { Db } from './db.ts';

export interface DocumentContract {
  readonly aav: number;
  readonly years: number;
  readonly yearsRemaining: number;
  readonly guaranteed: number;
  readonly signedSeason: number;
}

export interface DocumentMove {
  readonly playerId: string;
  /** Null releases him. */
  readonly teamId: string | null;
  /** The deal he is on. Null for a released player: a man with no club is on
   *  no contract, and the engine's offseason reads exactly that field to
   *  decide who is on the market. */
  readonly contract: DocumentContract | null;
  /** The club he last played for, which the market's loyalty weighting reads.
   *  Given on a release -- the club he has just left is the one he might go
   *  back to -- and omitted on a signing, which leaves it as it was. */
  readonly previousTeamId?: string;
}

/**
 * Applies a move to the save document.
 *
 * Addressed by position in the players array, found by id: jsonb_set needs an
 * index, and the document stores players as a list rather than a map. Keying
 * them by id would make a better document and is not the document this game
 * has, so the index is looked up rather than assumed.
 *
 * A player the document does not hold -- a seeded specialist the engine never
 * modelled -- updates nothing and is not an error. He is not simulated either
 * way, so there is nothing for this to keep in step.
 */
export async function applyDocumentMove(
  db: Db, saveId: string, move: DocumentMove,
): Promise<void> {
  const contract = move.contract === null ? 'null' : JSON.stringify(move.contract);
  const team = move.teamId === null ? 'null' : JSON.stringify(move.teamId);
  await setField(db, saveId, move.playerId, 'teamId', team);
  await setField(db, saveId, move.playerId, 'contract', contract);
  // Only when there is one to set: a signing leaves it as it was, because the
  // club he last played for has not changed by joining a new one -- he has not
  // played for the new one yet.
  if (move.previousTeamId !== undefined) {
    await setField(db, saveId, move.playerId, 'previousTeamId',
      JSON.stringify(move.previousTeamId));
  }
}

/**
 * Sets one field on one player in the document.
 *
 * Addressed by position in the players array, found by id: jsonb_set needs an
 * index, and the document stores players as a list rather than a map. Keying
 * them by id would make a better document and is not the document this game
 * has, so the index is looked up rather than assumed.
 *
 * `value` is a JSON literal as text -- "null", a quoted id, an object -- so
 * every call passes a string and no parameter is ever bare.
 */
async function setField(
  db: Db, saveId: string, playerId: string, field: string, value: string,
): Promise<void> {
  await db`
    update public.save_documents d
       set document = jsonb_set(
             d.document, array['players', f.idx::text, ${field}], ${value}::text::jsonb)
      from (
        select p.ordinality - 1 as idx
          from public.save_documents dd,
               lateral jsonb_array_elements(dd.document -> 'players')
                 with ordinality as p(value, ordinality)
         where dd.save_id = ${saveId} and p.value ->> 'id' = ${playerId}
         limit 1
      ) f
     where d.save_id = ${saveId}`;
}

/**
 * Adds to a club's dead money in the document.
 *
 * The document keeps dead money per club per season, and the offseason's
 * compliance pass spends the winter working around it. A release that charged
 * the relational cap sheet and not this one would be a charge that expired at
 * the rollover -- which is the most convenient possible bug and therefore the
 * one worth being most careful about.
 */
export async function addDocumentDeadMoney(
  db: Db, saveId: string, teamId: string, season: number, amount: number,
): Promise<void> {
  if (amount <= 0) return;
  // The club's whole entry is rebuilt rather than one season inside it:
  // jsonb_set only creates the last key on a path, so a club with no dead
  // money on record at all -- which is every club until its first release --
  // would have failed to gain any.
  await db`
    update public.save_documents d
       set document = jsonb_set(
             d.document, array['deadMoney', ${teamId}],
             coalesce(d.document -> 'deadMoney' -> ${teamId}, '{}'::jsonb)
               -- ::text on the key. jsonb_build_object takes "any", so a bare
               -- parameter there is a type Postgres cannot infer from its
               -- surroundings, and it refuses to prepare the statement at all
               -- rather than guessing -- reported only as "could not determine
               -- data type of parameter $3", which names no table and no
               -- column and is a long way from the call that caused it.
               || jsonb_build_object(
                    ${String(season)}::text,
                    coalesce(
                      (d.document #>> array['deadMoney', ${teamId}, ${String(season)}])::bigint,
                      0) + ${amount}::bigint),
             true)
     where d.save_id = ${saveId}`;
}
