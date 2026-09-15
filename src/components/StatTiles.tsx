// A row of headline numbers.
//
// Three across at 375px, which is the widest that keeps a five-character figure
// and its caption on one line each. Four would truncate; two would waste the
// row. The grid uses minmax(0, 1fr) so a long value shrinks its own tile rather
// than widening the page.
//
// The figure leads and the label sits under it, which is the opposite of a form
// field and the right way round for a scoreboard: the eye lands on 302.0M and
// only then asks what it is. The figure steps down as it gets longer, because
// a truncated number is worse than a smaller one: "302.…" is not a salary cap.
// A tile may carry a `fill` -- a share of something, 0 to 1 -- and draws it as
// a hairline meter along the bottom edge, because a cap number means much more
// next to how much of it is spent.

import { COLOR, ELEV, R, S, TYPE, tint } from '../app/tokens';

export interface Stat {
  readonly label: string;
  /** Null renders as an explicit dash. A missing number is never shown as 0. */
  readonly value: string | null;
  readonly tone?: 'default' | 'accent' | 'positive' | 'negative';
  /** 0-1. Draws a meter under the figure; omit where there is no whole for
   *  this number to be a part of. */
  readonly fill?: number;
}

const toneColor: Record<NonNullable<Stat['tone']>, string> = {
  default: COLOR.tx,
  accent: COLOR.amber,
  positive: COLOR.teal,
  negative: COLOR.red,
};

/** The largest size this many characters fits in a third of a 375px row. */
function figureSize(text: string): number {
  if (text.length <= 4) return 26;
  if (text.length === 5) return 23;
  if (text.length === 6) return 20;
  return 17;
}

export function StatTiles({ stats }: { readonly stats: readonly Stat[] }) {
  const columns = Math.min(Math.max(stats.length, 1), 3);
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${String(columns)}, minmax(0, 1fr))`,
        gap: S[2],
      }}
    >
      {stats.map((stat) => {
        const colour = stat.value === null ? COLOR.dim : toneColor[stat.tone ?? 'default'];
        return (
          <div
            key={stat.label}
            style={{
              background: COLOR.panel,
              border: `1px solid ${COLOR.line}`,
              borderRadius: R.md,
              boxShadow: ELEV.low,
              padding: `${String(S[3])}px ${String(S[3])}px ${String(S[2])}px`,
              minWidth: 0,
              display: 'grid',
              gap: S[1],
              alignContent: 'start',
            }}
          >
            <div
              style={{
                ...TYPE.figure, fontSize: figureSize(stat.value ?? '—'), color: colour,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {stat.value ?? '—'}
            </div>
            <div
              style={{
                ...TYPE.micro, color: COLOR.mut,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {stat.label}
            </div>
            {stat.fill !== undefined && (
              // Amber, whatever the figure above it is coloured: a meter is a
              // marker, and amber is what this app marks with.
              <div
                aria-hidden="true"
                style={{
                  height: 3, borderRadius: 2, marginTop: S[1],
                  background: tint(COLOR.amber, 0.16), overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%', borderRadius: 2, background: COLOR.amber,
                    width: `${String(Math.round(Math.min(1, Math.max(0, stat.fill)) * 100))}%`,
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
