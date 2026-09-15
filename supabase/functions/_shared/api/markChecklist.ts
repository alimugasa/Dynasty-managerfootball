// mark-checklist: what the manager has opened, and what they have finished.
//
// The second write handler that takes a value from the client rather than from
// the engine, and it is allowed for the same reason rename-save is: this is a
// fact about the person playing, not about the world. Nothing downstream reads
// it, no outcome turns on it, and the worst a malicious value could do is tick
// the caller's own checklist -- which is why the validation refuses unknown
// items anyway, rather than trusting that.
//
// `ownedSave` is what makes it safe: it resolves the id against this user's
// saves and throws otherwise, so a mark can only ever land on a row the caller
// already owns (ARCHITECTURE.md: every handler filters by ctx.userId).
//
// Read-modify-write in one statement rather than two round trips: the merge is
// done in Postgres with `||`, so two taps in quick succession cannot lose one
// another the way a read, a merge in TypeScript and a write would.

import { badRequest, type Handler } from './context.ts';
import { ownedSave } from './save.ts';
import { rawOf, requireString } from './parse.ts';
import {
  markChecklist, parseChecklist, parseItem, parseMark,
  type ChecklistItem, type ChecklistMark, type ChecklistProgress,
} from './checklist.ts';

export interface MarkChecklistIn {
  readonly saveId: string;
  readonly item: ChecklistItem;
  readonly mark: ChecklistMark;
}

export interface MarkChecklistOut {
  readonly checklist: ChecklistProgress;
}

export const markChecklistItem: Handler<MarkChecklistIn, MarkChecklistOut> = {
  auth: 'required',
  parse: (raw) => {
    const r = rawOf(raw);
    const saveId = requireString(r, 'saveId');
    // Both checked here rather than in run(), so an item this build has never
    // heard of comes back as a 400 naming it rather than as a 500. A drifted
    // client should be told what it got wrong.
    try {
      return { saveId, item: parseItem(r['item']), mark: parseMark(r['mark']) };
    } catch (error) {
      throw badRequest(error instanceof Error ? error.message : String(error));
    }
  },
  run: async ({ sql, userId }, input) => {
    const s = await ownedSave(sql, userId, input.saveId);

    // A document this build cannot read is replaced rather than merged into.
    // It was written by a version that knew something this one does not, and
    // merging onto it would keep a key the constraint above just refused.
    let held: ChecklistProgress = {};
    try {
      held = parseChecklist(s.checklist) ?? {};
    } catch {
      held = {};
    }
    const next = markChecklist(held, input.item, input.mark);

    await sql`
      update public.saves
         set checklist = ${sql.json(next as Record<string, string>)}
       where id = ${s.id}`;
    return { checklist: next };
  },
};
