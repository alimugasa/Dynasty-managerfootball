// A modal: the screen keeps working behind it, but nothing else is the point
// until it is answered.
//
// Used twice, by the two things you can do to a save file that are not opening
// it -- renaming it, and destroying it. Both deserve a moment where the file in
// question is named on screen and the answer is a deliberate tap, which is the
// whole argument for a dialog over an inline row of buttons.
//
// Escape closes it, the backdrop closes it, and focus moves into it on open and
// returns to whatever opened it on close. A dialog a keyboard cannot leave is a
// trap, and one that never took focus was never really open.

import { useEffect, useRef, type ReactNode } from 'react';
import { COLOR, ELEV, MOTION, R, S, TYPE } from '../app/tokens';

interface Props {
  readonly title: string;
  /** One sentence under the title. The consequence, not a restatement. */
  readonly detail?: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  /** The buttons. Laid out by the caller, because "Cancel / Delete" and
   *  "Cancel / Save" want different emphasis. */
  readonly actions: ReactNode;
  readonly testId?: string;
}

export function Modal({ title, detail, onClose, children, actions, testId }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    // The first thing inside -- a text field where there is one, otherwise the
    // panel itself, so a screen reader lands on the title rather than on the
    // page behind the dialog.
    const first = panel.current?.querySelector<HTMLElement>('input, button');
    (first ?? panel.current)?.focus();

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, [onClose]);

  return (
    <div
      // The backdrop. Dark enough to take the screen behind it out of the
      // conversation, translucent enough to keep the context.
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(6, 10, 14, 0.68)',
        backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: S[3],
        paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${String(S[3])}px)`,
        animation: `dmp-screen-in ${MOTION.base} ${MOTION.ease} both`,
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
          // Sheet on a phone, card on anything wider: it rises from the thumb
          // rather than landing in the middle of the screen.
          width: '100%', maxWidth: 420, boxSizing: 'border-box',
          background: COLOR.raise,
          border: `1px solid ${COLOR.line2}`,
          borderRadius: R.lg,
          boxShadow: ELEV.high,
          padding: S[4],
          outline: 'none',
        }}
      >
        <h2 style={{ ...TYPE.heading, margin: 0, fontSize: 17, color: COLOR.tx }}>{title}</h2>
        {detail !== undefined && (
          <p style={{ ...TYPE.prose, margin: `${String(S[2])}px 0 0`, color: COLOR.mut }}>
            {detail}
          </p>
        )}
        <div style={{ marginTop: S[4] }}>{children}</div>
        <div
          style={{
            display: 'flex', gap: S[2], justifyContent: 'flex-end',
            marginTop: S[5], flexWrap: 'wrap',
          }}
        >
          {actions}
        </div>
      </div>
    </div>
  );
}
