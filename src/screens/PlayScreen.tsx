// Play: the week, and the button that ends it.
//
// The one tab that moves the season on, which is why it is the one in the
// middle of the bar. Everything here is about the next seven days: who you
// play, what happened last time, and the control that advances the clock --
// whether that is a week, a playoff round, or a whole offseason.
//
// It used to live at the bottom of Team, under a hero and a roster list, which
// put the most-used control in the product below the fold on a phone.

import { COLOR, R, S, TYPE } from '../app/tokens';
import { useNavigator } from '../app/navigation';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { EmptyState, Panel, SectionHeader } from '../components/Surface';
import { ListRow } from '../components/ListRow';
import { ActionButton } from '../components/ActionButton';
import { Loading, NoDynasty, QueryError } from '../components/QueryState';
import { isOffseasonPhase } from '../domain/phase';
import { HubCard, HubStack, NotBuilt } from './hubCards';
import { Screen } from './Screen';
import type { TeamOut } from '../../supabase/functions/_shared/api/reads/team';
import type { PlayoffsOut } from '../../supabase/functions/_shared/api/reads/playoffs';

export function PlayScreen() {
  const nav = useNavigator();
  const {
    save, loaded, loadError, clubsById, version, busy, notice,
    simWeek, simSeason, nextSeason,
  } = useSave();
  const q = useQuery<TeamOut>('team', { saveId: save?.saveId ?? '' }, version, save !== null);
  // The bracket is only asked for once there is one: through the regular
  // season this stays unfetched.
  const post = useQuery<PlayoffsOut>(
    'playoffs', { saveId: save?.saveId ?? '' }, version,
    save !== null && save.phase !== 'REGULAR_SEASON');

  if (loadError !== null) return <Screen title="Play" screen="play"><QueryError error={loadError} /></Screen>;
  if (!loaded) return <Screen title="Play" screen="play"><Loading label="Loading the week" /></Screen>;
  if (save === null) return <Screen title="Play" screen="play"><NoDynasty /></Screen>;

  const done = isOffseasonPhase(save.phase);
  const inPlayoffs = save.phase === 'PLAYOFFS';
  const roundLabel = post.status === 'ready' ? post.data.nextLabel : null;
  const champion = post.status === 'ready' ? post.data.champion : null;
  const stillIn = post.status === 'ready'
    && post.data.games.some((g) => g.homeScore === null
      && (g.homeTeamId === save.userTeamId || g.awayTeamId === save.userTeamId));
  const nickname = (id: string): string => clubsById.get(id)?.nickname ?? id;
  const fullName = (id: string): string => clubsById.get(id)?.name ?? id;

  return (
    <Screen
      title="Play"
      // The same words the Team screen uses for the same fact: two screens
      // naming one week differently is two weeks to anyone skim-reading.
      subtitle={done
        ? `${String(save.season)} · Offseason`
        : inPlayoffs
          ? `${String(save.season)} · ${roundLabel ?? 'Playoffs'}`
          : `${String(save.season)} · Week ${String(save.week)} of ${String(save.weeks)}`}
      screen="play"
    >
      {notice !== null && (
        <p
          data-testid="notice"
          style={{
            margin: `0 0 ${String(S[3])}px`, padding: `${String(S[2])}px ${String(S[3])}px`,
            borderRadius: R.md,
            background: 'rgba(226,87,76,0.12)', border: `1px solid ${COLOR.red}`,
            color: COLOR.tx, fontSize: 12, lineHeight: 1.5,
          }}
        >
          {notice}
        </p>
      )}

      <SectionHeader title={done ? 'Offseason' : inPlayoffs ? 'Playoffs' : 'Advance'} />
      <div style={{ display: 'grid', gap: S[2] }}>
        {done ? (
          <>
            <ActionButton onClick={() => { nav.push('offseason'); }} testId="play-offseason">
              Play the offseason
            </ActionButton>
            <ActionButton
              onClick={() => { void nextSeason(); }}
              disabled={busy !== null}
              tone="quiet"
              testId="next-season"
            >
              {busy ?? `Simulate it → ${String(save.season + 1)}`}
            </ActionButton>
            <ActionButton onClick={() => { nav.push('recap'); }} tone="quiet" testId="view-recap">
              {champion === null ? 'Season recap' : `Season recap · ${nickname(champion)} champions`}
            </ActionButton>
          </>
        ) : inPlayoffs ? (
          <>
            <ActionButton onClick={() => { void simWeek(); }} disabled={busy !== null} testId="sim-week">
              {busy ?? `Play the ${roundLabel ?? 'next round'}`}
            </ActionButton>
            <ActionButton onClick={() => { nav.push('playoffs'); }} tone="quiet" testId="view-bracket">
              {stillIn ? 'See the bracket' : 'See the bracket · your team is out'}
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

      {q.status === 'error' && <QueryError error={q.error} />}
      {q.status === 'loading' && <Loading label="Loading the week" rows={3} />}
      {q.status === 'ready' && (
        <>
          <SectionHeader title={inPlayoffs ? 'This round' : 'This week'} />
          {q.data.next === null ? (
            <EmptyState
              title={done ? 'The season is over' : inPlayoffs ? 'Nothing to play this round' : 'No game this week'}
              {...(done ? { detail: 'Run the offseason to start the next year.' } : {})}
              {...(inPlayoffs && !stillIn ? { detail: 'Your team is not in the bracket. Play it out to see who takes it.' } : {})}
            />
          ) : (
            <Panel padded={false}>
              <div style={{ padding: `0 ${String(S[3])}px` }} data-testid="next-fixture">
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
              <div style={{ padding: `0 ${String(S[3])}px` }}>
                <ListRow
                  title={`${nickname(q.data.last.awayTeamId)} ${String(q.data.last.awayScore)} — ${String(q.data.last.homeScore)} ${nickname(q.data.last.homeTeamId)}`}
                  subtitle={`${q.data.last.round ?? `Week ${String(q.data.last.week)}`} · box score`}
                  navigable
                  onSelect={() => { nav.push('game', { id: q.data.last?.gameId ?? '' }); }}
                />
              </div>
            </Panel>
          )}

          <SectionHeader title="The week" />
          <HubStack>
            <HubCard
              title="Schedule"
              detail="Every fixture this season, and how each one went"
              onSelect={() => { nav.push('schedule'); }}
              testId="to-schedule"
            />
            {/* Named because the tab promises them, dimmed because they do not
                exist. A card that looked tappable and did nothing would put
                the two above it in doubt. */}
            <NotBuilt
              title="Opponent preview"
              detail="Who you are facing, how they line up, and where they are weak."
              testId="soon-opponent"
            />
            <NotBuilt
              title="Gameplan"
              detail="Set the approach for the week before you play it."
              testId="soon-gameplan"
            />
          </HubStack>

          <p style={{ ...TYPE.prose, margin: `${String(S[4])}px 2px 0`, color: COLOR.dim, fontSize: 11.5 }}>
            Simulating plays every club's week, not only yours.
          </p>
        </>
      )}
    </Screen>
  );
}
