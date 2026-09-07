// Club marks, generated rather than drawn.
//
// docs/IP-POLICY.md: identity is metro area plus an original nickname plus the
// two colours on the teams row, and marks are generated procedurally from those
// two colours and the abbreviation. Generated marks are acceptable; imitations
// of real marks are not. Building the badge in code rather than shipping art
// files is what keeps that true by construction.

import { COLOR, FONT } from '../app/tokens';

interface Props {
  readonly abbreviation: string;
  readonly primary: string;
  readonly secondary: string;
  readonly size?: number;
}

/**
 * The generated fill: a diagonal split of the two club colours.
 *
 * Exported as a plain function because it is the part worth testing, and
 * because jsdom's CSS parser discards gradients from an inline style -- an
 * assertion against the rendered attribute would be testing jsdom.
 */
export function markGradient(primary: string, secondary: string): string {
  return `linear-gradient(135deg, ${primary} 0%, ${primary} 52%, ${secondary} 52%, ${secondary} 100%)`;
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
        borderRadius: 4, overflow: 'hidden', position: 'relative',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        // Enough to be distinctive across thirty-two clubs without resembling
        // anyone's actual badge.
        background: markGradient(primary, secondary),
        border: `1px solid ${COLOR.line2}`,
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
      style={{ width: size, height: size, borderRadius: 4, display: 'inline-block', flexShrink: 0 }}
    />
  );
}
