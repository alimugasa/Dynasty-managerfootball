// The club you are about to take, before you take it.
//
// The last screen of the boot flow, and the one that finally writes something:
// everything before it gathered answers into the franchise setup draft, and
// confirming here is what calls create-save with all of them at once. Walking
// back out of it changes nothing, which is the point of it being a screen
// rather than a confirmation on a list row.
//
// The club is read from the same board the list read, so the figures here and
// the figures there are the same figures. It is looked up by the id in the
// draft rather than by the route's param -- the draft is what create-save will
// be given, so it is what the player should be looking at.

import { COLOR, S, TYPE } from '../app/tokens';
import { useFranchiseSetup } from '../app/FranchiseSetup';
import { useNavigator } from '../app/navigation';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { Loading, QueryError } from '../components/QueryState';
import { Screen } from './Screen';
import { TeamPreview } from './teamPreview';
import type { TeamProfilesOut } from '../../supabase/functions/_shared/api/reads/teamProfiles';

export function TeamPreviewScreen() {
  const nav = useNavigator();
  const { draft, clear } = useFranchiseSetup();
  const { startDynasty, busy, notice, version } = useSave();
  const q = useQuery<TeamProfilesOut>('team-profiles', {}, version);

  const first = draft?.firstName.trim() ?? '';
  const last = draft?.lastName.trim() ?? '';
  const ready = draft !== null && first !== '' && last !== '' && draft.teamId !== null;
  const team = q.status === 'ready' && draft?.teamId !== null && draft?.teamId !== undefined
    ? q.data.teams.find((t) => t.teamId === draft.teamId) ?? null
    : null;

  return (
    <Screen
      title="Team Preview"
      subtitle={ready ? `${first} ${last} · File ${String(draft.slot)}` : ''}
      screen="teamPreview"
    >
      {!ready && (
        <p style={{ ...TYPE.prose, margin: `${String(S[2])}px 0`, color: COLOR.red }}>
          This screen was opened without a team to preview. Go back and pick one from
          Select Team.
        </p>
      )}
      {notice !== null && (
        <p data-testid="notice" style={{ ...TYPE.prose, margin: `0 0 ${String(S[2])}px`, color: COLOR.red }}>
          {notice}
        </p>
      )}

      {q.status === 'error' && <QueryError error={q.error} />}
      {q.status === 'loading' && <Loading label="Loading the scouting report" rows={6} />}
      {/* A club the board does not have is reported, not blanked: the id came
          from somewhere, and "we cannot find it" is the useful thing to say. */}
      {q.status === 'ready' && ready && team === null && (
        <p style={{ ...TYPE.prose, margin: `${String(S[2])}px 0`, color: COLOR.red }}>
          No club in this league has the id “{draft.teamId}”.
        </p>
      )}
      {q.status === 'ready' && ready && team !== null && (
        <TeamPreview
          team={team}
          busy={busy}
          onBack={() => { nav.back(); }}
          onConfirm={() => {
            const setup = draft;
            // The draft's last use. It is thrown away as the dynasty it
            // described is created, so nothing half answered survives into a
            // game.
            void startDynasty({
              slot: setup.slot, teamId: team.teamId,
              gmFirstName: first, gmLastName: last,
              gmStyle: setup.style,
            }).finally(clear);
          }}
        />
      )}
    </Screen>
  );
}
