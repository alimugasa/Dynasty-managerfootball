// The team you manage. The last question a new game asks.
//
// The list comes from the template world through the `clubs` read rather than
// from an open save, because at this point there is no save: the team is what
// the save is about to be created from. Picking one creates the dynasty on the
// server -- its own seed, its own copy of the world -- and opens it at week 1
// of the regular season, which is where create-save always starts.
//
// Who the manager is comes from the franchise setup state rather than from
// this route's params: it was answered on the screen before, and forwarding it
// through the URL would make two copies of one fact that can disagree.

import { COLOR, S, TYPE } from '../app/tokens';
import { useFranchiseSetup } from '../app/FranchiseSetup';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { ListRow } from '../components/ListRow';
import { Panel } from '../components/Surface';
import { TeamMark } from '../components/TeamMark';
import { Loading, QueryError } from '../components/QueryState';
import { Screen } from './Screen';
import type { ClubsOut } from '../../supabase/functions/_shared/api/reads/clubs';

export function SelectTeamScreen() {
  const { draft, clear } = useFranchiseSetup();
  const { startDynasty, busy, notice, version } = useSave();
  const q = useQuery<ClubsOut>('clubs', {}, version);

  const first = draft?.firstName.trim() ?? '';
  const last = draft?.lastName.trim() ?? '';
  // Arriving here without what the two screens before were for is a routing
  // defect, and it says so rather than creating a save with half the answers.
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
        <p data-testid="notice" style={{ ...TYPE.prose, margin: `0 0 ${String(S[2])}px`, color: COLOR.red }}>{notice}</p>
      )}
      {ready && (
        <p style={{ ...TYPE.prose, margin: `${String(S[1])}px 0 ${String(S[3])}px`, color: COLOR.mut }}>
          The dynasty is created on the server with its own seed, and opens at week 1 of the
          regular season.
        </p>
      )}

      {q.status === 'error' && <QueryError error={q.error} />}
      {q.status === 'loading' && <Loading label="Loading teams" rows={8} />}
      {q.status === 'ready' && ready && (
        <Panel padded={false}>
          <div style={{ padding: `0 ${String(S[3])}px` }} data-testid="club-list">
            {q.data.clubs.map((club) => (
              <ListRow
                key={club.id}
                title={club.name}
                subtitle={`${club.conferenceId} · ${club.divisionId}`}
                leading={(
                  <TeamMark
                    abbreviation={club.id}
                    primary={club.primary}
                    secondary={club.secondary}
                    size={32}
                  />
                )}
                navigable={busy === null}
                {...(busy === null
                  ? {
                    onSelect: () => {
                      // The draft's last use. It is thrown away as the
                      // dynasty it described is created, so nothing half
                      // answered survives into a game.
                      const setup = draft;
                      void startDynasty({
                        slot: setup.slot, teamId: club.id,
                        gmFirstName: first, gmLastName: last,
                        gmStyle: setup.style,
                      }).finally(clear);
                    },
                  }
                  : {})}
              />
            ))}
          </div>
        </Panel>
      )}
    </Screen>
  );
}
