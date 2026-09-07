// Shared screen scaffold: the app bar, the content column, and the space the
// bottom navigation occupies.
//
// The content column caps at 520px and centres on anything wider, so a desktop
// browser shows a composed narrow column rather than a phone layout stretched
// across a monitor.

import type { ReactNode } from 'react';
import { AppBar } from '../app/AppBar';
import { LAYOUT } from '../app/tokens';
import { DataBoundary } from '../components/DataBoundary';

interface Props {
  readonly title: string;
  readonly subtitle?: string;
  readonly trailing?: ReactNode;
  readonly screen: string;
  readonly children: ReactNode;
}

export function Screen({ title, subtitle, trailing, screen, children }: Props) {
  return (
    <>
      <AppBar title={title} {...(subtitle === undefined ? {} : { subtitle })} trailing={trailing} />
      <main
        style={{
          maxWidth: LAYOUT.shellMax, margin: '0 auto',
          padding: '4px 12px 18px', minWidth: 0,
        }}
      >
        <DataBoundary screen={screen}>{children}</DataBoundary>
      </main>
    </>
  );
}
