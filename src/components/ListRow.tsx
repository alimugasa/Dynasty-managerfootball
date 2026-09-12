// The workhorse row: a leading element, a title, a subtitle, and a trailing
// value.
//
// Minimum height is 52px and the tap target never drops below 44, which is the
// floor for a control someone uses with a thumb on a moving train. At 375px the
// title and subtitle truncate; nothing wraps into a second column and nothing
// pushes the row wider than the screen.
//
// A row that opens something says so three ways: a chevron, a highlight under
// the thumb, and the fact that it is a button. The chevron is deliberately
// faint -- on a list of fifty players, fifty bright arrows are fifty things
// competing with the names.

import { useState, type ReactNode } from 'react';
import { COLOR, MOTION, R, S, TYPE } from '../app/tokens';
import { ChevronRightIcon } from './icons';

interface Props {
  readonly leading?: ReactNode;
  /** Usually a string; a node when part of the line carries its own colour. */
  readonly title: ReactNode;
  readonly subtitle?: string;
  readonly trailing?: ReactNode;
  /** Shows a chevron, signalling that the row opens something. */
  readonly navigable?: boolean;
  readonly onSelect?: () => void;
}

export function ListRow({
  leading, title, subtitle, trailing, navigable = false, onSelect,
}: Props) {
  const [held, setHeld] = useState(false);

  const body = (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: S[3],
        minHeight: 52, padding: `${String(S[2])}px ${String(S[2])}px`,
        marginInline: -S[2],
        borderRadius: R.sm,
        background: held ? 'rgba(255,255,255,0.04)' : 'transparent',
        transition: `background-color ${MOTION.fast} ${MOTION.ease}`,
        minWidth: 0, width: `calc(100% + ${String(S[4])}px)`,
        boxSizing: 'border-box',
      }}
    >
      {leading}
      <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 2 }}>
        <span
          style={{
            ...TYPE.body, color: COLOR.tx,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {title}
        </span>
        {subtitle !== undefined && (
          <span
            style={{
              ...TYPE.micro, fontSize: 11.5, color: COLOR.mut,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {subtitle}
          </span>
        )}
      </span>
      {trailing}
      {navigable && (
        <span
          style={{
            color: held ? COLOR.mut : COLOR.dim, display: 'flex', flexShrink: 0,
            transition: `color ${MOTION.fast} ${MOTION.ease}`,
          }}
        >
          <ChevronRightIcon />
        </span>
      )}
    </div>
  );

  const shell = (inner: ReactNode) => (
    <div style={{ borderBottom: `1px solid ${COLOR.line}` }}>{inner}</div>
  );

  if (onSelect === undefined) return shell(body);
  return shell(
    <button
      type="button"
      onClick={onSelect}
      onPointerDown={() => { setHeld(true); }}
      onPointerUp={() => { setHeld(false); }}
      onPointerLeave={() => { setHeld(false); }}
      onPointerCancel={() => { setHeld(false); }}
      style={{
        display: 'block', width: '100%', background: 'none', border: 0,
        padding: 0, textAlign: 'left', cursor: 'pointer', minWidth: 0,
        WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
      }}
    >
      {body}
    </button>,
  );
}
