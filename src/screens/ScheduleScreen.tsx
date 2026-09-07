// Schedule: the season, week by week. Played weeks show scores.

import { COLOR } from '../app/tokens';
import { useNavigator } from '../app/navigation';
import { ChipRow, type Chip } from '../components/ChipRow';
import { EmptyState, Panel, SectionHeader } from '../components/Surface';
import { ListRow } from '../components/ListRow';
import { useUiState } from '../app/useUiState';
import { useGame } from '../game/GameProvider';
import { WEEKS } from '../game/store';
import { Screen } from './Screen';

const WEEK_CHIPS: readonly Chip[] = Array.from(
  { length: WEEKS }, (_, i) => ({ key: String(i + 1), label: `Wk ${String(i + 1)}` }));

export function ScheduleScreen() {
  const nav = useNavigator();
  const { state } = useGame();
  const current = Math.min(state.week, WEEKS);
  const [week, setWeek] = useUiState('week', String(current));
  const shown = Number(week) || current;

  const fixtures = state.schedule.filter((f) => f.week === shown);
  const played = new Map(
    state.results.filter((g) => g.week === shown)
      .map((g) => [`${g.homeTeamId}|${g.awayTeamId}`, g]));

  const name = (id: string) => state.identities.get(id)?.nickname ?? id;

  return (
    <Screen title="Schedule" subtitle={String(state.season)} screen="schedule">
      <div style={{ marginTop: 8 }}>
        <ChipRow chips={WEEK_CHIPS} value={week} onChange={setWeek} label="Week" />
      </div>

      <SectionHeader title={`Week ${String(shown)}`} />
      {fixtures.length === 0 ? (
        <EmptyState title="No fixtures this week" />
      ) : (
        <Panel padded={false}>
          <div style={{ padding: '0 12px' }} data-testid="fixture-list">
            {fixtures.map((f) => {
              const game = played.get(`${f.homeTeamId}|${f.awayTeamId}`);
              const involvesUser = f.homeTeamId === state.userTeamId
                || f.awayTeamId === state.userTeamId;
              return (
                <ListRow
                  key={`${f.homeTeamId}-${f.awayTeamId}`}
                  title={`${name(f.awayTeamId)} at ${name(f.homeTeamId)}`}
                  {...(involvesUser ? { subtitle: 'Your club' } : {})}
                  trailing={
                    game === undefined
                      ? <span style={{ color: COLOR.dim, fontSize: 12 }}>—</span>
                      : (
                        <span style={{ color: COLOR.tx, fontSize: 13 }}>
                          {String(game.awayScore)}–{String(game.homeScore)}
                        </span>
                      )
                  }
                  navigable={game !== undefined}
                  {...(game === undefined
                    ? {}
                    : { onSelect: () => { nav.push('game', { id: game.gameId }); } })}
                />
              );
            })}
          </div>
        </Panel>
      )}
    </Screen>
  );
}
