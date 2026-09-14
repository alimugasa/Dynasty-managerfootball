// The last screen of the boot flow, wired to the save.
//
// Everything before it gathered answers into the franchise setup draft without
// touching the server. Confirming here is the one call to create-save, with the
// file, the two names, the style and the club it has been carrying since Select
// Team -- and the draft is thrown away as the dynasty it described is created.

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

export function FranchiseSettingsScreen() {
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
      title="Franchise Settings"
      subtitle={ready ? `${first} ${last} · File ${String(draft.slot)}` : ''}
      screen="franchiseSettings"
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
            <SkeletonLine height={132} radius={10} />
          </div>
        </SkeletonRegion>
      )}

      {q.status === 'ready' && ready && (
        <FranchiseSummary
          slot={draft.slot}
          gmName={`${first} ${last}`}
          styleLabel={gmStyleLabel(draft.style)}
          team={team}
          busy={busy}
          onBack={() => { nav.back(); }}
          onCreate={() => {
            const setup = draft;
            void startDynasty({
              slot: setup.slot, teamId: teamId,
              gmFirstName: first, gmLastName: last,
              gmStyle: setup.style,
            }).finally(clear);
          }}
        />
      )}
    </Screen>
  );
}
