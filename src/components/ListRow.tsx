// The workhorse row: a leading mark, a title, a subtitle, and a trailing value.
//
// Minimum height is 52px and the tap target never drops below 44, which is the
// floor for a control someone uses with a thumb on a moving train. At 375px the
// title and subtitle truncate; nothing wraps into a second column and nothing
// pushes the row wider than the screen.

import type { ReactNode } from 'react';
import { COLOR, FONT } from '../app/tokens';
import { ChevronRightIcon } from './icons';

interface Props {
  readonly leading?: ReactNode;
  readonly title: string;
  readonly subtitle?: string;
  readonly trailing?: ReactNode;
  /** Shows a chevron, signalling that the row opens something. */
  readonly navigable?: boolean;
  readonly onSelect?: () => void;
}

export function ListRow({
  leading, title, subtitle, trailing, navigable = false, onSelect,
}: Props) {
  const body = (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        minHeight: 52, padding: '8px 0',
        borderBottom: `1px solid ${COLOR.line}`,
        minWidth: 0, width: '100%',
      }}
    >
      {leading}
      <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 2 }}>
        <span
          style={{
            fontSize: 14, fontWeight: 500, color: COLOR.tx,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {title}
        </span>
        {subtitle !== undefined && (
          <span
            style={{
              fontFamily: FONT.display, fontSize: 12, letterSpacing: '0.05em',
              color: COLOR.mut, textTransform: 'uppercase',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {subtitle}
          </span>
        )}
      </span>
      {trailing}
      {navigable && <span style={{ color: COLOR.dim, display: 'flex', flexShrink: 0 }}><ChevronRightIcon /></span>}
    </div>
  );

  if (onSelect === undefined) return body;
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        display: 'block', width: '100%', background: 'none', border: 0,
        padding: 0, textAlign: 'left', cursor: 'pointer', minWidth: 0,
      }}
    >
      {body}
    </button>
  );
}
