import { COLOR, S, TYPE } from '../../app/tokens';
import { useNavigator } from '../../app/navigation';
import { useLeagueIntelligence } from '../../hooks/useLeagueIntelligence';
import { useSave } from '../../app/SaveProvider';
import { Panel, EmptyState } from '../../components/Surface';
import { Loading, QueryError } from '../../components/QueryState';
import { ActionButton } from '../../components/ActionButton';
import { Screen } from '../Screen';

export function TeamRankSummary({ teamId }: { readonly teamId: string }) {
  const q = useLeagueIntelligence(); const nav = useNavigator();
  if (q.status === 'error') return <QueryError error={q.error} onRetry={q.retry} />;
  if (q.status !== 'ready') return <Loading label="Loading team ranks" rows={1} />;
  const rows = ['offense', 'defense', 'scoring'].map((key) => {
    const board = q.data.rankings.find((b) => b.key === key);
    const row = board?.rows.find((r) => r.teamId === teamId);
    return board === undefined || row === undefined ? null : { board, row };
  }).filter((r) => r !== null);
  if (rows.length !== 3) return <EmptyState title="Team rank data unavailable" />;
  return <Panel>
    <h2 style={{ ...TYPE.micro, marginTop: 0 }}>Regular-season performance ranks</h2>
    <div style={{ display: 'flex', gap: S[4], flexWrap: 'wrap' }}>
      {rows.map(({ board, row }) => <div key={board.key} style={TYPE.prose}>
        <strong>{row.rank === null ? 'Unranked' : '#' + String(row.rank)}</strong><br />
        <span style={{ color: COLOR.mut, fontSize: 12 }}>{board.label}</span>
      </div>)}
    </div>
    <ActionButton tone="quiet" onClick={() => { nav.push('teamRankings'); }}>Compare league rankings</ActionButton>
  </Panel>;
}

/** EntityLink already routes team ids here. Keep opponent visits read-only;
 * the management dashboard remains scoped to the user's franchise. */
export function LeagueTeamScreen({ teamId }: { readonly teamId: string }) {
  const { clubsById, loaded, loadError } = useSave();
  const team = clubsById.get(teamId);
  return <Screen title={team?.name ?? 'Team'} screen="team">
    {loadError !== null ? <QueryError error={loadError} /> : !loaded ? <Loading label="Loading team" /> : team === undefined ? <EmptyState title="Team not found" />
      : <TeamRankSummary teamId={teamId} />}
  </Screen>;
}
