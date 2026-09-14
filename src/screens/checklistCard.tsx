// The onboarding checklist: five rows, three states, and one card that stops
// shouting once the season has started.
//
// The state of a row is two facts, not one. What the save records -- tapped,
// or finished -- and what the league's own rows say: a week that has been
// played completes "Play the game" whether or not anything was ever written
// beside it. Deriving the second rather than storing it is why the tick cannot
// drift from the football.
//
// Three states, and the middle one is the honest part. Only two of the five
// have an action behind them today, so the other three stop at "opened" and
// look different from the two that can actually be finished. A checklist that
// awarded a green tick for having looked at something would be measuring the
// wrong thing on its first screen.

import type { ReactNode } from 'react';
import { COLOR, ELEV, R, S, TYPE, tint } from '../app/tokens';
import { ChevronRightIcon } from '../components/icons';
import { DashCard } from './dashboardCards';
import type { ChecklistItem, ChecklistProgress } from '../../supabase/functions/_shared/api/checklist';

/** Pending, opened, finished. Pending is the absence of the other two. */
export type RowState = 'pending' | 'viewed' | 'done';

export function stateOf(
  progress: ChecklistProgress, item: ChecklistItem, finished: boolean,
): RowState {
  // The league's own rows win. A manager who played week one before touching
  // the list has finished that item, and nothing needed to be written down for
  // that to be true.
  if (finished || progress[item] === 'DONE') return 'done';
  return progress[item] === 'VIEWED' ? 'viewed' : 'pending';
}

/** How many of the five are finished, for the line on the collapsed card. */
export const doneCount = (states: readonly RowState[]): number =>
  states.filter((s) => s === 'done').length;

/**
 * The mark at the left of a row.
 *
 * Drawn rather than lettered, so the three read as a progression at a glance:
 * an empty ring, the same ring with a tick in it, and a filled disc. Each also
 * carries a word for a screen reader, because a circle that differs from
 * another circle only in fill is nothing at all to somebody listening.
 */
function Mark({ state }: { readonly state: RowState }) {
  const colour = state === 'done'
    ? COLOR.teal : state === 'viewed' ? COLOR.amber : COLOR.dim;
  const label = state === 'done' ? 'Done' : state === 'viewed' ? 'Opened' : 'Not started';
  return (
    <span
      role="img"
      aria-label={label}
      data-testid={`mark-${state}`}
      style={{
        width: 24, height: 24, flexShrink: 0, borderRadius: R.pill,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        // Filled for finished, outlined for opened, hollow for untouched.
        background: state === 'done' ? colour : state === 'viewed' ? tint(colour, 0.12) : 'transparent',
        border: `1.5px solid ${state === 'pending' ? COLOR.line2 : colour}`,
        color: state === 'done' ? COLOR.ink : colour,
      }}
    >
      {state !== 'pending' && (
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
          <path
            d="M2.5 6.2 4.8 8.5 9.5 3.8"
            fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}

export interface ChecklistRow {
  readonly key: ChecklistItem;
  readonly title: string;
  readonly detail: string;
  readonly state: RowState;
  readonly onSelect: () => void;
}

function Row({ row, last }: { readonly row: ChecklistRow; readonly last: boolean }) {
  return (
    <button
      type="button"
      onClick={row.onSelect}
      data-testid={`check-${row.key}`}
      data-state={row.state}
      style={{
        display: 'flex', alignItems: 'center', gap: S[3], width: '100%',
        minWidth: 0, boxSizing: 'border-box', textAlign: 'left',
        padding: `${String(S[3])}px 0`, background: 'none', border: 0,
        borderBottom: last ? 'none' : `1px solid ${COLOR.line}`,
        cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
      }}
    >
      <Mark state={row.state} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            ...TYPE.body, display: 'block',
            // A finished row steps back. It has had its turn.
            color: row.state === 'done' ? COLOR.mut : COLOR.tx,
          }}
        >
          {row.title}
        </span>
        <span style={{ ...TYPE.prose, display: 'block', color: COLOR.dim, fontSize: 11.5 }}>
          {row.detail}
        </span>
      </span>
      <span style={{ color: COLOR.dim, display: 'flex', flexShrink: 0 }}>
        <ChevronRightIcon />
      </span>
    </button>
  );
}

/** The count, as a bar. Two channels for one fact, so it survives greyscale. */
function Progress({ done, total }: { readonly done: number; readonly total: number }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        aria-hidden="true"
        style={{ height: 3, borderRadius: R.pill, background: COLOR.line, overflow: 'hidden' }}
      >
        <div
          data-testid="checklist-progress"
          style={{
            width: `${String((done / Math.max(1, total)) * 100)}%`, height: '100%',
            background: done === total ? COLOR.teal : COLOR.amber,
          }}
        />
      </div>
    </div>
  );
}

/**
 * Before the first game: the whole list, and the loudest thing under the week.
 *
 * After it: a small card carrying the count and only what is still outstanding.
 * A manager ten seasons in should not be looking at five ticked rows every
 * week, and hiding the finished ones is the difference between a checklist and
 * a monument to one.
 */
export function ChecklistCard({ rows, opening, note }: {
  readonly rows: readonly ChecklistRow[];
  /** True before the club has played a game this season. */
  readonly opening: boolean;
  /** One line under the rows. Omitted on the collapsed card, which has no room
   *  for an explanation nobody is reading for the tenth time. */
  readonly note?: ReactNode;
}) {
  const done = doneCount(rows.map((r) => r.state));
  const outstanding = rows.filter((r) => r.state !== 'done');
  const shown = opening ? rows : outstanding;

  const card = (
    <DashCard
      title={opening ? 'Before week 1' : 'Weekly prep'}
      testId="checklist"
      trailing={(
        <span
          className="numeric"
          data-testid="checklist-count"
          style={{ ...TYPE.micro, fontSize: 10, color: done === rows.length ? COLOR.teal : COLOR.mut }}
        >
          {String(done)}/{String(rows.length)}
        </span>
      )}
    >
      <Progress done={done} total={rows.length} />
      {shown.length === 0 ? (
        <p style={{ ...TYPE.prose, margin: `${String(S[3])}px 0 0`, color: COLOR.mut, fontSize: 12 }}>
          Everything on the list is done for this week.
        </p>
      ) : (
        <div style={{ marginTop: S[2], minWidth: 0 }}>
          {shown.map((row, i) => (
            <Row key={row.key} row={row} last={i === shown.length - 1} />
          ))}
        </div>
      )}
      {opening && note !== undefined && (
        <p style={{ ...TYPE.prose, margin: `${String(S[3])}px 0 0`, color: COLOR.dim, fontSize: 11 }}>
          {note}
        </p>
      )}
    </DashCard>
  );

  // Before the first game this is what the screen is for, so it is ringed and
  // lifted off the two cards above it. Afterwards it is furniture, and looking
  // like furniture is the point.
  if (!opening) return card;
  return (
    <div
      style={{
        borderRadius: R.md, boxShadow: ELEV.mid,
        outline: `1px solid ${tint(COLOR.amber, 0.3)}`,
        minWidth: 0,
      }}
    >
      {card}
    </div>
  );
}

