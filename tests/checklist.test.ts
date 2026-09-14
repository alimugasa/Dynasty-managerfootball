// What the checklist can hold, and what it refuses.
//
// Three rules carry the whole feature. A partial document is correct, because
// a manager who has opened two of five has two marks. An item or a mark this
// build has never heard of is refused rather than dropped, because dropping it
// hides a drift between the two catalogues behind a save that looks fine. And
// a finished item is never un-finished by looking at it again.

import { describe, expect, it } from 'vitest';
import {
  CHECKLIST_ITEMS, CHECKLIST_MARKS, markChecklist, parseChecklist, parseItem, parseMark,
} from '../supabase/functions/_shared/api/checklist';
import { CHECKLIST_COPY } from '../src/screens/checklistCatalogue';

describe('the checklist document', () => {
  it('reads a partial document, because a partial one is the normal one', () => {
    expect(parseChecklist({ roster: 'VIEWED' })).toEqual({ roster: 'VIEWED' });
    expect(parseChecklist({})).toEqual({});
  });

  it('treats a missing document and an empty one as the same fact', () => {
    // Null is a save from before the checklist existed. A manager who has
    // tapped nothing is in exactly that state, so both read as nothing.
    expect(parseChecklist(null)).toBeUndefined();
    expect(parseChecklist(undefined)).toBeUndefined();
  });

  it('refuses an item or a mark this build has never heard of', () => {
    expect(() => parseChecklist({ stadium: 'VIEWED' })).toThrow(/unknown checklist item/);
    expect(() => parseChecklist({ roster: 'SKIMMED' })).toThrow(/not a mark/);
    expect(() => parseItem('stadium')).toThrow(/not a checklist item/);
    expect(() => parseMark('MAYBE')).toThrow(/not a checklist mark/);
  });

  it('refuses anything that is not an object', () => {
    expect(() => parseChecklist(['roster'])).toThrow(/must be an object/);
    expect(() => parseChecklist('roster')).toThrow(/must be an object/);
  });
});

describe('marking an item', () => {
  it('merges rather than replaces, so one item cannot erase the other four', () => {
    const held = { roster: 'VIEWED', cap: 'VIEWED' } as const;
    expect(markChecklist(held, 'opponent', 'VIEWED')).toEqual({
      roster: 'VIEWED', cap: 'VIEWED', opponent: 'VIEWED',
    });
  });

  it('never un-finishes a finished item', () => {
    // Opening the depth chart again to look at it must not undo having set it.
    const held = { depth: 'DONE' } as const;
    expect(markChecklist(held, 'depth', 'VIEWED')).toEqual({ depth: 'DONE' });
    // And it returns the same object, so a caller can tell nothing changed
    // without comparing every key.
    expect(markChecklist(held, 'depth', 'VIEWED')).toBe(held);
  });

  it('promotes an opened item to finished', () => {
    expect(markChecklist({ depth: 'VIEWED' }, 'depth', 'DONE')).toEqual({ depth: 'DONE' });
  });

  it('says nothing changed when a row is opened twice', () => {
    // The same object back, so the caller can skip the round trip. Re-opening
    // a row a manager is checking should not cost a write every time.
    const held = { cap: 'VIEWED' } as const;
    expect(markChecklist(held, 'cap', 'VIEWED')).toBe(held);
  });
});

describe('the two catalogues', () => {
  it('name the same five items, in the same order', () => {
    // The server owns the keys and the screen owns the words. A test rather
    // than a comment, because the two files are edited months apart.
    expect(CHECKLIST_COPY.map((c) => c.key)).toEqual([...CHECKLIST_ITEMS]);
  });

  it('give every item a title and a reason to do it', () => {
    for (const item of CHECKLIST_COPY) {
      expect(item.title.length, item.key).toBeGreaterThan(0);
      expect(item.detail.length, item.key).toBeGreaterThan(20);
      // The detail is a reason, not the title said twice.
      expect(item.detail).not.toBe(item.title);
    }
  });

  it('has exactly two marks, because pending is the absence of one', () => {
    expect([...CHECKLIST_MARKS]).toEqual(['VIEWED', 'DONE']);
  });
});
