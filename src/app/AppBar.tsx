// The top bar: where you are, and the way back.
//
// Sticky rather than fixed, so it scrolls with a long roster on a short screen
// and does not eat vertical space that a phone cannot spare.

import type { ReactNode } from 'react';
import { COLOR, FONT, LAYOUT } from './tokens';
import { useNavigationState, useNavigator } from './navigation';
import { ChevronLeftIcon } from '../components/icons';

interface Props {
  readonly title: string;
  readonly subtitle?: string;
  readonly trailing?: ReactNode;
}

export function AppBar({ title, subtitle, trailing }: Props) {
  const nav = useNavigator();
  const { depth } = useNavigationState();
  const canGoBack = depth > 1;

  return (
    <header
      style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: COLOR.ink,
        borderBottom: `1px solid ${COLOR.line}`,
        paddingTop: 'env(safe-area-inset-top, 0px)',
        minWidth: 0,
      }}
    >
      <div
        style={{
          maxWidth: LAYOUT.shellMax, margin: '0 auto',
          display: 'flex', alignItems: 'center', gap: 6,
          minHeight: 52, padding: '0 12px', minWidth: 0,
        }}
      >
        {canGoBack && (
          <button
            type="button"
            onClick={() => nav.back()}
            aria-label="Back"
            style={{
              width: 40, height: 44, marginLeft: -10, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 0, color: COLOR.tx, cursor: 'pointer',
            }}
          >
            <ChevronLeftIcon />
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1
            style={{
              margin: 0,
              fontFamily: FONT.display, fontWeight: 600, fontSize: 20,
              letterSpacing: '0.06em', textTransform: 'uppercase', color: COLOR.tx,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {title}
          </h1>
          {subtitle !== undefined && (
            <p
              style={{
                margin: 0, fontSize: 12, color: COLOR.mut,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
        {trailing !== undefined && <div style={{ flexShrink: 0 }}>{trailing}</div>}
      </div>
    </header>
  );
}
