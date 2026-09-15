// The deadline, on a screen that is not the Trade Center.
//
// One line, and only when it is close. A countdown that runs from week 1 is
// wallpaper and stops being read long before it starts mattering -- so this
// renders nothing at all until the deadline is within a few weeks, which is
// what makes it worth noticing when it appears.
//
// It is tappable, because a manager told the deadline is next week wants to do
// something about it and the thing to do is one screen away.

import { COLOR, R, S, TYPE, tint } from '../app/tokens';
import type { TradeDeadlineOut } from '../../supabase/functions/_shared/api/tradeDeadlineOut';

const TONE: Readonly<Record<string, string>> = {
  now: COLOR.red, soon: COLOR.amber, none: COLOR.mut, shut: COLOR.mut,
};

export function DeadlineBanner({ deadline, onOpen }: {
  readonly deadline: TradeDeadlineOut;
  readonly onOpen: () => void;
}) {
  const offers = deadline.incomingOffers;
  // Nothing to say: no countdown running and nobody waiting on an answer.
  if (deadline.notice === null && offers === 0) return null;

  const colour = offers > 0 ? COLOR.amber : TONE[deadline.urgency] ?? COLOR.mut;
  const line = offers > 0
    ? `${String(offers)} trade offer${offers === 1 ? '' : 's'} waiting`
    : deadline.notice ?? '';

  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="deadline-banner"
      style={{
        display: 'flex', alignItems: 'center', gap: S[3], width: '100%',
        minHeight: 48, padding: `${String(S[2])}px ${String(S[3])}px`,
        boxSizing: 'border-box', textAlign: 'left',
        background: tint(colour, 0.12),
        border: `1px solid ${tint(colour, 0.45)}`,
        borderRadius: R.sm, cursor: 'pointer', color: COLOR.tx,
      }}
    >
      <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 2 }}>
        <span style={{ ...TYPE.body, color: colour }}>{line}</span>
        {/* Both facts where both exist: an offer waiting is more urgent than
            the clock, and the clock is why it is urgent. */}
        {offers > 0 && deadline.notice !== null && (
          <span style={{ ...TYPE.micro, fontSize: 11, color: COLOR.mut }}>
            {deadline.notice}
          </span>
        )}
      </span>
      <span style={{ ...TYPE.micro, color: COLOR.mut, flexShrink: 0 }}>Trade Center</span>
    </button>
  );
}
