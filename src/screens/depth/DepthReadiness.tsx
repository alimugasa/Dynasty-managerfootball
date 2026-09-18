import { COLOR, S, TYPE } from '../../app/tokens';
import { Panel } from '../../components/Surface';
import { EntityLink } from '../../components/EntityLink';
import type { DepthChartOut } from '../../../supabase/functions/_shared/api/reads/depthChartTypes';

export function DepthReadiness({ data: d }: { readonly data: DepthChartOut }) {
  return <section aria-label="Roster readiness" data-testid="depth-readiness">
    <Panel>
      <h2 style={{ ...TYPE.heading, marginTop: 0 }}>{d.action === 'FINALIZE' || (d.phase === 'REGULAR_SEASON' && d.week === 1)
        ? 'Week 1 readiness' : 'Roster readiness'}</h2>
      <dl style={{ ...TYPE.prose, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: S[2], margin: 0 }}>
        <dt>Roster</dt><dd style={{ margin: 0 }}>{d.rosterCount} / {d.rosterTarget}</dd>
        <dt>Opening count</dt><dd style={{ margin: 0 }}>{!d.countEnforced ? 'Advisory · commissioner' : d.rosterFault === null ? 'Met' : 'Not met'}</dd>
        <dt>Depth order</dt><dd style={{ margin: 0 }}>{d.chartSaved ? 'Saved' : 'Review needed'}</dd>
        <dt>Starting places</dt><dd style={{ margin: 0 }}>{d.startersSet} / {d.startingPlaces}</dd>
        <dt>Injured starters</dt><dd style={{ margin: 0 }}>{d.injuredStarters}</dd>
      </dl>
      <p style={{ ...TYPE.prose, color: d.blockers.length > 0 ? COLOR.amber : COLOR.teal }} data-testid="depth-entry-status">
        {d.blockers.length > 0 ? 'Season entry blocked' : d.action === 'CAMP' ? 'Complete camp before opening week 1'
          : d.action === 'OFFSEASON' ? 'Continue the offseason' : d.warnings.length > 0 ? 'Permitted with advisory warnings' : 'Ready to continue'}
      </p>
      {d.blockers.map((b) => <p role="alert" key={b} style={{ ...TYPE.prose, color: COLOR.amber }}>{b}</p>)}
      <p style={{ ...TYPE.prose, color: COLOR.mut, fontSize: 12 }}>
        Camp finalization checks the opening roster count. Depth gaps and injuries are advisory.
        The server rechecks when you confirm. Saving order never plays a game.
      </p>
      {d.nextGame === null ? <p style={{ ...TYPE.prose, fontSize: 12 }}>No upcoming fixture on file.</p>
        : <div style={{ ...TYPE.prose, fontSize: 13 }}>
          Next {d.nextGame.competition === 'PLAYOFF' ? 'postseason' : 'regular-season'} game · Week {d.nextGame.week}<br />
          {d.nextGame.home ? 'Home vs ' : 'Away at '}
          <EntityLink to={{ kind: 'team', id: d.nextGame.opponentId }}>{d.nextGame.opponentName}</EntityLink>
        </div>}
    </Panel>
    {d.warnings.length > 0 && <details style={{ marginTop: S[2] }}>
      <summary style={{ ...TYPE.prose, minHeight: 44, cursor: 'pointer' }}>Advisory warnings ({d.warnings.length})</summary>
      <ul style={{ ...TYPE.prose, fontSize: 12, paddingLeft: S[4] }}>{d.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
    </details>}
  </section>;
}
