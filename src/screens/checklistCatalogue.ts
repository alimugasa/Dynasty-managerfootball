// What the five checklist items are called, what each asks for, and what sits
// behind the ones that have nothing behind them yet.
//
// The keys and the marks are the server's (_shared/api/checklist.ts); this is
// the copy, on the side that renders it -- the same split the settings
// catalogue keeps, and a test asserts the two name the same five items.
//
// The `sheet` block is written for the item that has no screen. It is not an
// apology and not a roadmap: it says what that screen will show, in the words
// it will use, so a manager who taps it comes away knowing what the feature is
// rather than only that it is missing. A placeholder that says "coming soon"
// has wasted the tap.

import type { ChecklistItem } from '../../supabase/functions/_shared/api/checklist';

export interface ChecklistCopy {
  readonly key: ChecklistItem;
  readonly title: string;
  /** One sentence on why this is worth doing, in the imperative the row is
   *  written in. Never a restatement of the title. */
  readonly detail: string;
  /** What tapping it does when the destination exists. */
  readonly done?: string;
}

export const CHECKLIST_COPY: readonly ChecklistCopy[] = [
  {
    key: 'roster',
    title: 'Review the roster',
    detail: 'See who you inherited before you decide anything about them.',
  },
  {
    key: 'depth',
    title: 'Set the depth chart',
    detail: 'The order you set is the order that plays. Nothing else on this list '
      + 'changes a result by itself.',
    done: 'Reordered',
  },
  {
    key: 'cap',
    title: 'Check cap space',
    detail: 'What the club can still spend, and what it is already committed to.',
  },
  {
    key: 'opponent',
    title: 'View the opponent',
    detail: 'Who you open against, and what kind of afternoon it is likely to be.',
  },
  {
    key: 'sim',
    title: 'Play the game',
    detail: 'Everything above is preparation. This is the week.',
    done: 'Played',
  },
];

export const copyFor = (key: ChecklistItem): ChecklistCopy | undefined =>
  CHECKLIST_COPY.find((c) => c.key === key);

export interface SheetCopy {
  readonly title: string;
  readonly detail: string;
  /** Two or three paragraphs. Written as statements about the finished screen,
   *  in the present tense, because that is how it will read when it exists. */
  readonly body: readonly string[];
  /** What the manager can do about it today, where there is anything. */
  readonly action?: string;
}

/**
 * The screens the checklist points at that are not built.
 *
 * Roster and depth chart are absent from this map on purpose: both exist, so
 * both route, and a placeholder written for a screen that is already there
 * would be a lie of a different kind.
 */
export const CHECKLIST_SHEETS: Readonly<Partial<Record<ChecklistItem, SheetCopy>>> = {
  cap: {
    title: 'Cap and contracts',
    detail: 'The money side of the roster, on one screen.',
    body: [
      'It will list every contract the club is carrying: what each player is owed '
      + 'this year and in each year left on his deal, what is guaranteed, and what '
      + 'releasing him would leave behind on the books as dead money.',
      'It will show the ceiling, what is committed against it, what is still free, '
      + 'and what next year looks like if nothing changes — which is the number that '
      + 'actually decides whether a signing is possible.',
      'None of that is built. The cap sheet below is read from the save and is real; '
      + 'the contracts behind it are stored but nothing reads them back yet.',
    ],
    action: 'Open the Office',
  },
  opponent: {
    title: 'Opponent report',
    detail: 'A scouting report on the club you play next, before you play them.',
    body: [
      'It will carry their form, their injuries, the units they are strongest and '
      + 'thinnest in, and how the two rosters match up position by position.',
      'None of that is built yet. Their record and their rating, on the week card, '
      + 'are everything the game can honestly tell you about them today.',
    ],
  },
};
