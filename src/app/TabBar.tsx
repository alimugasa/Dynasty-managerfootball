// The bottom navigation.
//
// Five destinations, fixed to the bottom, sitting above the home indicator on a
// phone that has one. Tapping a tab calls replaceRoot, never push: per
// docs/NAVIGATION-CONTRACT.md, tapping Team from four levels deep inside League
// must not grow the stack forever.
//
// Active state is carried by three signals at once -- amber tint, a filled icon,
// and the rule above the tab -- so it survives greyscale and colour-blindness
// rather than depending on the amber alone.

import { COLOR, FONT, LAYOUT } from './tokens';
import { useNavigator } from './navigation';
import {
  CalendarIcon, LeagueIcon, OfficeIcon, RosterIcon, ShieldIcon,
} from '../components/icons';

export interface Tab {
  readonly key: string;
  readonly label: string;
  readonly Icon: typeof ShieldIcon;
}

export const TABS: readonly Tab[] = [
  { key: 'team', label: 'Team', Icon: ShieldIcon },
  { key: 'league', label: 'League', Icon: LeagueIcon },
  { key: 'schedule', label: 'Schedule', Icon: CalendarIcon },
  { key: 'roster', label: 'Roster', Icon: RosterIcon },
  { key: 'office', label: 'Office', Icon: OfficeIcon },
];

export function TabBar({ active }: { readonly active: string }) {
  const nav = useNavigator();
  return (
    <nav
      aria-label="Primary"
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 20,
        background: COLOR.panel,
        borderTop: `1px solid ${COLOR.line}`,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <ul
        style={{
          margin: '0 auto', padding: 0, listStyle: 'none',
          maxWidth: LAYOUT.shellMax,
          display: 'grid',
          // Equal columns that are allowed to shrink. At 320px each tab is 64px
          // wide and the label still fits on one line.
          gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))`,
        }}
      >
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          return (
            <li key={tab.key} style={{ minWidth: 0 }}>
              <button
                type="button"
                onClick={() => nav.replaceRoot(tab.key)}
                aria-current={isActive ? 'page' : undefined}
                style={{
                  width: '100%', height: LAYOUT.navHeight,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 3,
                  background: 'none', border: 0, cursor: 'pointer',
                  color: isActive ? COLOR.amber : COLOR.mut,
                  borderTop: `2px solid ${isActive ? COLOR.amber : 'transparent'}`,
                  padding: 0, minWidth: 0,
                }}
              >
                <tab.Icon size={21} active={isActive} />
                <span
                  style={{
                    fontFamily: FONT.display, fontSize: 11,
                    letterSpacing: '0.07em', textTransform: 'uppercase',
                    fontWeight: isActive ? 600 : 500,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    maxWidth: '100%',
                  }}
                >
                  {tab.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
