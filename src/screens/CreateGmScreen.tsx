// Who you are: a first name and a last name.
//
// That is the whole screen. No traits, no difficulty, no avatar, no
// reputation, no start date -- a new game always opens at week 1 of the
// regular season, so there is nothing to choose. The two names travel to the
// club screen as navigation params, which is what makes Back work here for
// free: leave, come back, and what you typed is still on the frame.

import { COLOR, FONT } from '../app/tokens';
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
      <p style={{ margin: '4px 0 10px', color: COLOR.mut, fontSize: 12, lineHeight: 1.5 }}>
        Your name goes on the save file and on the office door. Nothing else is asked for.
      </p>
      <Panel>
        <form
          style={{ display: 'grid', gap: 14 }}
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
        <p style={{ margin: '8px 2px 0', color: COLOR.dim, fontSize: 11 }}>
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
  return (
    <label style={{ display: 'grid', gap: 6, minWidth: 0 }}>
      <span
        style={{
          fontFamily: FONT.display, fontSize: 11, letterSpacing: '0.09em',
          textTransform: 'uppercase', color: COLOR.mut,
        }}
      >
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
        style={{
          width: '100%', boxSizing: 'border-box', minHeight: 46,
          padding: '0 12px', borderRadius: 8,
          background: COLOR.ink, color: COLOR.tx,
          border: `1px solid ${COLOR.line2}`,
          fontFamily: FONT.ui, fontSize: 16,
        }}
      />
    </label>
  );
}
