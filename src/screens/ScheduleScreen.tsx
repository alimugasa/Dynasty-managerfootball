// Schedule: the season, week by week. Played weeks show scores.

import { COLOR } from '../app/tokens';
import { useNavigator } from '../app/navigation';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { ChipRow, type Chip } from '../components/ChipRow';
import { EmptyState, Panel, SectionHeader } from '../components/Surface';
import { ListRow } from '../components/ListRow';
import { Loading, NoDynasty, QueryError } from '../components/QueryState';
import { useUiState } from '../app/useUiState';
import { Screen } from './Screen';
import type { ScheduleOut } from '../../supabase/functions/_shared/api/reads/schedule';

export function ScheduleScreen() {
  const nav = useNavigator();
  const { save, loaded, loadError, clubsById, version } = useSave();
  const weeks = save?.weeks ?? 0;
  const current = save === null ? 1 : Math.min(save.week, weeks);
  const [week, setWeek] = useUiState('week', String(current));
  const shown = Number(week) || current;
  const q = useQuery<ScheduleOut>(
    'schedule', { saveId: save?.saveId ?? '', week: shown }, version, save !== null);

  // The regular season's weeks are known from the start; a playoff week
  // appears once the bracket has written it.
  const playoffChips: readonly Chip[] = q.status === 'ready'
    ? q.data.playoffWeeks.map((p) => ({ key: String(p.week), label: p.label }))
    : [];
  const chips: readonly Chip[] = [
    ...Array.from({ length: weeks }, (_, i) => ({ key: String(i + 1), label: `Wk ${String(i + 1)}` })),
    ...playoffChips,
  ];
  const name = (id: string) => clubsById.get(id)?.nickname ?? id;

  return (
    <Screen title="Schedule" subtitle={save === null ? '' : String(save.season)} screen="schedule">
      {loadError !== null && <QueryError error={loadError} />}
      {loaded && save === null && <NoDynasty />}
      {save !== null && (
        <>
          <div style={{ marginTop: 8 }}>
            <ChipRow chips={chips} value={week} onChange={setWeek} label="Week" />
          </div>

          <SectionHeader title={q.status === 'ready' && q.data.round !== null
            ? (playoffChips.find((c) => c.key === String(shown))?.label ?? `Week ${String(shown)}`)
            : `Week ${String(shown)}`}
          />
          {q.status === 'error' && <QueryError error={q.error} />}
          {q.status === 'loading' && <Loading label="Loading fixtures" rows={8} />}
          {q.status === 'ready' && q.data.fixtures.length === 0 && <EmptyState title="No fixtures this week" />}
          {q.status === 'ready' && q.data.fixtures.length > 0 && (
            <Panel padded={false}>
              <div style={{ padding: '0 12px' }} data-testid="fixture-list">
                {q.data.fixtures.map((f) => {
                  const played = f.homeScore !== null && f.awayScore !== null;
                  const involvesUser = f.homeTeamId === save.userTeamId || f.awayTeamId === save.userTeamId;
                  return (
                    <ListRow
                      key={f.gameId}
                      title={`${name(f.awayTeamId)} ${q.data.round === 'LEAGUE_FINAL' ? 'v' : 'at'} ${name(f.homeTeamId)}`}
                      {...(involvesUser ? { subtitle: 'Your club' } : {})}
                      trailing={played
                        ? <span style={{ color: COLOR.tx, fontSize: 13 }}>{String(f.awayScore)}–{String(f.homeScore)}</span>
                        : <span style={{ color: COLOR.dim, fontSize: 12 }}>—</span>}
                      navigable={played}
                      {...(played ? { onSelect: () => { nav.push('game', { id: f.gameId }); } } : {})}
                    />
                  );
                })}
              </div>
            </Panel>
          )}
        </>
      )}
    </Screen>
  );
}
