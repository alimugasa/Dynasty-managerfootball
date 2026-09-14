// The furniture of a hub tab.
//
// Each of the five tabs is a desk with things on it rather than a single list,
// so each one is a stack of cards: some open a screen that exists, some carry
// a figure, and some say plainly that the thing they name has not been built.
//
// That last kind is the one worth being careful about. A placeholder that looks
// like a feature is worse than an empty tab, because a player taps it, nothing
// happens, and now they distrust the four cards beside it that do work. So a
// NotBuilt card never looks tappable, never invents a number, and says what
// will live there in the same words the finished thing will use.

import type { ReactNode } from 'react';
import { COLOR, ELEV, FONT, MOTION, R, S, TYPE, tint } from '../app/tokens';
import { ChevronRightIcon } from '../components/icons';

/** A tappable card: a title, a line about it, and somewhere to go. */
export function HubCard({ title, detail, trailing, onSelect, testId }: {
  readonly title: string;
  readonly detail: string;
  /** A figure that belongs to this card, where there is one worth carrying. */
  readonly trailing?: ReactNode;
  readonly onSelect: () => void;
  readonly testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={testId}
      style={{
        display: 'flex', alignItems: 'center', gap: S[3],
        width: '100%', minWidth: 0, boxSizing: 'border-box', textAlign: 'left',
        padding: `${String(S[3])}px ${String(S[4])}px`,
        background: COLOR.panel,
        border: `1px solid ${COLOR.line}`,
        borderRadius: R.md,
        boxShadow: ELEV.low,
        cursor: 'pointer',
        transition: `border-color ${MOTION.fast} ${MOTION.ease}`,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ ...TYPE.body, display: 'block', color: COLOR.tx }}>{title}</span>
        <span
          style={{ ...TYPE.prose, display: 'block', color: COLOR.mut, fontSize: 11.5 }}
        >
          {detail}
        </span>
      </span>
      {trailing !== undefined && <span style={{ flexShrink: 0 }}>{trailing}</span>}
      <span style={{ color: COLOR.dim, display: 'flex', flexShrink: 0 }}>
        <ChevronRightIcon />
      </span>
    </button>
  );
}

/** A figure to sit on the right of a HubCard. */
export function CardFigure({ value, tone = 'default' }: {
  readonly value: string;
  readonly tone?: 'default' | 'accent' | 'muted';
}) {
  return (
    <span
      className="numeric"
      style={{
        fontFamily: FONT.display, fontSize: 17, fontWeight: 600, lineHeight: 1,
        color: tone === 'accent' ? COLOR.amber : tone === 'muted' ? COLOR.dim : COLOR.tx,
      }}
    >
      {value}
    </span>
  );
}

/**
 * A part of this tab's job that the game does not do yet.
 *
 * Deliberately not a button and deliberately not styled like the cards above
 * it: dashed rather than filled, dimmed, and labelled. A player should be able
 * to tell at a glance which half of a tab is real, and never be the one who
 * finds out by tapping.
 */
export function NotBuilt({ title, detail, testId }: {
  readonly title: string;
  /** What will be here, in the words the finished thing will use. */
  readonly detail: string;
  readonly testId: string;
}) {
  return (
    <div
      data-testid={testId}
      style={{
        padding: `${String(S[3])}px ${String(S[4])}px`,
        border: `1px dashed ${COLOR.line2}`,
        borderRadius: R.md,
        background: 'rgba(0,0,0,0.14)',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: S[2], minWidth: 0 }}>
        <span style={{ ...TYPE.body, color: COLOR.mut, flex: 1, minWidth: 0 }}>{title}</span>
        <span
          style={{
            ...TYPE.micro, fontSize: 9, color: COLOR.dim, flexShrink: 0,
            background: 'rgba(0,0,0,0.25)',
            border: `1px solid ${tint(COLOR.line2, 0.8)}`,
            borderRadius: R.pill, padding: '2px 7px', whiteSpace: 'nowrap',
          }}
        >
          Not built yet
        </span>
      </div>
      <p style={{ ...TYPE.prose, margin: `${String(S[1])}px 0 0`, color: COLOR.dim, fontSize: 11.5 }}>
        {detail}
      </p>
    </div>
  );
}

/** The stack a hub tab lays its cards out in. */
export function HubStack({ children }: { readonly children: ReactNode }) {
  return <div style={{ display: 'grid', gap: S[2], minWidth: 0 }}>{children}</div>;
}
