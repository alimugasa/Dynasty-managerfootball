// The front door, as a component with no idea where it is.
//
// It lives here rather than inside HomeScreen because the play-test rig opens
// on the same door, and two copies of a title screen drift -- the rig spent a
// while opening straight onto a team list while the app had this, which is
// exactly the drift.
//
// The screen is read top to bottom and is composed that way: an empty top, the
// name in the middle with the one thing you came to do under it, and the
// housekeeping along the foot where it belongs. Nothing in the middle competes
// with the two buttons, and nothing at the foot competes with the middle.
//
// The backdrop is drawn rather than shipped as art: yard lines in white at
// three per cent, and a warm pool of light behind the name where the stands
// would be. Nothing here is a photograph of anywhere real and nothing here is
// a mark belonging to anyone (docs/IP-POLICY.md), but it says "football at
// night" before a word is read, which is the whole job of a title screen.

import { useState, type ReactNode } from 'react';
import { COLOR, ELEV, FONT, MOTION, R, S, TYPE, tint } from '../app/tokens';
import { VERSION_LABEL } from '../app/version';
import { CreditsIcon, DatabaseIcon, SettingsIcon } from '../components/icons';

/** The field, at the alpha where it is texture rather than pattern. */
const FIELD = [
  // The light first, so it sits over the lines rather than under them.
  `radial-gradient(88% 46% at 50% 38%, ${tint(COLOR.amber, 0.1)} 0%, transparent 70%)`,
  // Yard lines only. Cross them with hash marks and the backdrop stops being a
  // field and becomes graph paper.
  'repeating-linear-gradient(90deg,'
    + ' transparent 0 43px, rgba(255,255,255,0.032) 43px 44px)',
  // The lines run out at both ends rather than stopping at an edge.
  `linear-gradient(180deg, ${COLOR.ink} 0%, transparent 18% 74%, ${COLOR.ink} 96%)`,
].join(', ');

export type DoorDestination = 'settings' | 'dbtools' | 'credits';

interface Props {
  readonly onNew: () => void;
  readonly onLoad: () => void;
  /** Settings, database tools, credits. Every one of them goes somewhere. */
  readonly onUtility: (to: DoorDestination) => void;
  readonly disabled?: boolean;
  /** Something that went wrong before the player got here -- a save that could
   *  not be reopened. Shown above the buttons rather than on a game screen
   *  with nothing behind it. */
  readonly notice?: ReactNode;
}

/**
 * The two doors, sized like the decision they are.
 *
 * 58px rather than the app's 48: this is the only screen where a button is the
 * entire point, and on a phone held one-handed the thumb should not have to
 * aim. The primary is a gold fill with a three-stop gradient and a lifted
 * shadow; the secondary is a dark card with a blue-grey hairline. One is
 * obviously the thing to press and the other is obviously still a door, which
 * is the whole hierarchy this screen needs.
 */
function DoorButton({
  children, onClick, tone, disabled = false, testId,
}: {
  readonly children: ReactNode;
  readonly onClick: () => void;
  readonly tone: 'primary' | 'secondary';
  readonly disabled?: boolean;
  readonly testId: string;
}) {
  const [held, setHeld] = useState(false);
  const [hover, setHover] = useState(false);
  const primary = tone === 'primary';
  const down = held && !disabled;
  const lit = hover && !disabled;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      onPointerDown={() => { setHeld(true); }}
      onPointerUp={() => { setHeld(false); }}
      onPointerEnter={() => { setHover(true); }}
      onPointerLeave={() => { setHeld(false); setHover(false); }}
      onPointerCancel={() => { setHeld(false); }}
      style={{
        width: '100%', minHeight: 58,
        borderRadius: R.lg,
        cursor: disabled ? 'default' : 'pointer',
        border: primary
          ? '1px solid transparent'
          : `1px solid ${lit ? COLOR.mut : COLOR.line2}`,
        background: primary
          ? `linear-gradient(180deg, #F9C263 0%, ${COLOR.amber} 52%, #DB9420 100%)`
          : down || lit ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
        color: primary ? COLOR.ink : COLOR.tx,
        fontFamily: FONT.display,
        fontSize: 18, fontWeight: 700,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        opacity: disabled ? 0.4 : 1,
        boxShadow: disabled ? 'none'
          : primary
            ? down
              ? `${ELEV.low}, 0 0 0 1px ${tint(COLOR.amber, 0.35)}`
              : `0 10px 26px ${tint(COLOR.amber, 0.22)}, ${ELEV.mid}`
            : down || lit ? ELEV.low : 'none',
        transform: down ? 'translateY(1px)' : 'none',
        transition: `transform ${MOTION.fast} ${MOTION.ease},`
          + ` box-shadow ${MOTION.base} ${MOTION.ease},`
          + ` background-color ${MOTION.base} ${MOTION.ease},`
          + ` border-color ${MOTION.base} ${MOTION.ease}`,
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
      }}
    >
      {children}
    </button>
  );
}

