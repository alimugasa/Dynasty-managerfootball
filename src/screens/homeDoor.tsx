// The front door, as a component with no idea where it is.
//
// Two options and nothing else: New Game, or Load Game. It lives here rather
// than inside HomeScreen because the play-test rig opens on the same door and
// two copies of a title screen drift -- the rig spent a while opening straight
// onto a team list while the app had this, which is exactly the drift.
//
// The backdrop is drawn rather than shipped as art: yard lines in white at
// three per cent, and a warm pool of light behind the name where the stands
// would be. Nothing here is a photograph of anywhere real and nothing here is
// a mark belonging to anyone (docs/IP-POLICY.md), but it says "football at
// night" before a word is read, which is the whole job of a title screen.

import type { ReactNode } from 'react';
import { COLOR, FONT, R, S, TYPE, tint } from '../app/tokens';
import { ActionButton } from '../components/ActionButton';

/** The field, at the alpha where it is texture rather than pattern. */
const FIELD = [
  // The light first, so it sits over the lines rather than under them.
  `radial-gradient(88% 46% at 50% 34%, ${tint(COLOR.amber, 0.1)} 0%, transparent 70%)`,
  // Yard lines only. Cross them with hash marks and the backdrop stops being a
  // field and becomes graph paper.
  'repeating-linear-gradient(90deg,'
    + ' transparent 0 43px, rgba(255,255,255,0.032) 43px 44px)',
  // The lines run out at both ends rather than stopping at an edge.
  `linear-gradient(180deg, ${COLOR.ink} 0%, transparent 18% 74%, ${COLOR.ink} 96%)`,
].join(', ');

interface Props {
  readonly onNew: () => void;
  readonly onLoad: () => void;
  readonly disabled?: boolean;
  /** Something that went wrong before the player got here -- a save that could
   *  not be reopened. Shown above the buttons rather than on a game screen
   *  with nothing behind it. */
  readonly notice?: ReactNode;
}

export function HomeDoor({ onNew, onLoad, disabled = false, notice }: Props) {
  return (
    <>
      <div
        aria-hidden="true"
        style={{ position: 'fixed', inset: 0, background: FIELD, pointerEvents: 'none' }}
      />

      <div
        style={{
          position: 'relative',
          minHeight: 'calc(100dvh - 40px)',
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          paddingTop: 'env(safe-area-inset-top, 0px)',
          // Optically centred rather than mathematically: a lockup sitting on
          // the exact middle of a tall phone reads as having sunk.
          paddingBottom: 72,
        }}
      >
        <div style={{ maxWidth: 320, width: '100%', margin: '0 auto' }}>
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
                fontFamily: FONT.display, fontSize: 46, fontWeight: 700,
                lineHeight: 0.92, letterSpacing: '0.05em',
                textTransform: 'uppercase', color: COLOR.tx,
              }}
            >
              Dynasty
              <br />
              Manager
            </h1>
            <span
              style={{
                display: 'inline-block', marginTop: S[3],
                padding: '3px 10px 2px', borderRadius: R.pill,
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
              height: 2, margin: `${String(S[6])}px auto ${String(S[5])}px`, width: 168,
              background: `linear-gradient(90deg, transparent, ${COLOR.amber} 50%, transparent)`,
            }}
          />

          <p
            style={{
              ...TYPE.micro, margin: `0 0 ${String(S[6])}px`,
              textAlign: 'center', color: COLOR.dim, fontSize: 12,
            }}
          >
            Thirty-two teams. One chair.
          </p>

          {notice !== undefined && notice !== null && (
            <div style={{ marginBottom: S[4] }}>{notice}</div>
          )}

          <div style={{ display: 'grid', gap: S[3] }}>
            <ActionButton onClick={onNew} disabled={disabled} testId="new-game">
              New Game
            </ActionButton>
            <ActionButton onClick={onLoad} disabled={disabled} tone="quiet" testId="load-game">
              Load Game
            </ActionButton>
          </div>
        </div>
      </div>
    </>
  );
}
