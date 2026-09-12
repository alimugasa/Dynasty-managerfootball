// The team you manage. The last question a new game asks.
//
// The list comes from the template world through the `clubs` read rather than
// from an open save, because at this point there is no save: the team is what
// the save is about to be created from. Picking one creates the dynasty on the
// server -- its own seed, its own copy of the world -- and opens it at week 1
// of the regular season, which is where create-save always starts.

import { COLOR, S, TYPE } from '../app/tokens';
import { useNavigationState } from '../app/navigation';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { ListRow } from '../components/ListRow';
import { Panel } from '../components/Surface';
import { TeamMark } from '../components/TeamMark';
import { Loading, QueryError } from '../components/QueryState';
import { Screen } from './Screen';
import type { ClubsOut } from '../../supabase/functions/_shared/api/reads/clubs';

export function SelectTeamScreen() {
  const { params } = useNavigationState();
  const { startDynasty, busy, notice, version } = useSave();
  const q = useQuery<ClubsOut>('clubs', {}, version);

  const slot = Number(params['slot']);
  const first = params['first'] ?? '';
  const last = params['last'] ?? '';
  // Arriving here without what the two screens before were for is a routing
  // defect, and it says so rather than creating a save with half the answers.
  const ready = Number.isInteger(slot) && slot >= 1 && first !== '' && last !== '';

  return (
    <Screen
      title="Select Team"
      subtitle={ready ? `${first} ${last} · File ${String(slot)}` : ''}
      screen="pickTeam"
    >
      {!ready && (
        <p style={{ ...TYPE.prose, margin: `${String(S[2])}px 0`, color: COLOR.red }}>
          This screen was opened without a save file and a GM name. Go back and start again
          from New Game.
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
                      void startDynasty({
                        slot, teamId: club.id, gmFirstName: first, gmLastName: last,
                      });
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
