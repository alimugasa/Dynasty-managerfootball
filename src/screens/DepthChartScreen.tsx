import { useRef, useState } from 'react';
import { useSave } from '../app/SaveProvider';
import { useUiState } from '../app/useUiState';
import { COLOR, S, TYPE } from '../app/tokens';
import { useDepthChart } from '../hooks/useDepthChart';
import { useAvatars } from '../hooks/useAvatars';
import { Loading, NoDynasty, QueryError } from '../components/QueryState';
import { ChipRow } from '../components/ChipRow';
import { ActionButton } from '../components/ActionButton';
import { SectionHeader } from '../components/Surface';
import { Screen } from './Screen';
import { DepthGroup } from './depth/DepthGroup';
import { DepthReadiness } from './depth/DepthReadiness';
import { DepthActions } from './depth/DepthActions';

const EMPTY_IDS: readonly string[] = [];

export function DepthChartScreen() {
  const { save, loaded, loadError, version, busy, notice, marketMove, markChecklist } = useSave();
  const q = useDepthChart(save?.saveId, version);
  const [group, setGroup] = useUiState('depthGroup', '');
  const [message, setMessage] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const pending = useRef(false);
  const faces = useAvatars(q.data?.groups.flatMap((g) => g.order.map((p) => p.playerId)) ?? EMPTY_IDS);
  const write = async (route: string, input: Record<string, unknown>): Promise<void> => {
    if (pending.current || busy !== null || q.status !== 'ready') return;
    pending.current = true; setAttempted(true); setMessage(null);
    try {
      const out = await marketMove<{ readonly ok: true }>(route, { ...input, expectedRevision: q.data.revision });
      if (out !== null) {
        setMessage('Depth order saved.');
        await markChecklist('depth', 'DONE');
      }
      // SaveProvider refreshes even after refusal. Never display a guessed order.
    } finally { pending.current = false; }
  };
  return <Screen title="Depth Chart" subtitle={save === null ? '' : String(save.season)} screen="depthChart">
    {loadError !== null ? <QueryError error={loadError} /> : !loaded ? <Loading label="Loading depth chart" />
      : save === null ? <NoDynasty /> : <>
        {q.status === 'loading' && <Loading label="Loading depth chart" />}
        {q.status === 'error' && <QueryError error={q.error} onRetry={q.retry} />}
        {attempted && notice !== null && <p role="alert" style={{ ...TYPE.prose, color: COLOR.red }}>{notice}</p>}
        {message !== null && <p role="status" style={{ ...TYPE.prose, color: COLOR.teal }}>{message}</p>}
        {q.status === 'ready' && <>
          <DepthReadiness data={q.data} />
          <SectionHeader title="Position groups" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: S[2] }}>
            {q.data.groups.map((g) => <button key={g.group} type="button" onClick={() => { setGroup(g.group); }}
              aria-label={'Review ' + g.group} style={{ padding: S[3], minHeight: 72, textAlign: 'left',
                background: COLOR.panel, color: COLOR.tx, border: '1px solid ' + COLOR.line2, borderRadius: 12 }}>
              <strong>{g.group}</strong>
              <span style={{ display: 'block', fontSize: 12, color: COLOR.mut }}>{g.available} available · {g.order.length} total</span>
              <span style={{ display: 'block', fontSize: 12 }}>{g.injuredStarters > 0 ? 'Injury concern' : g.startersSet < g.startingPlaces ? 'Starting places unfilled' : g.needsSave ? 'Order needs saving' : 'Starting places filled'}</span>
            </button>)}
          </div>
          <div style={{ marginBlock: S[3] }}>
            <ChipRow label="Depth position" value={group} onChange={setGroup}
              chips={[{ key: '', label: 'All' }, ...q.data.groups.map((g) => ({ key: g.group, label: g.group }))]} />
          </div>
          <p style={{ ...TYPE.prose, fontSize: 12, color: COLOR.mut }}>
            Circular dials show ability. Order is saved after each move. Players remain in their server-defined position group.
            Injured starters keep their saved place; the simulation uses available cover.
          </p>
          <div style={{ display: 'grid', gap: S[4] }}>
            {q.data.groups.filter((g) => group === '' || g.group === group).map((g) => <DepthGroup
              key={g.group} group={g} busy={busy !== null} avatars={faces}
              onOrder={(key, order) => { void write('set-depth-chart', { group: key, order }); }} />)}
          </div>
          <ActionButton tone="quiet" disabled={busy !== null} onClick={q.retry}>Refresh roster &amp; injuries</ActionButton>
        </>}
        <DepthActions data={q.status === 'ready' ? q.data : null} busy={busy !== null}
          onAuto={() => write('auto-depth-chart', {})} />
      </>}
  </Screen>;
}
