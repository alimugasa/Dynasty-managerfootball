// A horizontally scrolling row of filter chips.
//
// Marked .tscroll so it scrolls inside itself. A chip row is exactly the control
// that quietly widens a page past 375px: eight position filters do not fit, and
// the fix is to let the row scroll rather than to let the document scroll.

import { COLOR, FONT, MOTION, R, S, tint } from '../app/tokens';

export interface Chip {
  readonly key: string;
  readonly label: string;
}

interface Props {
  readonly chips: readonly Chip[];
  readonly value: string;
  readonly onChange: (key: string) => void;
  readonly label: string;
}

export function ChipRow({ chips, value, onChange, label }: Props) {
  return (
    <div
      className="tscroll"
      role="tablist"
      aria-label={label}
      style={{
        overflowX: 'auto', overflowY: 'hidden', maxWidth: '100%',
        WebkitOverflowScrolling: 'touch',
        // The scrollbar is noise on a control this short.
        scrollbarWidth: 'none',
      }}
    >
      <div style={{ display: 'flex', gap: 6, paddingBottom: 2, width: 'max-content' }}>
        {chips.map((chip) => {
          const active = chip.key === value;
          return (
            <button
              key={chip.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(chip.key)}
              style={{
                flexShrink: 0, minHeight: 32, padding: `0 ${String(S[3])}px`,
                borderRadius: R.pill, cursor: 'pointer',
                // Marked with amber, not filled with it: the primary action
                // button is the one amber fill in the product, and a row of
                // filled chips would take that meaning away from it.
                background: active ? tint(COLOR.amber, 0.14) : COLOR.panel,
                color: active ? COLOR.amber : COLOR.mut,
                border: `1px solid ${active ? tint(COLOR.amber, 0.55) : COLOR.line}`,
                fontFamily: FONT.display, fontSize: 13, fontWeight: 600,
                letterSpacing: '0.05em', textTransform: 'uppercase',
                transition: `background-color ${MOTION.fast} ${MOTION.ease}, color ${MOTION.fast} ${MOTION.ease}`,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {chip.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
