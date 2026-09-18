// Skeletons, not spinners.
//
// A spinner says "something is happening". A skeleton says "this is what is
// coming, and roughly how much of it", so the screen does not reflow into a
// different shape when the data lands. Each skeleton here mirrors the real
// component it stands in for, which is the only way that promise holds.
//
// Every skeleton is aria-hidden and sits inside a container marked
// aria-busy: a screen reader should hear "loading", not a description of
// twelve grey rectangles.

import type { ReactNode } from 'react';
import { COLOR } from '../app/tokens';

interface LineProps {
  readonly width?: number | string;
  readonly height?: number;
  readonly radius?: number;
}

export function SkeletonLine({ width = '100%', height = 12, radius = 3 }: LineProps) {
  return (
    <div
      className="skeleton"
      aria-hidden="true"
      style={{ width, height, borderRadius: radius, flexShrink: 0 }}
    />
  );
}

export function SkeletonCircle({ size = 44 }: { readonly size?: number }) {
  return (
    <div
      className="skeleton"
      aria-hidden="true"
      style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0 }}
    />
  );
}

export function SkeletonSquare({ size = 34, radius = 4 }: { readonly size?: number; readonly radius?: number }) {
  return (
    <div
      className="skeleton"
      aria-hidden="true"
      style={{ width: size, height: size, borderRadius: radius, flexShrink: 0 }}
    />
  );
}

/** Wraps a loading region. Announces once, rather than per placeholder. */
export function SkeletonRegion({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div aria-busy="true" aria-live="polite" aria-label={label} style={{ minWidth: 0 }}>
      {children}
    </div>
  );
}

/** Stand-in for a list of ListRow. Mirrors its 52px rhythm so the page does not
 *  jump height when the rows arrive. */
export function SkeletonRows({ rows = 6, lead = true }: { readonly rows?: number; readonly lead?: boolean }) {
  return (
    <div style={{ minWidth: 0 }}>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, minHeight: 52,
            padding: '8px 0', borderBottom: `1px solid ${COLOR.line}`, minWidth: 0,
          }}
        >
          {lead && <SkeletonSquare size={32} />}
          <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 6 }}>
            {/* Varying widths so a column of placeholders reads as text
                rather than as a barcode. */}
            <SkeletonLine width={`${58 + ((i * 13) % 30)}%`} height={11} />
            <SkeletonLine width={`${30 + ((i * 7) % 22)}%`} height={9} />
          </div>
          <SkeletonLine width={34} height={20} />
        </div>
      ))}
    </div>
  );
}

/** Stand-in for a StatTiles row. */
export function SkeletonTiles({ count = 3 }: { readonly count?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`, gap: 8 }}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          style={{
            background: COLOR.panel, border: `1px solid ${COLOR.line}`, borderRadius: 10,
            padding: 10, display: 'grid', gap: 8, minWidth: 0,
          }}
        >
          <SkeletonLine width="70%" height={8} />
          <SkeletonLine width="52%" height={18} />
        </div>
      ))}
    </div>
  );
}

/** Stand-in for a table. Lives inside a TableScroll like the real thing. */
export function SkeletonTable({ rows = 5, columns = 5 }: { readonly rows?: number; readonly columns?: number }) {
  return (
    <div style={{ minWidth: columns * 64, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {Array.from({ length: columns }, (_, c) => (
          <SkeletonLine key={c} width={c === 0 ? 96 : 48} height={9} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {Array.from({ length: columns }, (_, c) => (
            <SkeletonLine key={c} width={c === 0 ? 96 : 48} height={13} />
          ))}
        </div>
      ))}
    </div>
  );
}
