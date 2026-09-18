import { COLOR, S, TYPE } from '../../app/tokens';
import { Panel, EmptyState } from '../../components/Surface';
import { ActionButton } from '../../components/ActionButton';
import { EntityLink } from '../../components/EntityLink';
import { AbilityDial } from '../../components/AbilityDial';
import { PlayerFace } from '../../avatar/PlayerFace';
import type { AvatarMap } from '../../hooks/useAvatars';
import type { DepthGroupOut } from '../../../supabase/functions/_shared/api/reads/depthChartTypes';

export function DepthGroup({ group: g, busy, avatars, onOrder }: {
  readonly group: DepthGroupOut; readonly busy: boolean; readonly avatars: AvatarMap;
  readonly onOrder: (group: string, order: readonly string[]) => void;
}) {
  const move = (from: number, to: number): void => {
    const order = g.order.map((p) => p.playerId);
    const player = order[from]; const other = order[to];
    if (player === undefined || other === undefined) return;
    order[from] = other; order[to] = player;
    onOrder(g.group, order);
  };
  return <section aria-label={g.group + ' hierarchy'} data-testid={'depth-group-' + g.group}>
    <h2 style={{ ...TYPE.heading, marginBottom: S[1] }}>{g.group}</h2>
    <p style={{ ...TYPE.prose, fontSize: 12, color: COLOR.mut }}>
      {g.order.length} players · {g.available} available · {g.startingPlaces} starting places
      {g.startingPlaces === 0 && ' · Specialist order; no simulated starting slot'}
    </p>
    {g.warnings.length > 0 && <ul style={{ ...TYPE.prose, fontSize: 12, paddingLeft: S[4], color: COLOR.amber }}>
      {g.warnings.map((w) => <li key={w}>{w}</li>)}
    </ul>}
    {g.needsSave && <ActionButton tone="quiet" disabled={busy}
      onClick={() => { onOrder(g.group, g.order.map((p) => p.playerId)); }}>Save {g.group} order</ActionButton>}
    {g.order.length === 0 ? <EmptyState title={'No ' + g.group + ' players'}
      detail="No eligible players are on this roster. Ordering cannot fill a roster vacancy." />
      : <div style={{ display: 'grid', gap: S[2] }} data-testid="depth-list">
        {g.order.map((p, index) => <Panel key={p.playerId}>
          <div data-testid={'depth-player-' + p.playerId}>
            <div style={{ ...TYPE.micro, color: p.role === 'Starter' ? COLOR.amber : COLOR.mut }}>
              {p.rank}. {p.role}{!p.persisted && ' · Unsaved fallback'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: S[2], minWidth: 0 }}>
              <PlayerFace avatars={avatars} playerId={p.playerId} name={p.name} />
              <div style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', ...TYPE.prose }}>
                <EntityLink to={{ kind: 'player', id: p.playerId }}>{p.name}</EntityLink>
                <div style={{ color: COLOR.mut, fontSize: 12 }}>{p.position} · Age {p.age} · {p.rosterStatus}</div>
              </div>
              <AbilityDial value={p.overall} label="Ability" />
            </div>
            <p style={{ ...TYPE.prose, marginBlock: S[2], fontSize: 12, color: p.out === null ? COLOR.mut : COLOR.amber }}>
              {p.out === null ? 'Available' : 'Injured · Out ' + String(p.out) + 'w'}
              {p.out !== null && p.role === 'Starter' && ' · Starting slot affected'}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: S[2] }}>
              <button type="button" style={control} aria-label={'Move ' + p.name + ' up'}
                disabled={busy || index === 0} onClick={() => { move(index, index - 1); }}>↑ Move up</button>
              <button type="button" style={control} aria-label={'Move ' + p.name + ' down'}
                disabled={busy || index === g.order.length - 1} onClick={() => { move(index, index + 1); }}>↓ Move down</button>
            </div>
          </div>
        </Panel>)}
      </div>}
  </section>;
}
const control = { minHeight: 44, borderRadius: 10, border: '1px solid ' + COLOR.line2,
  background: COLOR.panel, color: COLOR.tx, fontSize: 12, cursor: 'pointer' } as const;
