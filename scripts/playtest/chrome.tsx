// The play-test build's chrome: the column every screen sits in, and the bar
// along the bottom.
//
// Lifted out of App.tsx when that file reached the 400-line ceiling. Nothing
// here decides anything -- it is the frame and the bar, and both are handed
// what to draw.

import type { ReactNode } from 'react';
import { COLOR, FONT, LAYOUT } from '../../src/app/tokens';
import {
  CalendarIcon, LeagueIcon, OfficeIcon, RosterIcon, ShieldIcon,
} from '../../src/components/icons';

export const TABS = [
  { key: 'team', label: 'Team', Icon: ShieldIcon },
  { key: 'league', label: 'League', Icon: LeagueIcon },
  { key: 'schedule', label: 'Schedule', Icon: CalendarIcon },
  { key: 'roster', label: 'Roster', Icon: RosterIcon },
  { key: 'office', label: 'Office', Icon: OfficeIcon },
] as const;

/** The column, its sticky title, and whatever sits under it.
 *
 *  `onBack` is passed rather than derived: in a dynasty the arrow closes a
 *  drill-down, and in the boot flow it steps back through the save file, the
 *  name and the team. Two different questions, one frame. */
export function Frame({ title, subtitle, onBack, children, forNav }: {
  readonly title: string;
  readonly subtitle: string;
  readonly onBack: (() => void) | null;
  readonly children: ReactNode;
  readonly forNav: boolean;
}) {
  return (
    <div style={{ minHeight: '100%', display: 'flex', justifyContent: 'center' }}>
      <div
        style={{
          width: '100%', maxWidth: LAYOUT.shellMax, minWidth: 0,
          paddingLeft: 'env(safe-area-inset-left, 0px)',
          paddingRight: 'env(safe-area-inset-right, 0px)',
          paddingBottom: forNav
            ? `calc(${String(LAYOUT.navHeight)}px + env(safe-area-inset-bottom, 0px) + 16px)`
            : 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
        }}
      >
        <header
          style={{
            position: 'sticky', top: 0, zIndex: 10, background: COLOR.ink,
            borderBottom: `1px solid ${COLOR.line}`, padding: '14px 16px 10px',
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}
        >
          {onBack !== null && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back"
              style={{
                background: 'none', border: 'none', color: COLOR.amber, fontSize: 22,
                lineHeight: 1, padding: '2px 6px 0 0', cursor: 'pointer',
              }}
            >
              ‹
            </button>
          )}
          <div style={{ minWidth: 0 }}>
            <h1 style={{
              margin: 0, fontFamily: FONT.display, fontSize: 26, lineHeight: 1.05,
              letterSpacing: '0.02em', textTransform: 'uppercase', color: COLOR.tx,
            }}
            >
              {title}
            </h1>
            <p style={{ margin: '2px 0 0', color: COLOR.mut, fontSize: 12 }}>{subtitle}</p>
          </div>
        </header>
        {/* Keyed on the title so each screen fades in, the way the app's
            navigation does. base.css owns the animation. */}
        <main key={title} className="screen-in" style={{ padding: '10px 16px 0' }}>
          {children}
        </main>
      </div>
    </div>
  );
}

/** The five destinations, when a dynasty is open. */
export function TabBar({ tab, onTab }: {
  readonly tab: string;
  readonly onTab: (key: string) => void;
}) {
  return (
      <nav
        aria-label="Sections"
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 20,
          background: 'rgba(18, 25, 32, 0.88)',
          backdropFilter: 'saturate(140%) blur(14px)',
          WebkitBackdropFilter: 'saturate(140%) blur(14px)',
          borderTop: `1px solid ${COLOR.line}`,
          boxShadow: '0 -8px 24px rgba(0,0,0,0.35)',
          display: 'grid', gridTemplateColumns: `repeat(${String(TABS.length)}, minmax(0, 1fr))`,
          height: `calc(${String(LAYOUT.navHeight)}px + env(safe-area-inset-bottom, 0px))`,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {TABS.map(({ key, label, Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => { onTab(key); }}
              {...(active ? { 'aria-current': 'page' as const } : {})}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', minWidth: 0,
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 3, padding: 0,
                color: active ? COLOR.amber : COLOR.mut,
                position: 'relative',
              }}
            >
              {/* A short bar centred over the icon rather than a rule across
                  the whole tab: it points at the destination instead of
                  underlining a column. Matches src/app/TabBar.tsx. */}
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute', top: 0, left: '50%',
                  width: active ? 22 : 0, height: 2,
                  marginLeft: active ? -11 : 0,
                  borderRadius: '0 0 2px 2px',
                  background: COLOR.amber,
                  boxShadow: active ? `0 0 12px ${COLOR.amber}` : 'none',
                  transition: 'width 200ms cubic-bezier(0.2, 0.8, 0.2, 1),'
                    + ' margin-left 200ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                }}
              />
              <Icon size={20} active={active} />
              <span style={{ fontSize: 10, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {label}
              </span>
            </button>
          );
        })}
      </nav>
  );
}
