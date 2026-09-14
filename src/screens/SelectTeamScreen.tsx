// The team you manage. The last question a new game asks, and the only one
// with thirty-two answers.
//
// The board comes from the template world through `team-profiles` rather than
// from an open save, because at this point there is no save: the club is what
// the save is about to be created from. Picking one no longer creates it --
// that decision has a screen of its own now -- so this screen writes the pick
// into the franchise setup state and moves on, which is what lets Back come
// out of the preview with the GM and the filters intact.
//
// Who the manager is comes from the setup state too, not from this route's
// params: it was answered on the screen before, and forwarding it through the
// URL would make two copies of one fact that can disagree.

import { COLOR, S, TYPE } from '../app/tokens';
import { useFranchiseSetup } from '../app/FranchiseSetup';
import { useNavigator } from '../app/navigation';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { Loading, QueryError } from '../components/QueryState';
import { Screen } from './Screen';
import { SelectTeamBoard } from './selectTeamBoard';
import type { TeamProfilesOut } from '../../supabase/functions/_shared/api/reads/teamProfiles';

export function SelectTeamScreen() {
  const nav = useNavigator();
  const { draft, record } = useFranchiseSetup();
  const { busy, notice, version } = useSave();
  const q = useQuery<TeamProfilesOut>('team-profiles', {}, version);

  const first = draft?.firstName.trim() ?? '';
  const last = draft?.lastName.trim() ?? '';
  // Arriving here without what the two screens before were for is a routing
  // defect, and it says so rather than starting a franchise with half the
  // answers.
  const ready = draft !== null && first !== '' && last !== '';

  return (
    <Screen
      title="Select Team"
      subtitle={ready ? `${first} ${last} · File ${String(draft.slot)}` : ''}
      screen="pickTeam"
    >
      {!ready && (
        <p style={{ ...TYPE.prose, margin: `${String(S[2])}px 0`, color: COLOR.red }}>
          This screen was opened without a save file and a GM name. Go back and start again
          from New Franchise.
        </p>
      )}
      {notice !== null && (
        <p data-testid="notice" style={{ ...TYPE.prose, margin: `0 0 ${String(S[2])}px`, color: COLOR.red }}>
          {notice}
        </p>
      )}

      {q.status === 'error' && <QueryError error={q.error} />}
      {q.status === 'loading' && <Loading label="Scouting the league" rows={8} />}
      {q.status === 'ready' && ready && (
        <SelectTeamBoard
          teams={q.data.teams}
          disabled={busy !== null}
          onPick={(teamId) => {
            record({ teamId });
            nav.push('teamPreview', { teamId });
          }}
        />
      )}
    </Screen>
  );
}