/** One of the three quiet actions along the foot. */
function Utility({
  label, icon, onClick, testId,
}: {
  readonly label: string;
  readonly icon: ReactNode;
  readonly onClick: () => void;
  readonly testId: string;
}) {
  const [lit, setLit] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      onPointerEnter={() => { setLit(true); }}
      onPointerLeave={() => { setLit(false); }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        // 44px of height for the thumb even though the ink is 15px tall.
        minHeight: 44, padding: `0 ${String(S[2])}px`,
        background: 'none', border: 0, cursor: 'pointer',
        color: lit ? COLOR.mut : COLOR.dim,
        ...TYPE.micro, fontSize: 10.5,
        transition: `color ${MOTION.base} ${MOTION.ease}`,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{ display: 'flex', flexShrink: 0 }}>{icon}</span>
      {label}
    </button>
  );
}

export function HomeDoor({ onNew, onLoad, onUtility, disabled = false, notice }: Props) {
  return (
    <>
      <div
        aria-hidden="true"
        style={{ position: 'fixed', inset: 0, background: FIELD, pointerEvents: 'none' }}
      />

      <div
        style={{
          position: 'relative',
          // dvh rather than vh: on iOS the address bar makes vh taller than the
          // screen, which pushes the foot under the home indicator.
          minHeight: '100dvh',
          display: 'flex', flexDirection: 'column',
          // The status bar is not a place to put a title.
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 24px)',
          // Nor is the home indicator a place to put a button.
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
          boxSizing: 'border-box',
        }}
      >
        {/* The middle: the name, and the two things you can do about it. */}
        <div
          style={{
            flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
            // Optically centred rather than mathematically: a lockup sitting on
            // the exact middle of a tall phone reads as having sunk.
            paddingBottom: S[5],
          }}
        >
          <div style={{ maxWidth: 340, width: '100%', margin: '0 auto' }}>
            {/* Two words, one over the other, set tight. Stacked they read as a
                mark; on one line they read as a filename.

                It is an h1 because it is this screen's heading. The front door
                drops the app bar, and the app bar is what carries the h1
                everywhere else -- a screen with none leaves a screen reader no
                landmark to land on. */}
            <div style={{ textAlign: 'center' }}>
              <h1
                style={{
                  margin: 0,
                  fontFamily: FONT.display, fontSize: 48, fontWeight: 700,
                  lineHeight: 0.9, letterSpacing: '0.045em',
                  textTransform: 'uppercase', color: COLOR.tx,
                  textShadow: `0 2px 30px ${tint(COLOR.amber, 0.16)}`,
                }}
              >
                Dynasty
                <br />
                Manager
              </h1>
              <span
                style={{
                  display: 'inline-block', marginTop: S[3],
                  padding: '3px 11px 2px', borderRadius: R.pill,
                  border: `1px solid ${tint(COLOR.amber, 0.45)}`,
                  background: tint(COLOR.amber, 0.08),
                  ...TYPE.micro, fontSize: 10.5, color: COLOR.amber,
                }}
              >
                Pro
              </span>
            </div>

            {/* The first-down marker: the one amber line on the screen, and the
                only thing separating the name from the choice. */}
            <div
              aria-hidden="true"
              style={{
                height: 2, margin: `${String(S[5])}px auto ${String(S[4])}px`, width: 168,
                background: `linear-gradient(90deg, transparent, ${COLOR.amber} 50%, transparent)`,
              }}
            />

            <p
              style={{
                ...TYPE.micro, margin: `0 0 ${String(S[7])}px`,
                textAlign: 'center', color: COLOR.mut,
                fontSize: 11.5, letterSpacing: '0.18em',
              }}
            >
              Thirty-two teams. One chair.
            </p>

            {notice !== undefined && notice !== null && (
              <div style={{ marginBottom: S[4] }}>{notice}</div>
            )}

            <div style={{ display: 'grid', gap: S[3] }}>
              <DoorButton tone="primary" onClick={onNew} disabled={disabled} testId="new-game">
                New Franchise
              </DoorButton>
              <DoorButton tone="secondary" onClick={onLoad} disabled={disabled} testId="load-game">
                Load Franchise
              </DoorButton>
            </div>
          </div>
        </div>

        {/* The foot: housekeeping, and the build. Muted, thin, and nowhere near
            loud enough to be mistaken for the two doors above.

            The version sits in the corner rather than in the row: at 390px the
            three labels and a version number do not fit on one line, and a
            version wrapping onto its own line reads as a fourth link. Pinned,
            it is furniture -- and the row keeps its own line down to 320px. */}
        <div
          style={{
            position: 'relative',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: S[1], flexWrap: 'wrap',
            padding: `0 ${String(S[3])}px ${String(S[4])}px`,
          }}
        >
          <Utility
            label="Settings"
            icon={<SettingsIcon />}
            onClick={() => { onUtility('settings'); }}
            testId="menu-settings"
          />
          <Utility
            label="Database Tools"
            icon={<DatabaseIcon />}
            onClick={() => { onUtility('dbtools'); }}
            testId="menu-dbtools"
          />
          <Utility
            label="Credits"
            icon={<CreditsIcon />}
            onClick={() => { onUtility('credits'); }}
            testId="menu-credits"
          />
          <span
            data-testid="app-version"
            style={{
              ...TYPE.micro, fontSize: 10, color: COLOR.dim,
              position: 'absolute', right: S[4], bottom: 0,
            }}
          >
            {VERSION_LABEL}
          </span>
        </div>
      </div>
    </>
  );
}
