import { COLOR, S, TYPE } from '../../app/tokens';
import { useNavigator } from '../../app/navigation';
import { ActionButton } from '../../components/ActionButton';
import { EmptyState, Panel, SectionHeader } from '../../components/Surface';
import { ChipRow } from '../../components/ChipRow';
import { SortControl } from '../../components/SortControl';
import { EntityLink } from '../../components/EntityLink';
import { campRows } from '../../domain/camp';
import type { AvatarMap } from '../../hooks/useAvatars';
import { CampPlayer } from './CampPlayer';
import type { CampOut, CampPlayerOut } from '../../../supabase/functions/_shared/api/reads/camp';

interface Props {
  readonly data: CampOut; readonly group: string; readonly filter: string;
  readonly sort: string; readonly direction: 'asc' | 'desc';
  readonly onGroup: (group: string) => void; readonly onFilter: (filter: string) => void;
  readonly onSort: (sort: string) => void; readonly onReverse: () => void;
  readonly onCut: (player: CampPlayerOut) => void; readonly avatars: AvatarMap;
  readonly busy: boolean; readonly battles: boolean;
}

export function CampRoster(p: Props) {
  const rows = campRows(p.data.players, p.group, p.filter, p.sort, p.direction);
  const battles = p.data.battles.filter((b) => p.group === '' || b.group === p.group);
  return (
    <>
      <SectionHeader title={p.battles ? 'Position battles' : 'Cut decisions'} />
      <div style={{ display: 'grid', gap: S[2], marginBottom: S[3] }}>
        <ChipRow label="Camp position" value={p.group} onChange={p.onGroup}
          chips={[{ key: '', label: 'All' }, ...p.data.groups.map((g) => ({ key: g.group, label: `${g.group} · ${String(g.count)}` }))]} />
        <ChipRow label="Camp filter" value={p.filter} onChange={p.onFilter} chips={[
          { key: 'ALL', label: 'Everyone' }, { key: 'DECISIONS', label: 'Roster decisions' },
          { key: 'RISER', label: 'Risers' }, { key: 'FALLER', label: 'Fallers' }, { key: 'INJURED', label: 'Injured' },
        ]} />
        <SortControl label="Sort camp players" value={p.sort} direction={p.direction}
          onField={p.onSort} onReverse={p.onReverse} fields={[
            { key: 'PRACTICE', label: 'Practice' }, { key: 'PRESEASON', label: 'Preseason' },
            { key: 'ABILITY', label: 'Ability' }, { key: 'AGE', label: 'Age' },
            { key: 'CAP', label: 'Cap charge' }, { key: 'DEAD', label: 'Dead money' },
          ]} />
      </div>
      <p style={{ ...TYPE.prose, fontSize: 12, color: COLOR.mut }}>
        Ability describes talent. Rectangular grades describe the staff’s evaluation. Neither chooses your roster for you.
      </p>
      {p.battles && (
        <div style={{ display: 'grid', gap: S[3], marginBottom: S[4] }} data-testid="camp-battles">
          {battles.length === 0 ? <EmptyState title="No close battles in this group"
            detail="The current staff assessment does not identify a close contest. The full roster remains below." />
            : battles.map((b) => (
              <details key={`${b.group}-${String(b.forDepth)}`} open={p.group !== ''}>
                <summary style={{ ...TYPE.prose, minHeight: 44, cursor: 'pointer', color: COLOR.amber }}>
                  {b.group} · {b.starting ? 'Starting' : 'Depth'} place {b.forDepth} · {b.players.length} contenders
                </summary>
                <p style={{ ...TYPE.prose, fontSize: 12, color: COLOR.mut }}>
                  Staff comparison closeness: {b.closeness}/100. This is a comparison index, not a predicted result.
                </p>
                <div style={{ display: 'grid', gap: S[2] }}>
                  {b.players.map((player) => <CampPlayer key={player.playerId} p={player} avatars={p.avatars} busy={p.busy} />)}
                </div>
              </details>
            ))}
        </div>
      )}
      <SectionHeader title={p.group === '' ? 'Players in camp' : `${p.group} players in camp`} />
      {rows.length === 0 ? <EmptyState title="No players match" detail="Choose another position or clear the camp filter." />
        : <div style={{ display: 'grid', gap: S[3] }} data-testid="camp-player-list">
          {rows.map((player) => <CampPlayer key={player.playerId} p={player} avatars={p.avatars} onCut={p.onCut} busy={p.busy} />)}
        </div>}
    </>
  );
}

export function CampReview({ data: d, onGroup }: {
  readonly data: CampOut; readonly onGroup: (group: string) => void;
}) {
  const nav = useNavigator();
  return (
    <section aria-label="Final Roster Review" data-testid="camp-review">
      <SectionHeader title="Final Roster Review" />
      <Panel>
        <p style={{ ...TYPE.heading, marginTop: 0 }}>{d.rosterCount} players · target {d.rosterLimit}</p>
        {d.rosterFault === null ? <p style={{ ...TYPE.prose, color: COLOR.teal }}>
          {d.limitEnforced ? 'Roster limit met. Review depth and availability before signing off.' : 'Commissioner mode permits this roster count.'}
        </p> : <p role="alert" style={{ ...TYPE.prose, color: COLOR.amber }}>{d.rosterFault}</p>}
        <p style={{ ...TYPE.prose, fontSize: 12, color: COLOR.mut }}>Depth and availability alerts are advisory. They do not replace the roster-limit check.</p>
        {d.depthWarnings.length === 0 ? <p style={{ ...TYPE.prose }}>No roster-depth warnings reported.</p>
          : <ul style={{ ...TYPE.prose, paddingLeft: S[4] }}>{d.depthWarnings.map((w) => <li key={w}>{w}</li>)}</ul>}
        {d.availabilityWarnings.length > 0 && <>
          <h3 style={TYPE.micro}>Available-player alerts</h3>
          <ul style={{ ...TYPE.prose, paddingLeft: S[4] }}>{d.availabilityWarnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </>}
        <ActionButton tone="quiet" onClick={() => { nav.push('depthChart'); }}>Set depth chart</ActionButton>
        <p style={{ ...TYPE.prose, fontSize: 12, color: COLOR.mut }}>
          Free-agent signings and waiver claims are unavailable during camp. Avoid cutting below the required roster count.
        </p>
      </Panel>
      <SectionHeader title="Position distribution" />
      <Panel>
        {d.groups.map((g) => <button key={g.group} type="button" onClick={() => { onGroup(g.group); }}
          style={{ width: '100%', minHeight: 52, paddingBlock: S[2], background: 'none', border: 0,
            borderBottom: `1px solid ${COLOR.line}`, color: COLOR.tx, textAlign: 'left', cursor: 'pointer' }}>
          <strong>{g.group} · {g.count} players</strong>
          <span style={{ display: 'block', fontSize: 12, color: COLOR.mut }}>{g.available} available · {g.startingPlaces} starting places</span>
        </button>)}
      </Panel>
      <SectionHeader title="Injured players" />
      <Panel>
        {d.injuries.length === 0 ? <p style={{ ...TYPE.prose }}>No current injuries reported.</p>
          : d.injuries.map((p) => <div key={p.playerId} style={{ ...TYPE.prose }}>
            <EntityLink to={{ kind: 'player', id: p.playerId }}>{p.name} · {p.position} · Out {p.weeksOut}w</EntityLink>
          </div>)}
      </Panel>
    </section>
  );
}
