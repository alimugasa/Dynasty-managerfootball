// Shared screen scaffold: the app bar, the content column, and the space the
// bottom navigation occupies.
//
// The content column caps at 520px and centres on anything wider, so a desktop
// browser shows a composed narrow column rather than a phone layout stretched
// across a monitor.

import type { ReactNode } from 'react';
import { AppBar } from '../app/AppBar';
import { LAYOUT, S } from '../app/tokens';
import { DataBoundary } from '../components/DataBoundary';

interface Props {
  readonly title: string;
  readonly subtitle?: string;
  readonly trailing?: ReactNode;
  readonly screen: string;
  /** Drops the app bar. For the front door, which carries its own lockup and
   *  would otherwise print the product name twice. */
  readonly bare?: boolean;
  readonly children: ReactNode;
}

export function Screen({ title, subtitle, trailing, screen, bare = false, children }: Props) {
  return (
    <>
      {!bare && (
        <AppBar title={title} {...(subtitle === undefined ? {} : { subtitle })} trailing={trailing} />
      )}
      <main
        style={{
          maxWidth: LAYOUT.shellMax, margin: '0 auto', minWidth: 0,
          // A bare screen composes itself edge to edge -- the front door is a
          // full-bleed backdrop and a foot pinned to the bottom -- so the
          // scaffold gets out of its way entirely rather than adding padding it
          // would then have to subtract.
          ...(bare ? { padding: 0 } : {
            paddingTop: S[1],
            paddingInline: S[3],
            // Shell stops reserving the tab bar's height on the boot flow,
            // which is what leaves the home indicator to this padding.
            paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${String(S[5])}px)`,
          }),
        }}
      >
        <DataBoundary screen={screen}>{children}</DataBoundary>
      </main>
    </>
  );
}
