// League: standings and leaders.

import { COLOR } from '../app/tokens';
import { useNavigator } from '../app/navigation';
import { ChipRow, type Chip } from '../components/ChipRow';
import { TableScroll } from '../components/TableScroll';
import { EmptyState, Panel, SectionHeader } from '../components/Surface';
import { ListRow } from '../components/ListRow';
import { useUiState } from '../app/useUiState';
import { useGame } from '../game/GameProvider';
import { recordOf } from '../game/store';
import { Screen } from './Screen';

const CONFERENCES: readonly Chip[] = [
  { key: 'all', label: 'All' },
  { key: 'AC', label: 'American' },
  { key: 'NC', label: 'National' },
];

export function LeagueScreen() {
  const nav = useNavigator();
  const [conference, setConference] = useUiState('conference', 'all');
  const { state } = useGame();

  const rows = [...state.standings.values()]
    .filter((s) => conference === 'all'
      || state.identities.get(s.teamId)?.conferenceId === conference)
    .sort((a, b) => {
      const pctA = a.wins / Math.max(1, a.wins + a.losses + a.ties);
      const pctB = b.wins / Math.max(1, b.wins + b.losses + b.ties);
      return pctB - pctA || (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst);
    });

  const totals = new Map<string, { name: string; teamId: string; pass: number; rush: number; rec: number }>();
  for (const game of state.results) {
    for (const line of game.players) {
      const running = totals.get(line.playerId)
        ?? { name: line.playerId, teamId: '', pass: 0, rush: 0, rec: 0 };
      running.pass += line.passYards;
      running.rush += line.rushYards;
      running.rec += line.receivingYards;
      totals.set(line.playerId, running);
    }
  }
  const byId = new Map(state.league.players.map((p) => [p.id, p]));
  const leaders = (key: 'pass' | 'rush' | 'rec') => [...totals.entries()]
    .map(([id, t]) => ({ id, value: t[key], player: byId.get(id) }))
    .filter((e) => e.value > 0 && e.player !== undefined)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const th = { textAlign: 'left' as const, color: COLOR.mut, fontSize: 11, padding: '6px 8px', whiteSpace: 'nowrap' as const };
  const td = { color: COLOR.tx, fontSize: 13, padding: '6px 8px', whiteSpace: 'nowrap' as const };

  return (
    <Screen title="League" subtitle={String(state.season)} screen="league">
      <div style={{ marginTop: 8 }}>
        <ChipRow chips={CONFERENCES} value={conference} onChange={setConference} label="Conference" />
      </div>

      <SectionHeader title="Standings" />
      <Panel padded={false}>
        <div style={{ padding: 12 }}>
          <TableScroll>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={th}>Club</th><th style={th}>W-L</th>
                  <th style={th}>PF</th><th style={th}>PA</th><th style={th}>Diff</th>
                </tr>
              </thead>
              <tbody data-testid="standings-body">
                {rows.map((s) => (
                  <tr key={s.teamId} style={{ borderTop: `1px solid ${COLOR.line}` }}>
                    <td style={{ ...td, color: s.teamId === state.userTeamId ? COLOR.amber : COLOR.tx }}>
                      {state.identities.get(s.teamId)?.nickname ?? s.teamId}
                    </td>
                    <td style={td}>{recordOf(s)}</td>
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
      {state.results.length === 0 ? (
        <EmptyState title="No games played yet" detail="Leaders appear once a week has been simulated." />
      ) : (
        <Panel padded={false}>
          <div style={{ padding: '0 12px' }}>
            {([['pass', 'Passing'], ['rush', 'Rushing'], ['rec', 'Receiving']] as const)
              .map(([key, label]) => {
                const top = leaders(key)[0];
                if (top === undefined) return null;
                return (
                  <ListRow
                    key={key}
                    title={top.player?.name ?? top.id}
                    subtitle={`${label} · ${top.player?.group ?? ''}`}
                    trailing={<span style={{ color: COLOR.amber, fontSize: 13 }}>{String(top.value)} yds</span>}
                    navigable
                    onSelect={() => { nav.push('player', { id: top.id }); }}
                  />
                );
              })}
          </div>
        </Panel>
      )}
    </Screen>
  );
}
