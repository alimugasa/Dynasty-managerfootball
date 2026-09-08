// The action button. The loop is driven by three of these, so they exist once.

import type { ReactNode } from 'react';
import { COLOR, FONT } from '../app/tokens';

interface Props {
  readonly children: ReactNode;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly tone?: 'primary' | 'quiet';
  /** A row action rather than a page action: sized to its label, so the row
   *  it sits in still shows the player it is about. */
  readonly compact?: boolean;
  readonly testId?: string;
}

export function ActionButton({
  children, onClick, disabled = false, tone = 'primary', compact = false, testId,
}: Props) {
  const primary = tone === 'primary';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      {...(testId === undefined ? {} : { 'data-testid': testId })}
      style={{
        width: compact ? 'auto' : '100%',
        minHeight: compact ? 34 : 46,
        padding: compact ? '0 12px' : 0,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        borderRadius: compact ? 8 : 10,
        cursor: disabled ? 'default' : 'pointer',
        border: `1px solid ${primary ? COLOR.amber : COLOR.line2}`,
        background: primary ? COLOR.amber : 'transparent',
        color: primary ? COLOR.ink : COLOR.tx,
        fontFamily: FONT.ui, fontSize: compact ? 13 : 15, fontWeight: 600, letterSpacing: 0.2,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  );
}
