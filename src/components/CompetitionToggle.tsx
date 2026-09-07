import { COLOR } from '../app/tokens';
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
        display: 'flex', gap: 2, padding: 2, borderRadius: 3,
        background: COLOR.panel, border: `1px solid ${COLOR.line}`,
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
              flex: 1, minHeight: 34, border: 0, borderRadius: 2, cursor: 'pointer',
              background: active ? COLOR.raise : 'transparent',
              color: active ? COLOR.tx : COLOR.mut,
              fontFamily: "'Barlow Condensed', system-ui, sans-serif",
              fontSize: 14, fontWeight: 600, letterSpacing: '0.04em',
            }}
          >
            {COMPETITION_LABEL[c]}
          </button>
        );
      })}
    </div>
  );
}
