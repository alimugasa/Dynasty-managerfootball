// A segmented control: two to four choices, one of them taken.
//
// The chosen segment is filled rather than outlined, because unlike a chip row
// -- where several may be on and amber marks the one you tapped -- exactly one
// of these is true at all times, and an outline reads as "available" where a
// fill reads as "this is the state".
//
// It wraps rather than scrolls. Four labels as long as "Hidden Potential" do
// not fit across a 320px phone, and a control the player has to swipe hides
// options behind an edge -- which is how a choice becomes a choice between the
// two you happened to see.

import { COLOR, FONT, MOTION, R, S, tint } from '../app/tokens';

export interface Segment {
  readonly value: string;
  readonly label: string;
}

export function Segmented({
  segments, value, onChange, label, disabled = false, testId,
}: {
  readonly segments: readonly Segment[];
  readonly value: string;
  readonly onChange: (next: string) => void;
  /** Names the group for a screen reader; the segments name themselves. */
  readonly label: string;
  /** Locked by a difficulty preset. Still readable -- the player must be able
   *  to see what the preset chose -- but not answerable. */
  readonly disabled?: boolean;
  readonly testId?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      {...(testId === undefined ? {} : { 'data-testid': testId })}
      style={{
        display: 'flex', flexWrap: 'wrap', gap: 4,
        padding: 3, borderRadius: R.md,
        background: 'rgba(0,0,0,0.26)',
        border: `1px solid ${COLOR.line}`,
        opacity: disabled ? 0.55 : 1,
        minWidth: 0,
      }}
    >
      {segments.map((segment) => {
        const taken = segment.value === value;
        return (
          <button
            key={segment.value}
            type="button"
            role="radio"
            aria-checked={taken}
            disabled={disabled}
            onClick={() => { onChange(segment.value); }}
            data-testid={testId === undefined ? undefined : `${testId}-${segment.value.toLowerCase()}`}
            style={{
              flex: '1 1 auto', minWidth: 0,
              minHeight: 34, padding: `0 ${String(S[2])}px`,
              borderRadius: R.sm,
              cursor: disabled ? 'default' : 'pointer',
              background: taken ? tint(COLOR.amber, 0.16) : 'transparent',
              color: taken ? COLOR.amber : COLOR.mut,
              border: `1px solid ${taken ? tint(COLOR.amber, 0.5) : 'transparent'}`,
              fontFamily: FONT.display, fontSize: 12, fontWeight: 600,
              letterSpacing: '0.05em', textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              transition: `background-color ${MOTION.fast} ${MOTION.ease}, color ${MOTION.fast} ${MOTION.ease}`,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {segment.label}
          </button>
        );
      })}
    </div>
  );
}
