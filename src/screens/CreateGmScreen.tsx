// Who you are: a first name and a last name.
//
// That is the whole screen. No traits, no difficulty, no avatar, no
// reputation, no start date -- a new game always opens at week 1 of the
// regular season, so there is nothing to choose. The two names travel to the
// club screen as navigation params, which is what makes Back work here for
// free: leave, come back, and what you typed is still on the frame.

import { useState } from 'react';
import { COLOR, FONT, MOTION, R, S, TYPE, tint } from '../app/tokens';
import { useNavigationState, useNavigator } from '../app/navigation';
import { useUiState } from '../app/useUiState';
import { ActionButton } from '../components/ActionButton';
import { Panel } from '../components/Surface';
import { Screen } from './Screen';

/** Long enough for any real name, short enough that the column it lands in on
 *  a slot screen is a name and not a paragraph. */
const MAX_NAME = 24;

export function CreateGmScreen() {
  const nav = useNavigator();
  const { params } = useNavigationState();
  const [first, setFirst] = useUiState<string>('gmFirst', '');
  const [last, setLast] = useUiState<string>('gmLast', '');
  const slot = params['slot'] ?? '';

  const ready = first.trim() !== '' && last.trim() !== '';
  const go = () => {
    if (!ready) return;
    nav.push('pickTeam', { slot, first: first.trim(), last: last.trim() });
  };

  return (
    <Screen title="Create GM" subtitle={slot === '' ? '' : `File ${slot}`} screen="gm">
      <p style={{ ...TYPE.prose, margin: `${String(S[1])}px 0 ${String(S[3])}px`, color: COLOR.mut }}>
        Your name goes on the save file and on the office door. Nothing else is asked for.
      </p>
      <Panel>
        <form
          style={{ display: 'grid', gap: S[4] }}
          onSubmit={(e) => { e.preventDefault(); go(); }}
        >
          <Field label="First name" value={first} onChange={setFirst} autoFocus testId="gm-first" />
          <Field label="Last name" value={last} onChange={setLast} testId="gm-last" />
          <ActionButton onClick={go} disabled={!ready} testId="gm-continue">
            Continue
          </ActionButton>
        </form>
      </Panel>
      {!ready && (
        <p style={{ ...TYPE.prose, margin: `${String(S[2])}px 2px 0`, color: COLOR.dim, fontSize: 11.5 }}>
          Both names are needed. Half a name on a save file tells you nothing.
        </p>
      )}
    </Screen>
  );
}

function Field({
  label, value, onChange, autoFocus = false, testId,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly autoFocus?: boolean;
  readonly testId: string;
}) {
  // A text field with no focus state is a field you cannot tell you are in.
  // The ring is amber because amber is what this app uses to mean "here".
  const [focused, setFocused] = useState(false);
  return (
    <label style={{ display: 'grid', gap: S[2], minWidth: 0 }}>
      <span style={{ ...TYPE.micro, color: focused ? COLOR.amber : COLOR.mut }}>
        {label}
      </span>
      <input
        type="text"
        value={value}
        maxLength={MAX_NAME}
        autoComplete="off"
        autoCapitalize="words"
        // Focused on arrival: this screen exists to be typed in, and the
        // player tapped a save file to get here.
        autoFocus={autoFocus}
        data-testid={testId}
        onChange={(e) => { onChange(e.target.value); }}
        onFocus={() => { setFocused(true); }}
        onBlur={() => { setFocused(false); }}
        style={{
          width: '100%', boxSizing: 'border-box', minHeight: 48,
          padding: `0 ${String(S[3])}px`, borderRadius: R.md,
          background: COLOR.ink, color: COLOR.tx,
          border: `1px solid ${focused ? COLOR.amber : COLOR.line2}`,
          boxShadow: focused ? `0 0 0 3px ${tint(COLOR.amber, 0.16)}` : 'inset 0 1px 2px rgba(0,0,0,0.3)',
          transition: `border-color ${MOTION.fast} ${MOTION.ease}, box-shadow ${MOTION.fast} ${MOTION.ease}`,
          outline: 'none',
          // 16px exactly: anything smaller and iOS Safari zooms the page on
          // focus, which throws the layout of every screen behind this one.
          fontFamily: FONT.ui, fontSize: 16,
        }}
      />
    </label>
  );
}
