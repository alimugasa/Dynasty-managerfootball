// Which save, whose, and which random stream.

import type { Db } from './db.ts';
import { badRequest, notFound } from './context.ts';

export interface SaveRow {
  readonly id: string;
  readonly user_id: string;
  readonly name: string;
  readonly user_team_id: string;
  readonly season: number;
  readonly week: number;
  readonly phase: string;
  /** bigint on the wire; kept as text so no digit is lost. */
  readonly rng_seed: string;
  readonly engine_version: string;
  readonly schema_version: number;
}

const COLUMNS = `id, user_id, name, user_team_id, season, week, phase,
                 rng_seed::text as rng_seed, engine_version, schema_version`;

/**
 * The save, if this user owns it. Another user's save is "not found", not
 * "forbidden": the response must not confirm the id exists. The service role
 * bypasses RLS, so this filter is the isolation between users on every write
 * path -- there is no second line of defence behind it.
 */
export async function ownedSave(db: Db, userId: string | null, saveId: string): Promise<SaveRow> {
  if (userId === null) throw notFound('save');
  if (!/^[0-9a-f-]{36}$/i.test(saveId)) throw badRequest('saveId is not a uuid');
  const [row] = await db<SaveRow[]>`
    select ${db.unsafe(COLUMNS)} from public.saves
     where id = ${saveId} and user_id = ${userId} and not is_template`;
  if (row === undefined) throw notFound('save');
  return row;
}

export async function latestSave(db: Db, userId: string): Promise<SaveRow | null> {
  const [row] = await db<SaveRow[]>`
    select ${db.unsafe(COLUMNS)} from public.saves
     where user_id = ${userId} and not is_template
     order by updated_at desc, created_at desc limit 1`;
  return row ?? null;
}

/**
 * The engine's generator takes a 32-bit seed. saves.rng_seed is 62 bits so the
 * database column can never collide across saves; the low 32 bits are what the
 * engine sees, and they are the same 32 bits every time this save is opened.
 */
export function rngSeed32(rngSeed: string): number {
  return Number(BigInt(rngSeed) & 0xffffffffn);
}

// One stream per purpose, so a week's games and its news never share draws
// and a change to one never moves the other. The same three formulas the
// in-memory host used, so a season plays the same on the server.
export const gameStream = (seed32: number, season: number, week: number): number =>
  seed32 + season * 1000 + week;
export const newsStream = (seed32: number, season: number, week: number): number =>
  seed32 + season * 1000 + week * 31;
export const offseasonStream = (seed32: number, season: number): number =>
  seed32 + season;
/** Who plays whom next year: its own stream, so a change to the offseason
 *  never reshuffles the calendar. */
export const scheduleStream = (seed32: number, season: number): number =>
  seed32 + season * 1000 + 999;
/** The end-of-year vote: its own stream, so a change to the offseason never
 *  moves a ballot that was already cast. */
export const awardStream = (seed32: number, season: number): number =>
  seed32 + season * 1000 + 997;
/** The coin that breaks a tie nothing else can: its own stream, so the same
 *  table seeds the same way however many times the save is opened. */
export const postseasonStream = (seed32: number, season: number): number =>
  seed32 + season * 1000 + 998;

/** How long the regular season is, read from its schedule rather than
 *  assumed. The playoff weeks that follow are not counted: they are written
 *  as the bracket unfolds, and the client is told them separately. */
export async function seasonWeeks(db: Db, saveId: string, season: number): Promise<number> {
  const [row] = await db<{ weeks: number | null }[]>`
    select max(week)::int as weeks from public.season_schedule
     where save_id = ${saveId} and season = ${season} and competition = 'REGULAR'`;
  if (row?.weeks === null || row?.weeks === undefined) {
    throw new Error(`Save ${saveId} has no schedule for season ${String(season)}`);
  }
  return row.weeks;
}

export async function touchSave(
  db: Db, saveId: string, fields: { season?: number; week?: number; phase?: string },
): Promise<void> {
  await db`
    update public.saves
       set season = coalesce(${fields.season ?? null}, season),
           week = coalesce(${fields.week ?? null}, week),
           phase = coalesce(${fields.phase ?? null}, phase)
     where id = ${saveId}`;
}
