// mark-news-read: the player has opened a story.
//
// The third write handler that takes its value from the client rather than
// from the engine, and it is allowed for the same reason rename-save and
// mark-checklist are: this is a fact about the person playing, not about the
// world. Nothing downstream reads it, no outcome turns on it, and the worst a
// forged id could do is clear an unread dot on the caller's own feed.
//
// `ownedSave` is what makes that true rather than merely likely: it resolves
// the save against this user's rows and throws otherwise, so a mark can only
// ever land on a story in a save the caller already owns (ARCHITECTURE.md:
// every handler filters by ctx.userId).
//
// The write is guarded by `read_at is null` rather than being unconditional,
// so re-opening a story does not move the time it was first read. Two taps in
// quick succession settle on the first one, which is the honest answer.

import { badRequest, type Handler } from './context.ts';
import { ownedSave } from './save.ts';
import { rawOf, requireString } from './parse.ts';

export interface MarkNewsReadIn {
  readonly saveId: string;
  /** A single story, or every unread one in the open season. */
  readonly newsId: number | 'all';
}

export interface MarkNewsReadOut {
  /** How many rows this call actually marked. Zero is a real answer: the
   *  story was already read, or the id belongs to another save. */
  readonly marked: number;
  /** What is left unread in the open season, counted after the write. */
  readonly unread: number;
}

function parseNewsId(value: unknown): number | 'all' {
  if (value === 'all') return 'all';
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw badRequest('newsId must be a positive integer, or "all"');
  }
  return value;
}

export const markNewsRead: Handler<MarkNewsReadIn, MarkNewsReadOut> = {
  auth: 'required',
  parse: (raw) => {
    const r = rawOf(raw);
    return { saveId: requireString(r, 'saveId'), newsId: parseNewsId(r['newsId']) };
  },
  run: async ({ sql, userId }, input) => {
    const s = await ownedSave(sql, userId, input.saveId);
    const marked = input.newsId === 'all'
      ? await sql<{ news_id: string }[]>`
          update public.news set read_at = now()
           where save_id = ${s.id} and season = ${s.season} and read_at is null
          returning news_id::text`
      : await sql<{ news_id: string }[]>`
          update public.news set read_at = now()
           where save_id = ${s.id} and news_id = ${input.newsId} and read_at is null
          returning news_id::text`;
    const [left] = await sql<{ n: string }[]>`
      select count(*)::text as n from public.news
       where save_id = ${s.id} and season = ${s.season} and read_at is null`;
    return { marked: marked.length, unread: Number(left?.n ?? 0) };
  },
};
