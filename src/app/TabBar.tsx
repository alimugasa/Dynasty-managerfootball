// The bottom navigation.
//
// Five destinations, fixed to the bottom, sitting above the home indicator on a
// phone that has one. Tapping a tab calls replaceRoot, never push: per
// docs/NAVIGATION-CONTRACT.md, tapping Team from four levels deep inside League
// must not grow the stack forever.
//
// The five are the jobs a manager actually has, not the screens that happened
// to exist: the executive one, the football one, the weekly one, the world
// outside, and what is being said about it. Schedule and Roster used to sit
// here and were never destinations -- they are a list each, and they belong
// inside the tab whose job they are part of.
//
// Active state is carried by three signals at once -- amber tint, a filled icon,
// and the rule above the tab -- so it survives greyscale and colour-blindness
// rather than depending on the amber alone.

import { COLOR, FONT, LAYOUT, MOTION, tint } from './tokens';
import { useNavigator } from './navigation';
import {
  LeagueIcon, NewsIcon, OfficeIcon, PlayIcon, ShieldIcon,
} from '../components/icons';

export interface Tab {
  readonly key: string;
  readonly label: string;
  readonly Icon: typeof ShieldIcon;
  /** The one tab that moves the season on. Marked, not enlarged: a tab twice
   *  the size of its neighbours is a toy, and this bar sits under a game a
   *  person is meant to spend a decade in. */
  readonly primary?: true;
}

export const TABS: readonly Tab[] = [
  { key: 'office', label: 'Office', Icon: OfficeIcon },
  { key: 'team', label: 'Team', Icon: ShieldIcon },
  { key: 'play', label: 'Play', Icon: PlayIcon, primary: true },
  { key: 'league', label: 'League', Icon: LeagueIcon },
  { key: 'news', label: 'News', Icon: NewsIcon },
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
                  zIndex: 0,
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
                {/* The centre tab carries a faint amber disc behind its icon.
                    Enough to say "this is the one that advances the game",
                    and not enough to shout over the four beside it. */}
                {tab.primary === true && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: 'absolute', top: 8, left: '50%', marginLeft: -17,
                      width: 34, height: 34, borderRadius: '50%', zIndex: -1,
                      background: tint(COLOR.amber, isActive ? 0.16 : 0.07),
                      border: `1px solid ${tint(COLOR.amber, isActive ? 0.45 : 0.18)}`,
                      transition: `background-color ${MOTION.base} ${MOTION.ease}`,
                    }}
                  />
                )}
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
