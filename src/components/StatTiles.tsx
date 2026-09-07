// A row of headline numbers.
//
// Three across at 375px, which is the widest that keeps a five-character figure
// and its caption on one line each. Four would truncate; two would waste the
// row. The grid uses minmax(0, 1fr) so a long value shrinks its own tile rather
// than widening the page.

import { COLOR, FONT } from '../app/tokens';

export interface Stat {
  readonly label: string;
  /** Null renders as an explicit dash. A missing number is never shown as 0. */
  readonly value: string | null;
  readonly tone?: 'default' | 'accent' | 'positive' | 'negative';
}

const toneColor: Record<NonNullable<Stat['tone']>, string> = {
  default: COLOR.tx,
  accent: COLOR.amber,
  positive: COLOR.teal,
  negative: COLOR.red,
};

export function StatTiles({ stats }: { readonly stats: readonly Stat[] }) {
  const columns = Math.min(Math.max(stats.length, 1), 3);
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: 8,
      }}
    >
      {stats.map((stat) => (
        <div
          key={stat.label}
          style={{
            background: COLOR.panel, border: `1px solid ${COLOR.line}`,
            borderRadius: 3, padding: '10px 10px 11px', minWidth: 0,
          }}
        >
          <div
            style={{
              fontFamily: FONT.display, fontSize: 11, letterSpacing: '0.09em',
              textTransform: 'uppercase', color: COLOR.mut,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {stat.label}
          </div>
          <div
            className="numeric"
            style={{
              marginTop: 3, fontSize: 21, fontWeight: 600, lineHeight: 1.1,
              color: stat.value === null ? COLOR.dim : toneColor[stat.tone ?? 'default'],
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {stat.value ?? '—'}
          </div>
        </div>
      ))}
    </div>
  );
}
