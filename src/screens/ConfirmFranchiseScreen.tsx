// The last screen: everything the flow gathered, and the button that commits it.
//
// Five screens asked five questions and none of them wrote anything. This is
// the one call to create-save, with the file, the two names, the style, the
// club and the eight rules the franchise will be played under -- and the draft
// is thrown away as the dynasty it described is created.
//
// Walking back out of it changes nothing, which is the whole reason the flow
// ends on a review rather than on a button at the bottom of a settings page.

import { COLOR, S, TYPE } from '../app/tokens';
import { useFranchiseSetup } from '../app/FranchiseSetup';
import { useNavigator } from '../app/navigation';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { QueryError } from '../components/QueryState';
import { SkeletonLine, SkeletonRegion } from '../components/Skeleton';
import { Screen } from './Screen';
import { FranchiseSummary } from './franchiseSummary';
import { gmStyleLabel } from './gmStyles';
import type { TeamProfilesOut } from '../../supabase/functions/_shared/api/reads/teamProfiles';

export function ConfirmFranchiseScreen() {
  const nav = useNavigator();
  const { draft, clear } = useFranchiseSetup();
  const { startDynasty, busy, notice, version } = useSave();
  const q = useQuery<TeamProfilesOut>('team-profiles', {}, version);

  const first = draft?.firstName.trim() ?? '';
  const last = draft?.lastName.trim() ?? '';
  const teamId = draft?.teamId ?? null;
  const ready = draft !== null && first !== '' && last !== '' && teamId !== null;
  const team = q.status === 'ready' && teamId !== null
    ? q.data.teams.find((t) => t.teamId === teamId) ?? null
    : null;

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
            <SkeletonLine height={76} radius={16} />
            <SkeletonLine height={180} radius={10} />
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
          season={q.data.season}
          busy={busy}
          onBack={() => { nav.back(); }}
          onCreate={() => {
            const setup = draft;
            void startDynasty({
              slot: setup.slot, teamId: teamId,
              gmFirstName: first, gmLastName: last,
              gmStyle: setup.style,
              settings: setup.settings,
            }).finally(clear);
          }}
        />
      )}
    </Screen>
  );
}
