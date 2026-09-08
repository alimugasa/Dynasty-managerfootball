// Team: the club you manage, and the button that advances the game.

import { COLOR } from '../app/tokens';
import { useNavigator } from '../app/navigation';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { Caption, EmptyState, Panel, SectionHeader } from '../components/Surface';
import { ListRow } from '../components/ListRow';
import { StatTiles } from '../components/StatTiles';
import { TeamMark } from '../components/TeamMark';
import { ActionButton } from '../components/ActionButton';
import { Loading, QueryError } from '../components/QueryState';
import { NewDynasty } from './NewDynasty';
import { Screen } from './Screen';
import type { TeamOut } from '../../supabase/functions/_shared/api/reads/team';
import type { PlayoffsOut } from '../../supabase/functions/_shared/api/reads/playoffs';

const recordOf = (s: { wins: number; losses: number; ties: number } | null): string =>
  s === null ? '—' : `${String(s.wins)}-${String(s.losses)}${s.ties > 0 ? `-${String(s.ties)}` : ''}`;

export function TeamScreen() {
  const nav = useNavigator();
  const { save, loaded, loadError, clubsById, version, busy, notice, simWeek, simSeason, nextSeason } = useSave();
  const q = useQuery<TeamOut>('team', { saveId: save?.saveId ?? '' }, version, save !== null);
  // The bracket is only asked for once there is one: through the regular
  // season this stays unfetched.
  const post = useQuery<PlayoffsOut>(
    'playoffs', { saveId: save?.saveId ?? '' }, version,
    save !== null && save.phase !== 'REGULAR_SEASON');

  if (loadError !== null) return <Screen title="Team" screen="team"><QueryError error={loadError} /></Screen>;
  if (!loaded) return <Screen title="Team" screen="team"><Loading label="Loading dynasty" /></Screen>;
  if (save === null) return <Screen title="Team" subtitle="New dynasty" screen="team"><NewDynasty /></Screen>;

  const identity = clubsById.get(save.userTeamId);
  const done = save.phase === 'OFFSEASON';
  const inPlayoffs = save.phase === 'PLAYOFFS';
  const roundLabel = post.status === 'ready' ? post.data.nextLabel : null;
  const champion = post.status === 'ready' ? post.data.champion : null;
  const stillIn = post.status === 'ready'
    && post.data.games.some((g) => g.homeScore === null
      && (g.homeTeamId === save.userTeamId || g.awayTeamId === save.userTeamId));
  const nickname = (id: string): string => clubsById.get(id)?.nickname ?? id;
  const fullName = (id: string): string => clubsById.get(id)?.name ?? id;
  const ordinal = (n: number): string => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return `${String(n)}${s[(v - 20) % 10] ?? s[v] ?? s[0] ?? 'th'}`;
  };

  return (
    <Screen
      title={identity?.nickname ?? 'Team'}
      subtitle={`${String(save.season)} · ${done
        ? `Season complete${q.status === 'ready' && q.data.rank !== null ? ` · finished ${ordinal(q.data.rank)} of 32` : ''}`
        : inPlayoffs
          ? (roundLabel ?? 'Playoffs')
          : `Week ${String(save.week)} of ${String(save.weeks)}`}`}
      screen="team"
    >
      {q.status === 'error' && <QueryError error={q.error} />}
      {q.status === 'loading' && <Loading label="Loading club" />}
      {q.status === 'ready' && (
        <>
          <Panel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <TeamMark
                abbreviation={save.userTeamId}
                primary={identity?.primary ?? '#28353F'}
                secondary={identity?.secondary ?? '#8698A8'}
                size={48}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: COLOR.tx, fontSize: 16, fontWeight: 600 }}>
                  {identity?.name ?? save.userTeamId}
                </div>
                <div style={{ color: COLOR.mut, fontSize: 12 }}>
                  {recordOf(q.data.standing)} · {q.data.squadSize} players
                </div>
              </div>
            </div>
          </Panel>

          <div style={{ marginTop: 10 }}>
            <StatTiles
              stats={[
                { label: 'Record', value: recordOf(q.data.standing) },
                { label: 'Points for', value: q.data.standing === null ? '—' : String(q.data.standing.pointsFor) },
                { label: 'Against', value: q.data.standing === null ? '—' : String(q.data.standing.pointsAgainst) },
              ]}
            />
          </div>
        </>
      )}

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

      <SectionHeader title={done ? 'Offseason' : inPlayoffs ? 'Playoffs' : 'Advance'} />
      <div style={{ display: 'grid', gap: 8 }}>
        {done ? (
          <>
            <ActionButton onClick={() => { void nextSeason(); }} disabled={busy !== null} testId="next-season">
              {busy ?? `Run offseason → ${String(save.season + 1)}`}
            </ActionButton>
            <ActionButton
              onClick={() => { nav.push('playoffs'); }}
              tone="quiet"
              testId="view-bracket"
            >
              {champion === null ? 'See the bracket' : `See how ${nickname(champion)} won it`}
            </ActionButton>
          </>
        ) : inPlayoffs ? (
          <>
            <ActionButton onClick={() => { void simWeek(); }} disabled={busy !== null} testId="sim-week">
              {busy ?? `Play the ${roundLabel ?? 'next round'}`}
            </ActionButton>
            <ActionButton onClick={() => { nav.push('playoffs'); }} tone="quiet" testId="view-bracket">
              {stillIn ? 'See the bracket' : 'See the bracket · your club is out'}
            </ActionButton>
          </>
        ) : (
          <>
            <ActionButton onClick={() => { void simWeek(); }} disabled={busy !== null} testId="sim-week">
              {busy ?? `Sim week ${String(save.week)}`}
            </ActionButton>
            <ActionButton onClick={() => { void simSeason(); }} disabled={busy !== null} tone="quiet" testId="sim-season">
              Sim to end of season
            </ActionButton>
          </>
        )}
      </div>

      {q.status === 'ready' && (
        <>
          <SectionHeader title={inPlayoffs ? 'This round' : 'This week'} />
          {q.data.next === null ? (
            <EmptyState
              title={done ? 'The season is over' : inPlayoffs ? 'Nothing to play this round' : 'No fixture this week'}
              {...(done ? { detail: 'Run the offseason to start the next year.' } : {})}
              {...(inPlayoffs && !stillIn ? { detail: 'Your club is not in the bracket. Play it out to see who takes it.' } : {})}
            />
          ) : (
            <Panel padded={false}>
              <div style={{ padding: '0 12px' }}>
                <ListRow
                  title={q.data.next.homeTeamId === save.userTeamId
                    ? `vs ${fullName(q.data.next.awayTeamId)}`
                    : `at ${fullName(q.data.next.homeTeamId)}`}
                  subtitle={q.data.next.round ?? `Week ${String(q.data.next.week)}`}
                />
              </div>
            </Panel>
          )}

          <SectionHeader title="Last result" />
          {q.data.last === null ? (
            <EmptyState title="No games played yet" detail="Sim a week to see a result here." />
          ) : (
            <Panel padded={false}>
              <div style={{ padding: '0 12px' }}>
                <ListRow
                  title={`${nickname(q.data.last.awayTeamId)} ${String(q.data.last.awayScore)} — ${String(q.data.last.homeScore)} ${nickname(q.data.last.homeTeamId)}`}
                  subtitle={q.data.last.round ?? `Week ${String(q.data.last.week)}`}
                  navigable
                  onSelect={() => { nav.push('game', { id: q.data.last?.gameId ?? '' }); }}
                />
              </div>
            </Panel>
          )}

          <SectionHeader title="Squad" />
          <Panel padded={false}>
            <div style={{ padding: '0 12px' }}>
              {q.data.squad.map((p) => (
                <ListRow
                  key={p.playerId}
                  title={p.name}
                  subtitle={`${p.group} · age ${String(p.age)}`}
                  trailing={<Caption>{String(p.overall)}</Caption>}
                  navigable
                  onSelect={() => { nav.push('player', { id: p.playerId }); }}
                />
              ))}
            </div>
          </Panel>
        </>
      )}
    </Screen>
  );
}
