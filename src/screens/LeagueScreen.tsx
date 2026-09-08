// League: standings and leaders.

import { COLOR } from '../app/tokens';
import { useNavigator } from '../app/navigation';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { ChipRow, type Chip } from '../components/ChipRow';
import { TableScroll } from '../components/TableScroll';
import { EmptyState, Panel, SectionHeader } from '../components/Surface';
import { ListRow } from '../components/ListRow';
import { Loading, NoDynasty, QueryError } from '../components/QueryState';
import { useUiState } from '../app/useUiState';
import { Screen } from './Screen';
import type { LeagueOut } from '../../supabase/functions/_shared/api/reads/league';

const CONFERENCES: readonly Chip[] = [
  { key: 'all', label: 'All' },
  { key: 'AC', label: 'American' },
  { key: 'NC', label: 'National' },
];

const recordOf = (s: { wins: number; losses: number; ties: number }): string =>
  `${String(s.wins)}-${String(s.losses)}${s.ties > 0 ? `-${String(s.ties)}` : ''}`;

export function LeagueScreen() {
  const nav = useNavigator();
  const [conference, setConference] = useUiState('conference', 'all');
  const { save, loaded, loadError, clubsById, version } = useSave();
  const q = useQuery<LeagueOut>('league', { saveId: save?.saveId ?? '' }, version, save !== null);

  const th = { textAlign: 'left' as const, color: COLOR.mut, fontSize: 11, padding: '6px 8px', whiteSpace: 'nowrap' as const };
  const td = { color: COLOR.tx, fontSize: 13, padding: '6px 8px', whiteSpace: 'nowrap' as const };

  return (
    <Screen title="League" subtitle={save === null ? '' : String(save.season)} screen="league">
      {loadError !== null && <QueryError error={loadError} />}
      {loaded && save === null && <NoDynasty />}
      {save !== null && (
        <>
          <div style={{ marginTop: 8 }}>
            <ChipRow chips={CONFERENCES} value={conference} onChange={setConference} label="Conference" />
          </div>

          <SectionHeader title="Standings" />
          {q.status === 'error' && <QueryError error={q.error} />}
          {q.status === 'loading' && <Loading label="Loading standings" rows={8} />}
          {q.status === 'ready' && (
            <>
              <Panel padded={false}>
                <div style={{ padding: 12 }}>
                  <TableScroll>
                    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                      <thead>
                        <tr>
                          <th style={th}>Club</th><th style={th}>W-L</th><th style={th}>GP</th>
                          <th style={th}>PF</th><th style={th}>PA</th><th style={th}>Diff</th>
                        </tr>
                      </thead>
                      <tbody data-testid="standings-body">
                        {q.data.standings
                          .filter((s) => conference === 'all' || s.conferenceId === conference)
                          .map((s) => (
                            <tr key={s.teamId} style={{ borderTop: `1px solid ${COLOR.line}` }}>
                              <td style={{ ...td, color: s.teamId === save.userTeamId ? COLOR.amber : COLOR.tx }}>
                                {clubsById.get(s.teamId)?.nickname ?? s.teamId}
                              </td>
                              <td style={td}>{recordOf(s)}</td>
                              <td style={td}>{s.played}</td>
                              <td style={td}>{s.pointsFor}</td>
                              <td style={td}>{s.pointsAgainst}</td>
                              <td style={td}>{s.pointsFor - s.pointsAgainst}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </TableScroll>
                </div>
              </Panel>

              <SectionHeader title="Leaders" />
              {q.data.gamesPlayed === 0 ? (
                <EmptyState title="No games played yet" detail="Leaders appear once a week has been simulated." />
              ) : (
                <Panel padded={false}>
                  <div style={{ padding: '0 12px' }}>
                    {([['pass', 'Passing'], ['rush', 'Rushing'], ['rec', 'Receiving']] as const)
                      .map(([key, label]) => {
                        const top = q.data.leaders[key][0];
                        if (top === undefined) return null;
                        return (
                          <ListRow
                            key={key}
                            title={top.name}
                            subtitle={`${label} · ${top.group}`}
                            trailing={<span style={{ color: COLOR.amber, fontSize: 13 }}>{String(top.value)} yds</span>}
                            navigable
                            onSelect={() => { nav.push('player', { id: top.playerId }); }}
                          />
                        );
                      })}
                  </div>
                </Panel>
              )}
            </>
          )}
        </>
      )}
    </Screen>
  );
}
