// Who you are: a first name and a last name.
//
// That is the whole screen. No traits, no difficulty, no avatar, no
// reputation, no start date -- a new game always opens at week 1 of the
// regular season, so there is nothing to choose. The two names travel to the
// club screen as navigation params, which is what makes Back work here for
// free: leave, come back, and what you typed is still on the frame.

import { COLOR, S, TYPE } from '../app/tokens';
import { useNavigationState, useNavigator } from '../app/navigation';
import { useUiState } from '../app/useUiState';
import { ActionButton } from '../components/ActionButton';
import { Panel } from '../components/Surface';
import { NameField } from './nameField';
import { Screen } from './Screen';

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
          <NameField label="First name" value={first} onChange={setFirst} autoFocus testId="gm-first" />
          <NameField label="Last name" value={last} onChange={setLast} testId="gm-last" />
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
