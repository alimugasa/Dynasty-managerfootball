// A bottom sheet: something to read, not something to answer.
//
// The Modal beside it is for decisions -- renaming a save, destroying one --
// and it is shaped like a decision: a centred card with a row of buttons and
// two ways out that mean different things. This is the other shape. It rises
// from the bottom edge, spans the full width, and has one way out, because
// everything in it is information.
//
// It exists for the checklist on the franchise dashboard. A row whose
// destination has not been built opens this and says what will live there,
// which is the honest answer; navigating to a screen that renders nothing, or
// quietly doing nothing at all, are the two dishonest ones.
//
// Escape closes it, the backdrop closes it, and focus moves into it on open
// and returns to whatever opened it on close -- the same discipline Modal.tsx
// keeps, for the same reason: a sheet a keyboard cannot leave is a trap.

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { COLOR, ELEV, MOTION, R, S, TYPE } from '../app/tokens';

interface Props {
  readonly title: string;
  /** One line under the title: what this is, not a restatement of the title. */
  readonly detail?: string;
  /** A short label in the corner -- "Not built yet" on a placeholder. */
  readonly badge?: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly testId?: string;
}

export function Sheet({ title, detail, badge, onClose, children, testId }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    (panel.current?.querySelector<HTMLElement>('button') ?? panel.current)?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, [onClose]);

  // Rendered into the body rather than where it was written: see the note in
  // Modal.tsx. A sheet nested inside the screen's opacity animation cannot
  // rise above the bottom navigation, whatever its z-index says.
  return createPortal((
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(6, 10, 14, 0.68)',
        backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        animation: `dmp-scrim-in ${MOTION.base} ${MOTION.ease} both`,
      }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        {...(testId === undefined ? {} : { 'data-testid': testId })}
        style={{
          width: '100%', maxWidth: 520, boxSizing: 'border-box',
          // Slides up from the edge it is attached to. A sheet that faded in
          // where it was going to sit never looked like it came from anywhere.
          animation: `dmp-sheet-in ${MOTION.base} ${MOTION.ease} both`,
          background: COLOR.raise,
          borderTop: `1px solid ${COLOR.line2}`,
          // Rounded at the top only: it is attached to the bottom of the
          // screen rather than floating above it, which is the whole
          // difference between a sheet and a dialog.
          borderRadius: `${String(R.lg)}px ${String(R.lg)}px 0 0`,
          boxShadow: ELEV.high,
          padding: `${String(S[2])}px ${String(S[4])}px ${String(S[4])}px`,
          paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${String(S[4])}px)`,
          outline: 'none',
        }}
      >
        {/* The grab handle. It does not drag -- a sheet that looked draggable
            and was not would be worse -- but it is the shape a phone user
            reads as "this came up from the bottom and goes back down". */}
        <div
          aria-hidden="true"
          style={{
            width: 36, height: 4, borderRadius: R.pill, background: COLOR.line2,
            margin: `0 auto ${String(S[3])}px`,
          }}
        />
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: S[2], minWidth: 0 }}>
          <h2 style={{ ...TYPE.heading, margin: 0, fontSize: 17, color: COLOR.tx, flex: 1, minWidth: 0 }}>
            {title}
          </h2>
          {badge !== undefined && (
            <span
              style={{
                ...TYPE.micro, fontSize: 10, color: COLOR.dim, flexShrink: 0,
                background: 'rgba(0,0,0,0.25)',
                border: `1px solid ${COLOR.line2}`,
                borderRadius: R.pill, padding: '3px 8px', whiteSpace: 'nowrap',
              }}
            >
              {badge}
            </span>
          )}
        </div>
        {detail !== undefined && (
          <p style={{ ...TYPE.prose, margin: `${String(S[2])}px 0 0`, color: COLOR.mut }}>
            {detail}
          </p>
        )}
        <div style={{ marginTop: S[4] }}>{children}</div>
      </div>
    </div>
  ), document.body);
}
