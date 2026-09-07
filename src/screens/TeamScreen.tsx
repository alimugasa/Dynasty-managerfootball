// Team: the club you manage, and the button that advances the game.

import { COLOR } from '../app/tokens';
import { useNavigator } from '../app/navigation';
import { Caption, EmptyState, Panel, SectionHeader } from '../components/Surface';
import { ListRow } from '../components/ListRow';
import { StatTiles } from '../components/StatTiles';
import { TeamMark } from '../components/TeamMark';
import { ActionButton } from '../game/Button';
import { useGame } from '../game/GameProvider';
import { WEEKS, recordOf, squadOf } from '../game/store';
import { Screen } from './Screen';

export function TeamScreen() {
  const nav = useNavigator();
  const { state, busy, notice, simWeek, simSeason, nextSeason } = useGame();
  const identity = state.identities.get(state.userTeamId);
  const standing = state.standings.get(state.userTeamId);
  const squad = squadOf(state, state.userTeamId);

  const done = state.phase === 'OFFSEASON';
  const played = state.results.filter(
    (g) => g.homeTeamId === state.userTeamId || g.awayTeamId === state.userTeamId);
  const last = played[played.length - 1];
  const next = state.schedule.find(
    (f) => f.week === state.week
      && (f.homeTeamId === state.userTeamId || f.awayTeamId === state.userTeamId));

  return (
    <Screen
      title={identity?.nickname ?? 'Team'}
      subtitle={`${String(state.season)} · ${done ? 'Season complete' : `Week ${String(state.week)} of ${String(WEEKS)}`}`}
      screen="team"
    >
      <Panel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <TeamMark
            abbreviation={state.userTeamId}
            primary={identity?.primary ?? '#28353F'}
            secondary={identity?.secondary ?? '#8698A8'}
            size={48}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: COLOR.tx, fontSize: 16, fontWeight: 600 }}>
              {identity?.name ?? state.userTeamId}
            </div>
            <div style={{ color: COLOR.mut, fontSize: 12 }}>
              {recordOf(standing)} · {squad.length} players
            </div>
          </div>
        </div>
      </Panel>

      <div style={{ marginTop: 10 }}>
        <StatTiles
          stats={[
            { label: 'Record', value: recordOf(standing) },
            { label: 'Points for', value: String(standing?.pointsFor ?? 0) },
            { label: 'Against', value: String(standing?.pointsAgainst ?? 0) },
          ]}
        />
      </div>

      {notice !== null && (
        <p
          data-testid="notice"
          style={{
            margin: '10px 0 0', padding: '8px 10px', borderRadius: 8,
            background: 'rgba(226,87,76,0.12)', border: `1px solid ${COLOR.red}`,
            color: COLOR.tx, fontSize: 12, lineHeight: 1.5,
          }}
        >
          {notice}
        </p>
      )}

      <SectionHeader title={done ? 'Offseason' : 'Advance'} />
      <div style={{ display: 'grid', gap: 8 }}>
        {done ? (
          <ActionButton onClick={nextSeason} disabled={busy} testId="next-season">
            {busy ? 'Running offseason…' : `Run offseason → ${String(state.season + 1)}`}
          </ActionButton>
        ) : (
          <>
            <ActionButton onClick={simWeek} disabled={busy} testId="sim-week">
              {busy ? 'Simulating…' : `Sim week ${String(state.week)}`}
            </ActionButton>
            <ActionButton onClick={simSeason} disabled={busy} tone="quiet" testId="sim-season">
              Sim to end of season
            </ActionButton>
          </>
        )}
      </div>

      <SectionHeader title="This week" />
      {next === undefined ? (
        <EmptyState
          title={done ? 'Regular season complete' : 'No fixture this week'}
          {...(done ? { detail: 'Run the offseason to start the next year.' } : {})}
        />
      ) : (
        <Panel padded={false}>
          <div style={{ padding: '0 12px' }}>
            <ListRow
              title={
                next.homeTeamId === state.userTeamId
                  ? `vs ${state.identities.get(next.awayTeamId)?.nickname ?? next.awayTeamId}`
                  : `at ${state.identities.get(next.homeTeamId)?.nickname ?? next.homeTeamId}`
              }
              subtitle={`Week ${String(next.week)}`}
            />
          </div>
        </Panel>
      )}

      <SectionHeader title="Last result" />
      {last === undefined ? (
        <EmptyState title="No games played yet" detail="Sim a week to see a result here." />
      ) : (
        <Panel padded={false}>
          <div style={{ padding: '0 12px' }}>
            <ListRow
              title={`${state.identities.get(last.awayTeamId)?.nickname ?? last.awayTeamId} ${String(last.awayScore)} — ${String(last.homeScore)} ${state.identities.get(last.homeTeamId)?.nickname ?? last.homeTeamId}`}
              subtitle={`Week ${String(last.week)}`}
              navigable
              onSelect={() => { nav.push('game', { id: last.gameId }); }}
            />
          </div>
        </Panel>
      )}

      <SectionHeader title="Squad" />
      <Panel padded={false}>
        <div style={{ padding: '0 12px' }}>
          {squad.slice(0, 5).map((p) => (
            <ListRow
              key={p.id}
              title={p.name}
              subtitle={`${p.group} · age ${String(p.age)}`}
              trailing={<Caption>{String(Math.round(p.ability))}</Caption>}
              navigable
              onSelect={() => { nav.push('player', { id: p.id }); }}
            />
          ))}
        </div>
      </Panel>
    </Screen>
  );
}
