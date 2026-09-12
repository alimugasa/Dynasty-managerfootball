import { COLOR, ELEV, FONT, MOTION, R } from '../app/tokens';
import { COMPETITIONS, COMPETITION_LABEL, type Competition } from '../domain/competition';

/** The REGULAR SEASON | PLAYOFFS control. ONE component, used identically on
 *  player stats, player grades, team stats, league grades and the record book.
 *  A second implementation of this anywhere is a defect. */
interface Props {
  value: Competition;
  onChange: (c: Competition) => void;
}

export function CompetitionToggle({ value, onChange }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Competition"
      style={{
        display: 'flex', gap: 2, padding: 3, borderRadius: R.md,
        // A sunken track: the selected half sits above it, which is what makes
        // a segmented control read as one control rather than two buttons.
        background: 'rgba(0,0,0,0.22)', border: `1px solid ${COLOR.line}`,
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.3)',
      }}
    >
      {COMPETITIONS.map((c) => {
        const active = c === value;
        return (
          <button
            key={c}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(c)}
            style={{
              flex: 1, minHeight: 34, border: 0, borderRadius: R.sm, cursor: 'pointer',
              background: active ? COLOR.raise : 'transparent',
              boxShadow: active ? ELEV.low : 'none',
              color: active ? COLOR.tx : COLOR.mut,
              fontFamily: FONT.display,
              fontSize: 14, fontWeight: 600, letterSpacing: '0.04em',
              transition: `background-color ${MOTION.fast} ${MOTION.ease}, color ${MOTION.fast} ${MOTION.ease}`,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {COMPETITION_LABEL[c]}
          </button>
        );
      })}
    </div>
  );
}
