// Play, in the play-test build: the week and the button that ends it.
//
// Lifted out of screens.tsx when the app grew a Play tab. Same split, same
// reason: the control that advances the season was sitting under a hero and a
// roster list, which is the wrong end of a phone for the most-used button in
// the product.

import { COLOR, R, S } from '../../src/app/tokens';
import { EmptyState, Panel, SectionHeader } from '../../src/components/Surface';
import { ListRow } from '../../src/components/ListRow';
import { ActionButton } from '../../src/components/ActionButton';
import { MatchupCard, PrepCard, PrepGrid, PrepWide } from '../../src/screens/playMatchup';
import { matchupOf } from './dashboard';
import { ranking, squad } from './host';
import { nextRound, ROUND_LABEL } from './postseason';
import { lastRoundSurvivor, roundOf } from './screens';
import { POSITION_GROUPS } from '../../supabase/functions/_shared/engine/types.ts';
import { ordinal, record, type ScreenProps as Props } from './common';

export function PlayScreen(
  { game, open, busy, onWeek, onSeason, onOffseason, onBracket }:
  Props & {
    busy: string | null; onWeek: () => void; onSeason: () => void;
    onOffseason: () => void; onBracket: () => void;
  },
) {
  const standing = game.standings.get(game.userTeamId);
  const done = game.phase === 'OFFSEASON';
  const inPlayoffs = game.phase === 'PLAYOFFS';
  const { round, champion } = game.seeds.length === 0
    ? { round: null, champion: null } : nextRound(game);
  const roundLabel = round === null ? null : ROUND_LABEL[round];
  const mine = [...game.results, ...game.playoffs].filter(
    (g) => g.homeTeamId === game.userTeamId || g.awayTeamId === game.userTeamId);
  const alive = game.playoffs.length === 0
    ? game.seeds.some((s) => s.teamId === game.userTeamId)
    : lastRoundSurvivor(game);
  const last = mine[mine.length - 1];
  const next = game.schedule.find((f) => f.week === game.week
    && (f.homeTeamId === game.userTeamId || f.awayTeamId === game.userTeamId));
  const name = (id: string): string => game.clubs.get(id)?.name ?? id;
  const nick = (id: string): string => game.clubs.get(id)?.nickname ?? id;
  // Before anybody has played, every club is 0-0 and the order is only the
  // tie-break, so a position nobody has earned is not reported at all.
  const played = standing === undefined ? 0 : standing.wins + standing.losses + standing.ties;
  const place = played === 0
    ? 0 : ranking(game.standings).findIndex((s) => s.teamId === game.userTeamId) + 1;
  const matchup = matchupOf(game);
  // How many of the club's own players are unavailable this week, from the
  // same map the engine benches them with.
  const onRoster = new Set(squad(game, game.userTeamId).map((p) => p.id));
  const absent = [...game.absence.keys()].filter((id) => onRoster.has(id)).length;

  return (
    <>
      {game.abandoned.length > 0 && (
        <p
          data-testid="notice"
          style={{
            margin: `${String(S[1])}px 0 0`, padding: `${String(S[2])}px ${String(S[3])}px`,
            borderRadius: R.md,
            background: 'rgba(226,87,76,0.12)', border: `1px solid ${COLOR.red}`,
            color: COLOR.tx, fontSize: 12, lineHeight: 1.5,
          }}
        >
          {game.abandoned.length} game(s) could not be played: {game.abandoned.join(', ')}
        </p>
      )}

      {!done && !inPlayoffs && matchup.week.state === 'FIXTURE' && (
        <>
          <MatchupCard
            identity={matchup.identity}
            ratings={matchup.ratings}
            record={matchup.record}
            week={matchup.week}
            competition={`Regular Season · Week ${String(game.week)}`}
            clubOf={(id) => game.clubs.get(id)}
          />

          <SectionHeader title="Game prep" />
          <PrepGrid>
            <PrepCard
              label="Depth chart"
              value="Ready"
              detail={`${String(POSITION_GROUPS.length)} of ${String(POSITION_GROUPS.length)} groups`}
              tone="ready"
            />
            <PrepCard
              label="Injury report"
              value={absent === 0 ? 'Everyone fit' : `${String(absent)} out`}
              detail={absent === 0 ? 'No starters affected' : 'Backups play in their place'}
              tone={absent === 0 ? 'ready' : 'plain'}
            />
            <PrepCard
              label="Gameplan"
              value="Balanced"
              detail="Every club plays its base approach."
              tone="absent"
            />
            <PrepWide>
              <PrepCard
                label="Opponent strength"
                value={matchup.week.opponentOverall === null
                  ? '—'
                  : `${String(matchup.week.opponentOverall)} overall`}
                detail={matchup.week.opponentStrongest === null
                  ? 'Not measured'
                  : `Strongest: ${matchup.week.opponentStrongest.toLowerCase()}`}
                tone="plain"
              />
            </PrepWide>
          </PrepGrid>
        </>
      )}

      <SectionHeader title={done ? 'Offseason' : inPlayoffs ? 'Playoffs' : 'Advance'} />
      <div style={{ display: 'grid', gap: 8 }}>
        {done ? (
          <>
            <p style={{ margin: '0 0 2px', color: COLOR.mut, fontSize: 13, lineHeight: 1.5 }}>
              {String(game.season)} is over. You finished{' '}
              <strong style={{ color: COLOR.tx }}>{record(standing)}</strong>
              {place > 0 ? `, ${ordinal(place)} of ${String(game.league.teamIds.length)}` : ''}.{' '}
              {champion === null ? '' : (
                <>Champions: <strong style={{ color: COLOR.amber }}>{nick(champion)}</strong>.</>
              )}
            </p>
            <ActionButton onClick={onOffseason} disabled={busy !== null} testId="next-season">
              {busy ?? `Run offseason → ${String(game.season + 1)}`}
            </ActionButton>
            <ActionButton onClick={onBracket} tone="quiet" testId="view-bracket">
              See the bracket
            </ActionButton>
            <ActionButton onClick={() => { open('recap', ''); }} tone="quiet" testId="view-recap">
              Season recap
            </ActionButton>
          </>
        ) : inPlayoffs ? (
          <>
            <p style={{ margin: '0 0 2px', color: COLOR.mut, fontSize: 13, lineHeight: 1.5 }}>
              {alive
                ? <>You are in the bracket. {roundLabel ?? 'The next round'} is next.</>
                : <>You did not make the fourteen. {roundLabel ?? 'The next round'} is next.</>}
            </p>
            <ActionButton onClick={onWeek} disabled={busy !== null} testId="sim-week">
              {busy ?? `Play the ${roundLabel ?? 'next round'}`}
            </ActionButton>
            <ActionButton onClick={onBracket} tone="quiet" testId="view-bracket">
              See the bracket
            </ActionButton>
          </>
        ) : (
          <>
            <ActionButton onClick={onWeek} disabled={busy !== null} testId="sim-week">
              {busy ?? `Sim week ${String(game.week)}`}
            </ActionButton>
            <ActionButton onClick={onSeason} disabled={busy !== null} tone="quiet" testId="sim-season">
              Sim to end of season
            </ActionButton>
          </>
        )}
      </div>

      <SectionHeader title={inPlayoffs ? 'This round' : 'This week'} />
      {next === undefined || inPlayoffs ? (
        <EmptyState
          title={done ? 'The season is over' : inPlayoffs
            ? (alive ? 'Waiting on the bracket' : 'Your season is over')
            : 'Bye week'}
          {...(done ? { detail: 'Run the offseason to start the next year.' } : {})}
          {...(inPlayoffs
            ? { detail: alive ? 'Play the round to see who you get.' : 'Play it out to see who takes it.' }
            : {})}
        />
      ) : (
        <Panel padded={false}>
          <div style={{ padding: '0 12px' }} data-testid="next-fixture">
            <ListRow
              title={next.homeTeamId === game.userTeamId
                ? `vs ${name(next.awayTeamId)}` : `at ${name(next.homeTeamId)}`}
              subtitle={`Week ${String(next.week)}`}
              navigable
              onSelect={() => { open('schedule', ''); }}
            />
          </div>
        </Panel>
      )}

      <SectionHeader title="Last result · box score" />
      {last === undefined ? (
        <EmptyState title="No games played yet" detail="Sim a week to see a result here." />
      ) : (
        <Panel padded={false}>
          <div style={{ padding: '0 12px' }}>
            <ListRow
              title={`${nick(last.awayTeamId)} ${String(last.awayScore)} — ${String(last.homeScore)} ${nick(last.homeTeamId)}`}
              subtitle={`${roundOf(last) ?? `Week ${String(last.week)}`}${last.overtime ? ' · OT' : ''}`}
              navigable
              onSelect={() => { open('game', last.gameId); }}
            />
          </div>
        </Panel>
      )}
    </>
  );
}
