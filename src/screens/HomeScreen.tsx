// The front door: New Game, or Load Game.
//
// Two options and nothing else. Everything a new game needs is asked for on
// the three screens after this one -- a save file, a name, a club -- and
// nothing beyond those three is asked for at all: no difficulty, no traits, no
// avatar, no reputation, no start date. A new game always opens at week 1 of
// the regular season.

import { COLOR, FONT } from '../app/tokens';
import { useNavigator } from '../app/navigation';
import { useSave } from '../app/SaveProvider';
import { ActionButton } from '../components/ActionButton';
import { QueryError } from '../components/QueryState';
import { Screen } from './Screen';

export function HomeScreen() {
  const nav = useNavigator();
  const { loadError, busy } = useSave();

  return (
    <Screen title="Dynasty Manager" subtitle="Pro" screen="home">
      {/* A remembered save that could not be reopened says so here rather than
          on a game screen with nothing behind it. */}
      {loadError !== null && <QueryError error={loadError} />}

      <div
        style={{
          display: 'grid', gap: 12, marginTop: 28,
          maxWidth: 320, marginLeft: 'auto', marginRight: 'auto',
        }}
      >
        <p
          style={{
            margin: '0 0 6px', textAlign: 'center',
            fontFamily: FONT.display, fontSize: 13, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: COLOR.dim,
          }}
        >
          Thirty-two teams. One chair.
        </p>
        <ActionButton
          onClick={() => { nav.push('slots', { mode: 'new' }); }}
          disabled={busy !== null}
          testId="new-game"
        >
          New Game
        </ActionButton>
        <ActionButton
          onClick={() => { nav.push('slots', { mode: 'load' }); }}
          disabled={busy !== null}
          tone="quiet"
          testId="load-game"
        >
          Load Game
        </ActionButton>
      </div>
    </Screen>
  );
}
