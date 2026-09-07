// What a screen shows while a read is in flight, and when it fails.
//
// Skeletons, never spinners, while loading. On failure the message is the
// server's, shown as is: a screen that rendered a plausible empty state over
// a failed read would be lying about the dynasty.

import { COLOR } from '../app/tokens';
import { SkeletonRegion, SkeletonRows } from './Skeleton';
import { EmptyState } from './Surface';

export function Loading({ label, rows = 5 }: { readonly label: string; readonly rows?: number }) {
  return (
    <SkeletonRegion label={label}>
      <SkeletonRows rows={rows} />
    </SkeletonRegion>
  );
}

export function QueryError({ error }: { readonly error: Error }) {
  return (
    <div
      role="alert"
      style={{
        padding: 14, borderRadius: 3, background: COLOR.panel,
        border: `1px solid ${COLOR.red}`, color: COLOR.tx, fontSize: 13, lineHeight: 1.5,
      }}
    >
      <p style={{ margin: 0, fontWeight: 600 }}>Could not read the dynasty</p>
      <p style={{ margin: '6px 0 0', color: COLOR.mut }}>{error.message}</p>
    </div>
  );
}

export function NoDynasty() {
  return (
    <EmptyState
      title="No dynasty yet"
      detail="Pick a club on the Team tab to start one."
    />
  );
}
