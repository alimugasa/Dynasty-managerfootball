// The front door: New Game, or Load Game.
//
// Everything a new game needs is asked for on the three screens after this one
// -- a save file, a name, a team -- and nothing beyond those three is asked for
// at all: no difficulty, no traits, no avatar, no reputation, no start date. A
// new game always opens at week 1 of the regular season.
//
// The door itself is components/homeDoor, shared with the play-test rig so the
// two builds cannot open on different screens. This file is only the wiring:
// where the buttons go, and what a failed reopen looks like.

import { useNavigator } from '../app/navigation';
import { useSave } from '../app/SaveProvider';
import { QueryError } from '../components/QueryState';
import { HomeDoor } from './homeDoor';
import { Screen } from './Screen';

export function HomeScreen() {
  const nav = useNavigator();
  const { loadError, busy } = useSave();

  return (
    <Screen title="Dynasty Manager" subtitle="Pro" screen="home" bare>
      <HomeDoor
        onNew={() => { nav.push('slots', { mode: 'new' }); }}
        onLoad={() => { nav.push('slots', { mode: 'load' }); }}
        disabled={busy !== null}
        {...(loadError === null ? {} : { notice: <QueryError error={loadError} /> })}
      />
    </Screen>
  );
}
