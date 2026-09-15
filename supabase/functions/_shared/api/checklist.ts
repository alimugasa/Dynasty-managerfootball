// The dashboard checklist: what it can hold, and what it refuses.
//
// Five things a manager does before the opening game. The save records what
// has been opened and what has been finished; the screen decides how that
// looks. Keys and marks live here because this is the side that validates
// them -- the same split franchiseOptions.ts keeps.
//
// What is deliberately NOT here is anything the save can already answer.
// Whether a week has been played is a question game_results answers, so the
// Sim item is completed by the league's own rows rather than by a flag written
// beside them. Two records of one fact are two records free to disagree, and
// the one that is not the source of truth is the one that will be wrong.

/** The five, in the order the checklist runs. */
export const CHECKLIST_ITEMS = ['roster', 'depth', 'cap', 'opponent', 'sim'] as const;

export type ChecklistItem = (typeof CHECKLIST_ITEMS)[number];

/**
 * How far a manager has got with one item.
 *
 * Two marks, not three: "pending" is the absence of a mark rather than a value,
 * so a save that has never been tapped and a save whose marks were all removed
 * read the same, and nothing has to be written to record having done nothing.
 *
 * VIEWED means the manager opened it. DONE means they finished the thing it
 * asked for -- which only some of the five can even be finished, because only
 * some of them have an action behind them yet. An item with nowhere to act
 * stops at VIEWED and the screen says so rather than awarding a tick for
 * having looked.
 */
export const CHECKLIST_MARKS = ['VIEWED', 'DONE'] as const;

export type ChecklistMark = (typeof CHECKLIST_MARKS)[number];

export type ChecklistProgress = Partial<Record<ChecklistItem, ChecklistMark>>;

const isItem = (v: unknown): v is ChecklistItem =>
  typeof v === 'string' && (CHECKLIST_ITEMS as readonly string[]).includes(v);

const isMark = (v: unknown): v is ChecklistMark =>
  typeof v === 'string' && (CHECKLIST_MARKS as readonly string[]).includes(v);

export function parseItem(raw: unknown): ChecklistItem {
  if (!isItem(raw)) throw new Error(`"${String(raw)}" is not a checklist item`);
  return raw;
}

export function parseMark(raw: unknown): ChecklistMark {
  if (!isMark(raw)) throw new Error(`"${String(raw)}" is not a checklist mark`);
  return raw;
}

/**
 * Reads the stored document, or refuses it.
 *
 * Unlike the franchise settings, a partial document is correct here: a manager
 * who has opened two of the five has two marks, and demanding all five would
 * make the common case the invalid one. What is refused is an item or a mark
 * this build has never heard of -- that means the two sides have drifted, and
 * dropping it quietly hides the drift behind a save that looks fine.
 */
export function parseChecklist(raw: unknown): ChecklistProgress | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('a checklist must be an object');
  }
  const out: Record<string, ChecklistMark> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isItem(key)) throw new Error(`unknown checklist item "${key}"`);
    if (!isMark(value)) throw new Error(`"${String(value)}" is not a mark for "${key}"`);
    out[key] = value;
  }
  return out;
}

/**
 * One mark onto what is already there.
 *
 * Merged rather than replaced, so a client that knows about one item cannot
 * erase the other four, and never downgraded: tapping a finished item to look
 * at it again must not un-finish it. That is the whole of the write path's
 * business logic, and it is here rather than in the handler so both builds
 * apply it identically.
 */
export function markChecklist(
  held: ChecklistProgress, item: ChecklistItem, mark: ChecklistMark,
): ChecklistProgress {
  // Returned unchanged, and identically, when there is nothing to say: a
  // caller can then compare by reference to decide whether a write is worth
  // making, and re-opening a row costs neither a round trip nor a render.
  if (held[item] === 'DONE' || held[item] === mark) return held;
  return { ...held, [item]: mark };
}
