import { COLOR } from '../app/tokens';

/** ABILITY — a circular dial with an amber arc. A gauge; something that fills.
 *  Geometry, not colour, is what distinguishes this from a performance grade,
 *  so the distinction survives colour-blindness and greyscale.
 *
 *  `value` is genuinely null for a large share of engine-generated players.
 *  Null renders an explicit empty state. It never renders as zero: a zero
 *  would state something false. */
interface Props {
  value: number | null;
  size?: number;
  label?: string;
}

export function AbilityDial({ value, size = 44, label = 'Overall' }: Props) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value)) / 100;
  const unavailable = value === null;

  return (
    <div
      role="img"
      aria-label={unavailable ? `${label} unavailable` : `${label} ${value}`}
      style={{ width: size, height: size, position: 'relative', flex: '0 0 auto' }}
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={COLOR.line2} strokeWidth={3}
          strokeDasharray={unavailable ? '3 4' : undefined}
        />
        {!unavailable && (
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke={COLOR.amber} strokeWidth={3} strokeLinecap="round"
            strokeDasharray={`${c * pct} ${c}`}
          />
        )}
      </svg>
      <span
        style={{
          position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
          fontFamily: "'Barlow Condensed', system-ui, sans-serif",
          fontSize: size * 0.4, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
          color: unavailable ? COLOR.dim : COLOR.tx,
        }}
      >
        {unavailable ? '–' : Math.round(value)}
      </span>
    </div>
  );
}
