// A rating, as a ring.
//
// Four of these sit in a row and the player reads them at a glance, so the
// number carries the value and the ring carries the judgement: how far round
// it goes is the rating, and its colour is the band. Two channels for one fact
// is deliberate -- the arc still reads in greyscale, and on a small screen the
// colour reads before the digits do.
//
// The bands are the server's (teamOutlook.ts). The screen does not decide what
// counts as elite; it decides what elite looks like.

import { COLOR, FONT, GRADE_RAMP, S, TYPE } from '../app/tokens';
import { SkeletonCircle, SkeletonLine } from '../components/Skeleton';
import type { RatingBand } from '../../supabase/functions/_shared/api/reads/teamOutlook';

/** The one green in the product, borrowed from the performance ramp rather
 *  than introduced here: tokens.css is the authority on hex values, and a
 *  fifth green invented for this screen would be a fifth green. */
const GREEN = GRADE_RAMP.find((s) => s.key === 'good')?.color ?? COLOR.teal;

/**
 * The tiers, descending: green at the top, teal just under it, the middle of
 * the league in plain text, amber for a room that is a problem, and red kept
 * for a real one.
 *
 * Restrained on purpose. Elite and weak are the only two that shout, and the
 * middle of the league is meant to look like the middle of the league -- a
 * scale where four fifths of the clubs are amber has stopped being a warning
 * and become a background.
 */
const BAND_COLOR: Readonly<Record<RatingBand, string>> = {
  elite: GREEN,
  strong: COLOR.teal,
  solid: COLOR.tx,
  developing: COLOR.amber,
  weak: COLOR.red,
};

export const bandColor = (band: RatingBand | null): string =>
  (band === null ? COLOR.dim : BAND_COLOR[band]);

export function RatingRing({ label, rating, band, size = 54 }: {
  readonly label: string;
  readonly rating: number | null;
  readonly band: RatingBand | null;
  readonly size?: number;
}) {
  const colour = bandColor(band);
  const stroke = 3.5;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  // Nothing drawn for a rating we do not have. An unmeasured club must not get
  // an empty ring that reads as a rating of zero.
  const filled = rating === null ? 0 : Math.max(0, Math.min(100, rating)) / 100;

  return (
    <div style={{ display: 'grid', justifyItems: 'center', gap: S[1], minWidth: 0 }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} aria-hidden="true" focusable="false">
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke={COLOR.line} strokeWidth={stroke}
          />
          {rating !== null && (
            <circle
              cx={size / 2} cy={size / 2} r={r}
              fill="none" stroke={colour} strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={`${String(circumference * filled)} ${String(circumference)}`}
              // Twelve o'clock, clockwise, which is the only way a dial reads.
              transform={`rotate(-90 ${String(size / 2)} ${String(size / 2)})`}
            />
          )}
        </svg>
        <span
          className="numeric"
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: FONT.display, fontSize: 20, fontWeight: 600,
            color: rating === null ? COLOR.dim : colour,
          }}
        >
          {rating === null ? '—' : Math.round(rating)}
        </span>
      </div>
      <span style={{ ...TYPE.micro, fontSize: 9.5, color: COLOR.mut, textAlign: 'center' }}>
        {label}
      </span>
    </div>
  );
}

/** The four ratings, in the order a scouting report reads them. */
export function RatingRow({ ratings }: {
  readonly ratings: readonly {
    readonly label: string;
    readonly rating: number | null;
    readonly band: RatingBand | null;
  }[];
}) {
  return (
    <div
      data-testid="rating-rings"
      style={{
        display: 'grid',
        // Four across where they fit and two by two where they do not, rather
        // than four squeezed to the point where the digits shrink.
        gridTemplateColumns: 'repeat(auto-fit, minmax(64px, 1fr))',
        gap: `${String(S[3])}px 6px`,
        minWidth: 0,
      }}
    >
      {ratings.map((r) => (
        <RatingRing key={r.label} label={r.label} rating={r.rating} band={r.band} />
      ))}
    </div>
  );
}

/** The ring's resting shape, for the moment before the board has answered. */
export function RatingRowSkeleton({ count = 4 }: { readonly count?: number }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(64px, 1fr))',
        gap: `${String(S[3])}px 6px`,
      }}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ display: 'grid', justifyItems: 'center', gap: S[1] }}>
          <SkeletonCircle size={54} />
          <SkeletonLine width={34} height={8} />
        </div>
      ))}
    </div>
  );
}
