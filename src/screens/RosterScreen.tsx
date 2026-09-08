// Roster: the squad, and the depth chart you set.
//
// The order here is the order the engine plays. Moving a player up his group
// is the one decision the client sends; the server checks it names exactly the
// group as it stands and stores it, and next week's game reads it.

import { COLOR } from '../app/tokens';
import { useNavigator } from '../app/navigation';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { ChipRow, type Chip } from '../components/ChipRow';
import { EmptyState, Panel, SectionHeader } from '../components/Surface';
import { Loading, NoDynasty, QueryError } from '../components/QueryState';
import { useUiState } from '../app/useUiState';
import { Screen } from './Screen';
import type { RosterOut } from '../../supabase/functions/_shared/api/reads/roster';

const GROUPS: readonly Chip[] = [
  { key: 'QB', label: 'QB' }, { key: 'RB', label: 'RB' }, { key: 'WR', label: 'WR' },
  { key: 'TE', label: 'TE' }, { key: 'OL', label: 'OL' }, { key: 'EDGE', label: 'Edge' },
  { key: 'DT', label: 'DT' }, { key: 'LB', label: 'LB' }, { key: 'CB', label: 'CB' },
  { key: 'S', label: 'S' }, { key: 'K', label: 'K' }, { key: 'P', label: 'P' },
  { key: 'LS', label: 'LS' },
];

export function RosterScreen() {
  const nav = useNavigator();
  const [group, setGroup] = useUiState('group', 'QB');
  const { save, loaded, loadError, clubsById, version, busy, setDepthChart } = useSave();
  const q = useQuery<RosterOut>('roster', { saveId: save?.saveId ?? '', group }, version, save !== null);
  const identity = save === null ? undefined : clubsById.get(save.userTeamId);

  const move = (playerId: string, direction: -1 | 1): void => {
    if (q.status !== 'ready' || busy !== null) return;
    const order = q.data.order.map((r) => r.playerId);
    const from = order.indexOf(playerId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= order.length) return;
    [order[from], order[to]] = [order[to] ?? '', order[from] ?? ''];
    void setDepthChart(group, order);
  };

  return (
    <Screen title="Roster" subtitle={identity?.nickname ?? ''} screen="roster">
      {loadError !== null && <QueryError error={loadError} />}
      {loaded && save === null && <NoDynasty />}
      {save !== null && (
        <>
          <div style={{ marginTop: 8 }}>
            <ChipRow chips={GROUPS} value={group} onChange={setGroup} label="Position group" />
          </div>

          <SectionHeader title={`${group} depth chart`} />
          <p style={{ margin: '0 0 8px', color: COLOR.mut, fontSize: 12, lineHeight: 1.5 }}>
            Top of the list starts. Use the arrows to change who plays.
          </p>

          {q.status === 'error' && <QueryError error={q.error} />}
          {q.status === 'loading' && <Loading label="Loading depth chart" />}
          {q.status === 'ready' && q.data.order.length === 0 && (
            <EmptyState title={`No ${group} on the roster`} detail="The engine will field a backup out of position." />
          )}
          {q.status === 'ready' && q.data.order.length > 0 && (
            <Panel padded={false}>
              <div style={{ padding: '0 12px' }} data-testid="depth-list">
                {q.data.order.map((row, index) => (
                  <div
                    key={row.playerId}
                    data-testid={`depth-row-${String(index)}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, minHeight: 52,
                      borderBottom: `1px solid ${COLOR.line}`, minWidth: 0,
                    }}
                  >
                    <span style={{
                      width: 22, color: index === 0 ? COLOR.amber : COLOR.dim,
                      fontSize: 12, fontWeight: 600, flexShrink: 0,
                    }}
                    >
                      {index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => { nav.push('player', { id: row.playerId }); }}
                      style={{
                        flex: 1, minWidth: 0, textAlign: 'left', background: 'none',
                        border: 'none', padding: 0, cursor: 'pointer', color: COLOR.tx,
                      }}
                    >
                      <span style={{
                        display: 'block', fontSize: 14, overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                      >
                        {row.name}
                      </span>
                      <span style={{ display: 'block', color: COLOR.mut, fontSize: 11 }}>
                        {`age ${String(row.age)} · ovr ${String(row.overall)}`}
                        {row.out === null ? '' : ` · out ${String(row.out)}w`}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${row.name} up`}
                      data-testid={`move-up-${String(index)}`}
                      disabled={index === 0 || busy !== null}
                      onClick={() => { move(row.playerId, -1); }}
                      style={arrow(index === 0)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${row.name} down`}
                      disabled={index === q.data.order.length - 1 || busy !== null}
                      onClick={() => { move(row.playerId, 1); }}
                      style={arrow(index === q.data.order.length - 1)}
                    >
                      ↓
                    </button>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </>
      )}
    </Screen>
  );
}

function arrow(disabled: boolean) {
  return {
    width: 44, minHeight: 44, flexShrink: 0, borderRadius: 8,
    border: `1px solid ${COLOR.line2}`, background: 'transparent',
    color: disabled ? COLOR.dim : COLOR.tx, fontSize: 16,
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1,
  } as const;
}
