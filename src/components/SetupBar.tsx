// The bar along the foot of a setup screen: the way back, and the way on.
//
// Sticky rather than fixed, and inside the content column rather than across
// the viewport, so it sits where the shell's own bottom navigation would and
// never overlaps a wider layout. It carries the home indicator's safe area,
// because a Continue button under the bar on an iPhone is a Continue button
// nobody can press.
//
// A translucent blur over the page, matching the app bar at the top: the list
// scrolling under it reads as one surface passing behind another rather than
// text disappearing into a lid.

import { COLOR, LAYOUT, MOTION, S } from '../app/tokens';
import { ActionButton } from './ActionButton';

export function SetupBar({
  onBack, onContinue, backLabel = 'Back', continueLabel = 'Continue', disabled = false,
}: {
  readonly onBack: () => void;
  readonly onContinue: () => void;
  readonly backLabel?: string;
  readonly continueLabel?: string;
  readonly disabled?: boolean;
}) {
  return (
    <div
      style={{
        position: 'sticky', bottom: 0, zIndex: 20,
        marginTop: S[6],
        marginInline: `-${String(S[3])}px`,
        padding: `${String(S[3])}px ${String(S[3])}px`,
        paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${String(S[3])}px)`,
        background: 'rgba(15, 21, 27, 0.9)',
        backdropFilter: 'saturate(140%) blur(14px)',
        WebkitBackdropFilter: 'saturate(140%) blur(14px)',
        borderTop: `1px solid ${COLOR.line}`,
        transition: `opacity ${MOTION.fast} ${MOTION.ease}`,
        maxWidth: LAYOUT.shellMax, marginInlineStart: `-${String(S[3])}px`,
      }}
    >
      <div style={{ display: 'flex', gap: S[2], minWidth: 0 }}>
        <div style={{ flex: '0 0 auto' }}>
          <ActionButton tone="quiet" compact onClick={onBack} disabled={disabled} testId="setup-back">
            {backLabel}
          </ActionButton>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <ActionButton onClick={onContinue} disabled={disabled} testId="setup-continue">
            {continueLabel}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}
