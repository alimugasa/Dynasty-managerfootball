// The club you are about to take, wired to the flow.
//
// The last screen before the franchise is configured, and still not the one
// that writes: confirming here records the club in the franchise setup draft
// and moves on to Franchise Settings, where the save is finally created.
// Walking back out of this screen changes nothing, which is the whole reason
// it is a screen and not a confirmation on a list row -- a player can open
// five clubs and start none of them.
//
// The club is looked up by the id in the draft rather than by the route's
// param, because the draft is what create-save will eventually be given, and
// that is what the player should be looking at.

import { COLOR, R, S, TYPE } from '../app/tokens';
import { useFranchiseSetup } from '../app/FranchiseSetup';
import { useNavigator } from '../app/navigation';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { ActionButton } from '../components/ActionButton';
import { QueryError } from '../components/QueryState';
import { SkeletonRegion } from '../components/Skeleton';
import { Screen } from './Screen';
import { TeamPreview, TeamPreviewSkeleton } from './teamPreview';
import type { TeamProfilesOut } from '../../supabase/functions/_shared/api/reads/teamProfiles';

/** A club the board does not have. Reported rather than blanked: the id came
 *  from somewhere, and "we cannot find it" is the useful thing to say. */
function TeamNotFound({ teamId, onBack }: {
  readonly teamId: string | null;
  readonly onBack: () => void;
}) {
  return (
    <div
      data-testid="team-not-found"
      style={{
        marginTop: S[4], padding: `${String(S[7])}px ${String(S[4])}px`,
        textAlign: 'center',
        background: 'rgba(0,0,0,0.22)',
        border: `1px solid ${COLOR.line2}`,
        borderRadius: R.lg,
      }}
    >
      <p style={{ ...TYPE.heading, margin: 0, fontSize: 16, color: COLOR.tx }}>
        Team Not Found
      </p>
      <p
        style={{
          ...TYPE.prose, margin: `${String(S[3])}px auto 0`, maxWidth: 300, color: COLOR.mut,
        }}
      >
        {teamId === null
          ? 'This screen was opened without a team to preview.'
          : `No club in this league has the id “${teamId}”.`}
      </p>
      <div style={{ marginTop: S[5], display: 'flex', justifyContent: 'center' }}>
        <ActionButton tone="quiet" compact testId="not-found-back" onClick={onBack}>
          Back to Teams
        </ActionButton>
      </div>
    </div>
  );
}

export function TeamPreviewScreen() {
  const nav = useNavigator();
  const { draft, record } = useFranchiseSetup();
  const { busy, notice, version } = useSave();
  const q = useQuery<TeamProfilesOut>('team-profiles', {}, version);

  const first = draft?.firstName.trim() ?? '';
  const last = draft?.lastName.trim() ?? '';
  const named = draft !== null && first !== '' && last !== '';
  const teamId = draft?.teamId ?? null;
  const team = q.status === 'ready' && teamId !== null
    ? q.data.teams.find((t) => t.teamId === teamId) ?? null
    : null;

  const toBoard = (): void => { nav.back(); };

  return (
    <Screen
      title="Team Preview"
      subtitle={named ? `${first} ${last} · File ${String(draft.slot)}` : ''}
      screen="teamPreview"
    >
      {notice !== null && (
        <p data-testid="notice" style={{ ...TYPE.prose, margin: `0 0 ${String(S[2])}px`, color: COLOR.red }}>
          {notice}
        </p>
      )}

      {q.status === 'error' && <QueryError error={q.error} />}
      {q.status === 'loading' && (
        <SkeletonRegion label="Loading the scouting report">
          <TeamPreviewSkeleton />
        </SkeletonRegion>
      )}
      {q.status === 'ready' && team === null && (
        <TeamNotFound teamId={teamId} onBack={toBoard} />
      )}
      {q.status === 'ready' && team !== null && (
        <TeamPreview
          team={team}
          busy={busy}
          onBack={toBoard}
          onConfirm={() => {
            // Recorded, not created. The club joins the draft beside the file,
            // the names and the style; Franchise Settings is what calls
            // create-save with all of them at once.
            record({ teamId: team.teamId });
            nav.push('franchiseSettings');
          }}
        />
      )}
    </Screen>
  );
}
