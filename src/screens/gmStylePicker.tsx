// One optional question: how this manager sees the job.
//
// Stacked cards rather than a horizontal scroller. Five options with a line of
// explanation each do not fit across a 320px phone, and a row that has to be
// swiped hides the last two behind an edge -- which is how a choice becomes a
// choice between the two you happened to see. Stacked, all five are there.
//
// Nothing in the simulation reads the answer yet. The screen says so rather
// than implying a strategy the season is about to reward.

import { COLOR, MOTION, R, S, TYPE, tint } from '../app/tokens';
import { CheckIcon } from '../components/icons';
import { GM_STYLES, type GmStyleKey } from './gmStyles';

function StyleCard({ label, detail, chosen, onChoose, testId }: {
  readonly label: string;
  readonly detail: string;
  readonly chosen: boolean;
  readonly onChoose: () => void;
  readonly testId: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={chosen}
      onClick={onChoose}
      data-testid={testId}
      style={{
        display: 'flex', alignItems: 'center', gap: S[3],
        width: '100%', minWidth: 0, textAlign: 'left',
        minHeight: 52, padding: `${String(S[2])}px ${String(S[3])}px`,
        borderRadius: R.md, cursor: 'pointer',
        background: chosen ? tint(COLOR.amber, 0.1) : 'rgba(0,0,0,0.16)',
        border: `1px solid ${chosen ? tint(COLOR.amber, 0.55) : COLOR.line}`,
        boxShadow: chosen ? `inset 0 0 0 1px ${tint(COLOR.amber, 0.18)}` : 'none',
        transition: `background ${MOTION.fast} ${MOTION.ease}, border-color ${MOTION.fast} ${MOTION.ease}`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            ...TYPE.body, display: 'block', color: chosen ? COLOR.amber : COLOR.tx,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
        <span style={{ ...TYPE.prose, display: 'block', color: COLOR.mut, fontSize: 12 }}>
          {detail}
        </span>
      </div>
      {/* The tick is the only thing that moves between states, so the chosen
          card is obvious at a glance rather than only under comparison. */}
      <span
        aria-hidden="true"
        style={{ flexShrink: 0, color: chosen ? COLOR.amber : 'transparent', display: 'flex' }}
      >
        <CheckIcon />
      </span>
    </button>
  );
}

export function GmStylePicker({ value, onChange }: {
  readonly value: GmStyleKey;
  readonly onChange: (next: GmStyleKey) => void;
}) {
  return (
    <div>
      <p style={{ ...TYPE.micro, margin: `0 0 ${String(S[2])}px`, color: COLOR.mut }}>
        GM Style · optional
      </p>
      <div
        role="radiogroup"
        aria-label="GM style"
        data-testid="gm-style"
        style={{ display: 'grid', gap: S[2] }}
      >
        {GM_STYLES.map((s) => (
          <StyleCard
            key={s.key}
            label={s.label}
            detail={s.detail}
            chosen={s.key === value}
            onChoose={() => { onChange(s.key); }}
            testId={`gm-style-${s.key.toLowerCase()}`}
          />
        ))}
      </div>
      {/* Said plainly, because the alternative is a player choosing Negotiator
          and spending a season wondering why nothing negotiates differently. */}
      <p style={{ ...TYPE.prose, margin: `${String(S[2])}px 2px 0`, color: COLOR.dim, fontSize: 12 }}>
        Kept on the save file. No effect on the simulation yet.
      </p>
    </div>
  );
}
