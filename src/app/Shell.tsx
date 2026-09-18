import { useEffect, type ReactNode } from 'react';
import { installOverflowGuard } from './overflowGuard';
import { LAYOUT } from './tokens';

/** Mobile-first shell. Baseline is a 390px phone; the content column caps at
 *  520px and centres on wider viewports rather than stretching, so desktop is a
 *  composed narrow column and not a broken phone layout. The page never scrolls
 *  horizontally at any width down to 320px. */
export function Shell({
  children, reserveNav = true,
}: {
  readonly children: ReactNode;
  /** Whether to leave room for the bottom navigation. False on the boot flow,
   *  which renders no tab bar -- reserving its height there put sixty dead
   *  pixels under the main menu and pushed its foot off the bottom. */
  readonly reserveNav?: boolean;
}) {
  useEffect(() => installOverflowGuard(), []);
  return (
    <div style={{ minHeight: '100%', display: 'flex', justifyContent: 'center' }}>
      <div
        style={{
          width: '100%',
          maxWidth: LAYOUT.shellMax,
          minWidth: 0,
          paddingLeft: 'env(safe-area-inset-left, 0px)',
          paddingRight: 'env(safe-area-inset-right, 0px)',
          paddingBottom: reserveNav
            ? `calc(${LAYOUT.navHeight}px + env(safe-area-inset-bottom, 0px))`
            : 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}
