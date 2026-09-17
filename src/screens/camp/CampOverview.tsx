import { COLOR, S, TYPE } from '../../app/tokens';
import { StatTiles } from '../../components/StatTiles';
import { EmptyState, Panel, SectionHeader } from '../../components/Surface';
import { EntityLink } from '../../components/EntityLink';
import { Pill, TermLine, money } from '../marketRows';
import type { CampOut } from '../../../supabase/functions/_shared/api/reads/camp';

export function CampHeader({ data: d }: { readonly data: CampOut }) {
  return (
    <div style={{ display: 'grid', gap: S[3] }} data-testid="camp-header">
      <Panel>
        <Pill text={d.progress.phaseLabel} tone="warn" />
        <p style={{ ...TYPE.prose, marginBottom: 0, color: COLOR.mut }}>
          {d.preseasonWeek === null ? 'Evaluate the roster. Make every place count.'
            : `Preseason week ${String(d.preseasonWeek)} of ${String(d.preseasonWeeks)}`}
        </p>
      </Panel>
      <StatTiles stats={[
        { label: 'In camp', value: `${String(d.rosterCount)} / ${String(d.campLimit)}` },
        { label: 'Target', value: String(d.rosterLimit) },
        { label: 'To cut', value: String(d.cutsRemaining), tone: 'accent' },
      ]} />
      {!d.limitEnforced && <p style={{ ...TYPE.prose, margin: 0, color: COLOR.amber }}>Commissioner mode: the roster target is advisory.</p>}
      <p style={{ ...TYPE.prose, margin: 0, color: COLOR.mut }}>
        {d.progress.deadline} Next phase: {d.progress.nextPhaseLabel}.
      </p>
      {d.nextOpponentName !== null && <p style={{ ...TYPE.prose, margin: 0 }}>
        Next preseason game: {d.nextOpponentName} · Week {d.nextPreseasonWeek}
      </p>}
    </div>
  );
}

export function CampOverview({ data: d, onGroup }: {
  readonly data: CampOut; readonly onGroup: (group: string) => void;
}) {
  return (
    <>
      <SectionHeader title="Camp overview" />
      <StatTiles stats={[
        { label: 'Battles', value: String(d.battleCount) },
        { label: 'Injured', value: String(d.injuredCount) },
      ]} />
      <TermLine label="Cap space" value={d.capSpace === null ? 'Unavailable' : money(d.capSpace)} />
      <SectionHeader title="Position groups" />
      <p style={{ ...TYPE.prose, color: COLOR.mut }}>Select a room to compare players. Staff projections are estimates, not position limits.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: S[2] }}>
        {d.groups.map((g) => (
          <button key={g.group} type="button" onClick={() => { onGroup(g.group); }}
            aria-label={`Compare ${g.group}`} style={{ padding: S[2], minHeight: 90,
              background: COLOR.panel, border: `1px solid ${COLOR.line2}`, borderRadius: 10,
              color: COLOR.tx, textAlign: 'left', cursor: 'pointer', minWidth: 0 }}>
            <strong style={{ display: 'block', color: COLOR.amber }}>{g.group}</strong>
            <span style={{ display: 'block', fontSize: 12, marginTop: S[1] }}>{g.count} players</span>
            <span style={{ display: 'block', fontSize: 11, color: COLOR.mut }}>{g.projectedPlaces} projected places</span>
            <span style={{ display: 'block', fontSize: 11, color: COLOR.mut }}>{g.battles} battles</span>
          </button>
        ))}
      </div>
      <SectionHeader title="Notable movers" />
      <Panel>
        {d.movers.length === 0 ? <EmptyState title="No notable movement yet"
          detail="Preseason appearances can change the staff’s assessment. Small differences are not treated as a new verdict." />
          : d.movers.map((p) => (
            <div key={p.playerId} style={{ display: 'flex', alignItems: 'center', gap: S[2], justifyContent: 'space-between' }}>
              <EntityLink to={{ kind: 'player', id: p.playerId }}>{p.name} · {p.position}</EntityLink>
              <Pill text={`${p.trend === 'RISER' ? 'Rising +' : 'Falling '}${String(p.gradeDelta)}`} tone={p.trend === 'RISER' ? 'good' : 'warn'} />
            </div>
          ))}
      </Panel>
      <CampFixtures data={d} />
    </>
  );
}

export function CampFixtures({ data: d }: { readonly data: CampOut }) {
  return (
    <>
      <SectionHeader title="Preseason" />
      <Panel>
        <p style={{ ...TYPE.prose, marginTop: 0 }}>Record: {d.preseasonRecord.wins}–{d.preseasonRecord.losses}–{d.preseasonRecord.ties}</p>
        {d.nextOpponentName === null ? <p style={{ ...TYPE.prose, color: COLOR.mut }}>No upcoming preseason fixture.</p>
          : <p style={{ ...TYPE.prose }}>Next: {d.nextOpponentName} · Week {d.nextPreseasonWeek}</p>}
        {d.fixtures.length === 0 ? <EmptyState title="No preseason fixtures yet" detail="The schedule is written when the preseason opens." />
          : d.fixtures.map((f) => (
            <div key={f.gameId} style={{ borderTop: `1px solid ${COLOR.line}`, paddingBlock: S[2] }}>
              <div style={{ ...TYPE.micro, color: COLOR.mut }}>Week {f.week} · {f.home ? 'Home' : 'Away'}</div>
              <div style={{ ...TYPE.prose }}>{f.opponentName}</div>
              {f.result === null ? <span style={{ color: COLOR.mut, fontSize: 12 }}>{f.status === 'FINAL' ? 'Result unavailable' : 'Not played'}</span>
                : <EntityLink to={{ kind: 'game', id: f.gameId }}>
                  {f.result} · {f.ourScore}–{f.theirScore} · View game
                </EntityLink>}
            </div>
          ))}
        <p style={{ ...TYPE.prose, fontSize: 12, color: COLOR.mut, marginBottom: 0 }}>Preseason results stay separate from season standings and records.</p>
      </Panel>
    </>
  );
}
