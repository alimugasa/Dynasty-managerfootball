// Roster: the squad, and the depth chart you set.
//
// The order here is the order the engine plays. Moving a player up his group
// changes who starts next week.

import { COLOR } from '../app/tokens';
import { useNavigator } from '../app/navigation';
import { ChipRow, type Chip } from '../components/ChipRow';
import { EmptyState, Panel, SectionHeader } from '../components/Surface';
import { useUiState } from '../app/useUiState';
import { useGame } from '../game/GameProvider';
import { playerById, type PositionGroup } from '../game/store';
import { Screen } from './Screen';

const GROUPS: readonly Chip[] = [
  { key: 'QB', label: 'QB' }, { key: 'RB', label: 'RB' }, { key: 'WR', label: 'WR' },
  { key: 'TE', label: 'TE' }, { key: 'OL', label: 'OL' }, { key: 'EDGE', label: 'Edge' },
  { key: 'DT', label: 'DT' }, { key: 'LB', label: 'LB' }, { key: 'CB', label: 'CB' },
  { key: 'S', label: 'S' }, { key: 'K', label: 'K' }, { key: 'P', label: 'P' },
];

export function RosterScreen() {
  const nav = useNavigator();
  const [group, setGroup] = useUiState('group', 'QB');
  const { state, moveInDepth } = useGame();

  const order = state.depthChart[group as PositionGroup] ?? [];
  const identity = state.identities.get(state.userTeamId);

  return (
    <Screen title="Roster" subtitle={identity?.nickname ?? ''} screen="roster">
      <div style={{ marginTop: 8 }}>
        <ChipRow chips={GROUPS} value={group} onChange={setGroup} label="Position group" />
      </div>

      <SectionHeader title={`${group} depth chart`} />
      <p style={{ margin: '0 0 8px', color: COLOR.mut, fontSize: 12, lineHeight: 1.5 }}>
        Top of the list starts. Use the arrows to change who plays.
      </p>

      {order.length === 0 ? (
        <EmptyState title={`No ${group} on the roster`} detail="The engine will field a backup out of position." />
      ) : (
        <Panel padded={false}>
          <div style={{ padding: '0 12px' }} data-testid="depth-list">
            {order.map((id, index) => {
              const player = playerById(state, id);
              const out = state.absence.get(id);
              return (
                <div
                  key={id}
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
                    onClick={() => { nav.push('player', { id }); }}
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
                      {player?.name ?? id}
                    </span>
                    <span style={{ display: 'block', color: COLOR.mut, fontSize: 11 }}>
                      {player === undefined ? 'unknown' : `age ${String(player.age)} · ovr ${String(Math.round(player.ability))}`}
                      {out === undefined ? '' : ` · out ${String(out)}w`}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${player?.name ?? id} up`}
                    data-testid={`move-up-${String(index)}`}
                    disabled={index === 0}
                    onClick={() => { moveInDepth(group as PositionGroup, id, -1); }}
                    style={arrow(index === 0)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${player?.name ?? id} down`}
                    disabled={index === order.length - 1}
                    onClick={() => { moveInDepth(group as PositionGroup, id, 1); }}
                    style={arrow(index === order.length - 1)}
                  >
                    ↓
                  </button>
                </div>
              );
            })}
          </div>
        </Panel>
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
