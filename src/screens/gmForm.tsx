// Create GM, the screen itself.
//
// Shared with the play-test rig, like the front door and the name field: this
// is one of four screens between the app icon and a dynasty, and four screens
// are easy to let drift apart between two builds.
//
// Three things stacked, in the order the answers matter: the two names, what
// they produce, and one optional question about the manager behind them. The
// preview in the middle is what makes the fields concrete -- two text boxes are
// abstract until something shows you the person they add up to.

import { useState } from 'react';
import { COLOR, S, TYPE } from '../app/tokens';
import { ActionButton } from '../components/ActionButton';
import { Panel } from '../components/Surface';
import { NameField } from './nameField';
import { GmPreview } from './gmPreview';
import { GmStylePicker } from './gmStylePicker';
import { DEFAULT_GM_STYLE, type GmStyleKey } from './gmStyles';

interface Props {
  /** The save file being filled, shown on the preview. Null only when the
   *  screen is rendered outside the flow, where it says so rather than
   *  guessing File 1. */
  readonly slot: number | null;
  readonly first: string;
  readonly last: string;
  readonly style: GmStyleKey;
  readonly onFirst: (next: string) => void;
  readonly onLast: (next: string) => void;
  readonly onStyle: (next: GmStyleKey) => void;
  readonly onContinue: () => void;
}

/** What each field says when it is the one holding you up. Named rather than
 *  one message for both, because "Both names are needed" under a filled first
 *  name is the app failing to read its own form. */
const MISSING = {
  first: 'Enter a first name.',
  last: 'Enter a last name.',
} as const;

export function GmForm({
  slot, first, last, style, onFirst, onLast, onStyle, onContinue,
}: Props) {
  // Nothing is wrong until the player says they are done. A form that reddens
  // while you are still typing the first box is telling you off for not having
  // finished yet.
  const [shown, setShown] = useState(false);

  const hasFirst = first.trim() !== '';
  const hasLast = last.trim() !== '';
  const ready = hasFirst && hasLast;

  const go = (): void => {
    if (!ready) { setShown(true); return; }
    setShown(false);
    onContinue();
  };

  return (
    <>
      <p style={{ ...TYPE.prose, margin: `${String(S[1])}px 0 0`, color: COLOR.tx }}>
        Your name goes on the save file and the office door.
      </p>
      <p style={{ ...TYPE.prose, margin: `${String(S[1])}px 0 ${String(S[4])}px`, color: COLOR.dim }}>
        You can edit your GM profile later.
      </p>

      <Panel>
        <form
          style={{ display: 'grid', gap: S[4] }}
          // Fires on the keyboard's Go, which is how a phone finishes a form --
          // and it fires whether or not the button below is takeable, which is
          // what lets a half-filled form answer with a reason instead of
          // nothing at all.
          onSubmit={(e) => { e.preventDefault(); go(); }}
        >
          <NameField
            label="First Name"
            value={first}
            onChange={onFirst}
            autoFocus
            testId="gm-first"
            error={shown && !hasFirst ? MISSING.first : null}
          />
          <NameField
            label="Last Name"
            value={last}
            onChange={onLast}
            testId="gm-last"
            error={shown && !hasLast ? MISSING.last : null}
          />
        </form>
      </Panel>

      <div style={{ marginTop: S[4] }}>
        <GmPreview first={first} last={last} style={style} slot={slot} />
      </div>

      <div style={{ marginTop: S[5] }}>
        <GmStylePicker value={style} onChange={onStyle} />
      </div>

      <div style={{ position: 'relative', marginTop: S[5] }}>
        <ActionButton onClick={go} disabled={!ready} testId="gm-continue">
          Continue
        </ActionButton>
        {!ready && (
          // A disabled control swallows its own taps, so the tap lands here
          // instead and the form answers it. Pressing a dead button and getting
          // silence is the form refusing to say what it wants.
          <div
            aria-hidden="true"
            data-testid="gm-continue-blocked"
            onPointerDown={() => { setShown(true); }}
            style={{ position: 'absolute', inset: 0, cursor: 'default' }}
          />
        )}
      </div>
    </>
  );
}

export { DEFAULT_GM_STYLE };
export type { GmStyleKey };
