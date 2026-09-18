// What a screen shows while a read is in flight, and when it fails.
//
// Skeletons, never spinners, while loading. On failure the message is the
// server's, shown as is: a screen that rendered a plausible empty state over
// a failed read would be lying about the dynasty.

import { COLOR, ELEV, R, S, SIZE, TYPE, tint } from '../app/tokens';
import { useNavigationState, useNavigator } from '../app/navigation';
import { SkeletonRegion, SkeletonRows } from './Skeleton';
import { ActionButton } from './ActionButton';
import { EmptyState } from './Surface';

export function Loading({ label, rows = 5 }: { readonly label: string; readonly rows?: number }) {
  return (
    <SkeletonRegion label={label}>
      <SkeletonRows rows={rows} />
    </SkeletonRegion>
  );
}

/**
 * A failed read, with something to do about it.
 *
 * It used to be a red box and the server's message, which told a player what
 * broke and left them holding it. A dead end is not an error state; it is the
 * screen giving up in front of you. So there is always a way forward: Try
 * again when the caller can re-run the read, and Back whenever there is
 * somewhere to go back to.
 *
 * The message is still the server's, verbatim. A friendlier sentence written
 * here would be this screen guessing at what happened.
 */
export function QueryError({ error, onRetry }: {
  readonly error: Error;
  /** Re-runs the read. `useQuery` hands one back on every query. */
  readonly onRetry?: (() => void) | undefined;
}) {
  const nav = useNavigator();
  const { depth } = useNavigationState();
  const canGoBack = depth > 1;

  return (
    <div
      role="alert"
      data-testid="query-error"
      style={{
        padding: S[4], borderRadius: R.md, background: COLOR.panel,
        // Red edges it rather than filling it. A whole panel of red for a read
        // that can be retried is the wrong size of alarm.
        border: `1px solid ${tint(COLOR.red, 0.55)}`,
        boxShadow: ELEV.low,
        color: COLOR.tx, fontSize: SIZE.base, lineHeight: 1.5,
      }}
    >
      <p style={{ ...TYPE.micro, margin: 0, color: COLOR.red }}>Could not load</p>
      <p style={{ margin: `${String(S[2])}px 0 0`, fontWeight: 600 }}>
        This screen could not read the dynasty.
      </p>
      <p style={{ margin: `${String(S[1])}px 0 0`, color: COLOR.mut, fontSize: SIZE.md }}>
        {error.message}
      </p>
      {(onRetry !== undefined || canGoBack) && (
        <div style={{ display: 'flex', gap: S[2], marginTop: S[3], flexWrap: 'wrap' }}>
          {onRetry !== undefined && (
            <ActionButton onClick={onRetry} compact testId="query-retry">Try again</ActionButton>
          )}
          {canGoBack && (
            <ActionButton onClick={() => { nav.back(); }} tone="quiet" compact testId="query-back">
              Go back
            </ActionButton>
          )}
        </div>
      )}
    </div>
  );
}

/** No save is open. Distinct from a failed read: nothing is broken, there is
 *  simply nothing to look at until the player picks a save file. */
export function NoDynasty() {
  const nav = useNavigator();
  return (
    <>
      <EmptyState
        title="No dynasty open"
        detail="Start a new game or load a save file from the main menu."
      />
      <div style={{ maxWidth: 260, margin: '0 auto' }}>
        <ActionButton onClick={() => { nav.replaceRoot('home'); }} testId="to-menu">
          Main menu
        </ActionButton>
      </div>
    </>
  );
}
