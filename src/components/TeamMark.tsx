// Club marks, generated rather than drawn.
//
// docs/IP-POLICY.md: identity is metro area plus an original nickname plus the
// two colours on the teams row, and marks are generated procedurally from those
// two colours and the abbreviation. Generated marks are acceptable; imitations
// of real marks are not. Building the badge in code rather than shipping art
// files is what keeps that true by construction.

import { ELEV, FONT } from '../app/tokens';

interface Props {
  readonly abbreviation: string;
  readonly primary: string;
  readonly secondary: string;
  readonly size?: number;
}

/**
 * The generated fill: a diagonal split of the two team colours.
 *
 * The split is a hair soft rather than a hard edge. A hard line between two
 * saturated colours aliases into a staircase at 28px, which is the size most
 * of these are drawn at; two per cent of blur costs nothing and is the
 * difference between a badge and a placeholder.
 *
 * Exported as a plain function because it is the part worth testing, and
 * because jsdom's CSS parser discards gradients from an inline style -- an
 * assertion against the rendered attribute would be testing jsdom.
 */
export function markGradient(primary: string, secondary: string): string {
  return `linear-gradient(135deg, ${primary} 0%, ${primary} 50%, ${secondary} 54%, ${secondary} 100%)`;
}

/** At most three characters, upper case. Longer abbreviations truncate rather
 *  than overflowing a fixed-size badge. */
export function markLabel(abbreviation: string): string {
  return abbreviation.slice(0, 3).toUpperCase();
}

export function TeamMark({ abbreviation, primary, secondary, size = 34 }: Props) {
  const label = markLabel(abbreviation);
  return (
    <span
      role="img"
      aria-label={label}
      style={{
        width: size, height: size, flexShrink: 0,
        // A squircle rather than a square: it reads as a crest at 28px and as
        // a tile at 64px, where a 4px radius reads as neither.
        borderRadius: Math.max(6, Math.round(size * 0.26)),
        overflow: 'hidden', position: 'relative',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        // Enough to be distinctive across thirty-two teams without resembling
        // anyone's actual badge.
        background: markGradient(primary, secondary),
        // The ring is the team's own colour darkened by the ink behind it
        // rather than a grey hairline, so a badge does not wear a border that
        // belongs to the app instead of to the team.
        boxShadow: `inset 0 0 0 1px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.22), ${ELEV.low}`,
      }}
    >
      <span
        style={{
          fontFamily: FONT.display, fontWeight: 700,
          fontSize: Math.round(size * 0.38), letterSpacing: '0.02em',
          color: '#FFFFFF',
          // The abbreviation has to stay legible over either half of the split,
          // whatever two colours a club happens to carry.
          textShadow: '0 1px 2px rgba(0,0,0,0.55)',
        }}
      >
        {label}
      </span>
    </span>
  );
}

/** Placeholder mark for a club whose colours have not loaded. */
export function TeamMarkSkeleton({ size = 34 }: { readonly size?: number }) {
  return (
    <span
      className="skeleton"
      aria-hidden="true"
      style={{
        width: size, height: size, display: 'inline-block', flexShrink: 0,
        // Matches the real mark, so a list does not change shape as it loads.
        borderRadius: Math.max(6, Math.round(size * 0.26)),
      }}
    />
  );
}
