// The action button. The loop is driven by three of these, so they exist once.
//
// A button on a phone has to answer the press before the work does. The server
// takes a second to play a week; the button takes a tenth of a second to say it
// heard you, by dropping a pixel and dimming its own lift. Without that the
// whole app feels like it is thinking about whether to bother.
//
// The primary is the only amber fill in the product, which is what keeps amber
// meaning "this is the thing to press". Everything else is an outline.

import { useState, type ReactNode } from 'react';
import { COLOR, ELEV, FONT, MOTION, R, S } from '../app/tokens';

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
  const [held, setHeld] = useState(false);
  const primary = tone === 'primary';
  const down = held && !disabled;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onPointerDown={() => { setHeld(true); }}
      onPointerUp={() => { setHeld(false); }}
      onPointerLeave={() => { setHeld(false); }}
      onPointerCancel={() => { setHeld(false); }}
      {...(testId === undefined ? {} : { 'data-testid': testId })}
      style={{
        width: compact ? 'auto' : '100%',
        minHeight: compact ? 34 : 48,
        padding: compact ? `0 ${String(S[3])}px` : `0 ${String(S[4])}px`,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        // A full-width button is a grid or flex item, and such an item's
        // automatic minimum size is its content -- so a nowrap label longer
        // than the column pushes the button out past its own track and takes
        // the page's horizontal scroll with it. Labels here carry generated
        // names ("Season recap · Prospectors champions"), so the length is not
        // knowable in advance: the button gives up its automatic minimum and
        // ellipsizes instead. A compact button is sized to its label by
        // design and keeps both.
        ...(compact ? {} : {
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }),
        borderRadius: compact ? R.sm : R.md,
        cursor: disabled ? 'default' : 'pointer',
        border: primary ? '1px solid transparent' : `1px solid ${COLOR.line2}`,
        // A flat fill reads as a coloured rectangle; two stops of the same
        // amber read as a surface with a light on it.
        background: primary
          ? `linear-gradient(180deg, #F7BC52 0%, ${COLOR.amber} 55%, #DE9820 100%)`
          : down ? COLOR.raise : 'transparent',
        color: primary ? COLOR.ink : COLOR.tx,
        fontFamily: FONT.ui,
        fontSize: compact ? 13 : 15,
        fontWeight: 600,
        letterSpacing: 0.2,
        opacity: disabled ? 0.4 : 1,
        boxShadow: disabled || !primary ? 'none' : down ? ELEV.low : ELEV.mid,
        transform: down ? 'translateY(1px)' : 'none',
        transition: `transform ${MOTION.fast} ${MOTION.ease},`
          + ` box-shadow ${MOTION.fast} ${MOTION.ease},`
          + ` background-color ${MOTION.fast} ${MOTION.ease}`,
        // The label does not slide with the button; only the button moves.
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
      }}
    >
      {children}
    </button>
  );
}
