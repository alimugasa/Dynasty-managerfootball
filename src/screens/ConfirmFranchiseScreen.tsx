// The last screen the player answers on.
//
// Six screens asked six questions and none of them wrote anything. This one
// does not write either: it reviews, and Create Franchise hands over to the
// world screen, which runs the single call to create-save and shows what it
// built. It is also the only place in the product where a
// double tap could do real damage, so the guard is a ref rather than the busy
// flag: busy is React state and lands a render later, and a second press inside
// that window would ask the server for a second franchise in the same file.
// The unique index on (user_id, slot) would refuse it, but "refused by a
// constraint" is not a thing a player should ever see.
//
// A failure leaves nothing behind. create-save runs in one transaction: the
// clone, the engine state, the projection and the save document either all
// landed or none of them did, so the screen can honestly say the file is still
// empty and offer to try again -- and the draft survives, because a player
// whose creation failed should not have to answer six screens again.
//
// The draft is cleared where a save actually opens (App.tsx's OpenSaveRouter),
// not here. Clearing it beside the call threw away every answer on a failure
// as well as on a success.

import { useRef } from 'react';
import { COLOR, S, TYPE } from '../app/tokens';
import { useFranchiseSetup } from '../app/FranchiseSetup';
import { useNavigator } from '../app/navigation';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { QueryError } from '../components/QueryState';
import { SkeletonLine, SkeletonRegion } from '../components/Skeleton';
import { Screen } from './Screen';
import { FranchiseSummary, saveNameOf } from './franchiseSummary';
import { gmStyleLabel } from './gmStyles';
import type { TeamProfilesOut } from '../../supabase/functions/_shared/api/reads/teamProfiles';

export function ConfirmFranchiseScreen() {
  const nav = useNavigator();
  const { draft, record } = useFranchiseSetup();
  const { busy, notice, version } = useSave();
  const q = useQuery<TeamProfilesOut>('team-profiles', {}, version);
  // Set the moment the button is pressed and cleared only when the attempt has
  // come back, so a second press inside the same render cannot start a second
  // franchise.
  const creating = useRef(false);
  const failed = false;

  const first = draft?.firstName.trim() ?? '';
  const last = draft?.lastName.trim() ?? '';
  const teamId = draft?.teamId ?? null;
  const ready = draft !== null && first !== '' && last !== '' && teamId !== null;
  const team = q.status === 'ready' && teamId !== null
    ? q.data.teams.find((t) => t.teamId === teamId) ?? null
    : null;

  // Creating moved to the world screen, which is the thing that watches it
  // happen. This one hands over and stops being responsible: the guard against
  // a double tap is now "have we already left".
  const create = (): void => {
    if (draft === null || teamId === null || creating.current) return;
    if (saveNameOf(draft.saveName, team).trim() === '') return;
    creating.current = true;
    nav.push('worldGen');
  };

  // A refusal the player came back from still shows here.
  const errored = failed || notice !== null;

  return (
    <Screen
      title="Confirm Franchise"
      subtitle={ready ? `${first} ${last} · File ${String(draft.slot)}` : ''}
      screen="confirmFranchise"
    >
      {!ready && (
        <p style={{ ...TYPE.prose, margin: `${String(S[2])}px 0`, color: COLOR.red }}>
          This screen was opened before a file, a GM and a team were chosen. Go back and
          start again from New Franchise.
        </p>
      )}
      {notice !== null && (
        <p data-testid="notice" style={{ ...TYPE.prose, margin: `0 0 ${String(S[2])}px`, color: COLOR.red }}>
          {notice}
        </p>
      )}

      {q.status === 'error' && <QueryError error={q.error} />}
      {q.status === 'loading' && (
        <SkeletonRegion label="Loading the franchise">
          <div style={{ display: 'grid', gap: S[3], marginTop: S[4] }}>
            <SkeletonLine height={160} radius={16} />
            <SkeletonLine height={220} radius={16} />
            <SkeletonLine height={180} radius={16} />
          </div>
        </SkeletonRegion>
      )}

      {q.status === 'ready' && ready && (
        <FranchiseSummary
          slot={draft.slot}
          gmName={`${first} ${last}`}
          styleLabel={gmStyleLabel(draft.style)}
          team={team}
          settings={draft.settings}
          difficulty={draft.difficulty}
          league={q.data.league}
          season={q.data.season}
          saveName={draft.saveName}
          onSaveName={(next) => { record({ saveName: next }); }}
          busy={busy}
          failed={errored}
          onBack={() => { nav.back(); }}
          // Back to the club's own screen rather than a fresh one: pushing
          // would stack a second Select Team whose filters start empty, and
          // every answer the player has given stays on the draft either way.
          onChangeTeam={() => { nav.backTo('teamPreview'); }}
          onCreate={create}
        />
      )}
    </Screen>
  );
}
