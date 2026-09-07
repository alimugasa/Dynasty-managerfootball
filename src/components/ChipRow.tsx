// A horizontally scrolling row of filter chips.
//
// Marked .tscroll so it scrolls inside itself. A chip row is exactly the control
// that quietly widens a page past 375px: eight position filters do not fit, and
// the fix is to let the row scroll rather than to let the document scroll.

import { COLOR, FONT } from '../app/tokens';

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
                flexShrink: 0, minHeight: 32, padding: '0 12px', borderRadius: 999,
                cursor: 'pointer',
                background: active ? COLOR.amber : COLOR.panel,
                color: active ? COLOR.ink : COLOR.mut,
                border: `1px solid ${active ? COLOR.amber : COLOR.line}`,
                fontFamily: FONT.display, fontSize: 13, fontWeight: 600,
                letterSpacing: '0.05em', textTransform: 'uppercase',
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
