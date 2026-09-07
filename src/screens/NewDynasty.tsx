// Starting a dynasty: pick the club you manage.
//
// The only thing the client sends is the club and a name. The seed, the
// world and every roster are made on the server.

import { COLOR } from '../app/tokens';
import { useSave } from '../app/SaveProvider';
import { ListRow } from '../components/ListRow';
import { Panel, SectionHeader } from '../components/Surface';
import { TeamMark } from '../components/TeamMark';

interface Props {
  /** What picking a club does. Starting a first dynasty by default; the
   *  Office passes restart, which deletes the current one first. */
  readonly onPick?: (teamId: string, name: string) => Promise<void>;
}

export function NewDynasty({ onPick }: Props = {}) {
  const { clubs, startDynasty, busy, notice } = useSave();
  const pick = onPick ?? startDynasty;
  return (
    <>
      <SectionHeader title="Choose your club" />
      <p style={{ margin: '0 0 8px', color: COLOR.mut, fontSize: 12, lineHeight: 1.5 }}>
        A new dynasty is created on the server with its own seed. Nothing is decided here.
      </p>
      {notice !== null && (
        <p data-testid="notice" style={{ margin: '0 0 8px', color: COLOR.red, fontSize: 12 }}>{notice}</p>
      )}
      <Panel padded={false}>
        <div style={{ padding: '0 12px' }} data-testid="club-list">
          {clubs.map((club) => (
            <ListRow
              key={club.id}
              title={club.name}
              subtitle={`${club.conferenceId} · ${club.divisionId}`}
              leading={<TeamMark abbreviation={club.id} primary={club.primary} secondary={club.secondary} size={32} />}
              navigable={busy === null}
              onSelect={() => { if (busy === null) void pick(club.id, `${club.name} dynasty`); }}
            />
          ))}
        </div>
      </Panel>
    </>
  );
}
