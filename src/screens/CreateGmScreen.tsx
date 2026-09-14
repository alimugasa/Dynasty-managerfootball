// Who you are, and the file it goes in.
//
// The answers land in the franchise setup state rather than in navigation
// params, because they are not about this route: they are the first half of a
// franchise that does not exist yet, and the screens after this one read them
// from there. Nothing here touches the server -- the dynasty is created at the
// end of the flow, from everything gathered along the way.
//
// Back works for free as a result. Leave, return, and the form is as you left
// it, because the draft outlives the frame.

import { useEffect } from 'react';
import { useNavigationState, useNavigator } from '../app/navigation';
import { useFranchiseSetup } from '../app/FranchiseSetup';
import { DEFAULT_GM_STYLE, GmForm } from './gmForm';
import { Screen } from './Screen';

export function CreateGmScreen() {
  const nav = useNavigator();
  const { params } = useNavigationState();
  const { draft, begin, record } = useFranchiseSetup();

  const asked = Number(params['slot']);
  const slot = Number.isInteger(asked) && asked >= 1 ? asked : null;

  // The route names the file; the draft is opened for it on arrival. Already
  // open for this file, begin() leaves it alone, which is what makes coming
  // back from Select Team show the name you typed rather than a blank form.
  useEffect(() => { if (slot !== null) begin(slot); }, [slot, begin]);

  return (
    <Screen
      title="Create GM"
      subtitle={slot === null ? '' : `File ${String(slot)}`}
      screen="gm"
    >
      <GmForm
        slot={slot}
        first={draft?.firstName ?? ''}
        last={draft?.lastName ?? ''}
        style={draft?.style ?? DEFAULT_GM_STYLE}
        onFirst={(next) => { record({ firstName: next }); }}
        onLast={(next) => { record({ lastName: next }); }}
        onStyle={(next) => { record({ style: next }); }}
        onContinue={() => { nav.push('pickTeam'); }}
      />
    </Screen>
  );
}
