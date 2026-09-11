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

import { COLOR, FONT, LAYOUT, MOTION } from './tokens';
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
        // Translucent over a blur, so content scrolling under the bar reads as
        // continuing rather than being cut off by an opaque slab. The solid
        // colour behind it is the fallback where backdrop-filter is not
        // supported, which is why it is not simply transparent.
        background: 'rgba(18, 25, 32, 0.88)',
        backdropFilter: 'saturate(140%) blur(14px)',
        WebkitBackdropFilter: 'saturate(140%) blur(14px)',
        borderTop: `1px solid ${COLOR.line}`,
        boxShadow: '0 -8px 24px rgba(0,0,0,0.35)',
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
                  padding: 0, minWidth: 0, position: 'relative',
                  transition: `color ${MOTION.base} ${MOTION.ease}`,
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {/* The marker is a short bar centred over the icon rather than
                    a rule across the whole tab: it points at the destination
                    instead of underlining a column. */}
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute', top: 0, left: '50%',
                    width: isActive ? 22 : 0, height: 2,
                    marginLeft: isActive ? -11 : 0,
                    borderRadius: '0 0 2px 2px',
                    background: COLOR.amber,
                    boxShadow: isActive ? `0 0 12px ${COLOR.amber}` : 'none',
                    transition: `width ${MOTION.base} ${MOTION.ease}, margin-left ${MOTION.base} ${MOTION.ease}`,
                  }}
                />
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
