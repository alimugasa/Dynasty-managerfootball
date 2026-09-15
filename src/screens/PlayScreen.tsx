// Play: the weekly command centre.
//
// Everything about the next seven days, and the one button that ends them.
// Preview, prepare, simulate, advance -- in that order down the screen,
// because that is the order a manager does them in.
//
// It reads the same call the dashboard reads: both screens are about the club
// right now, and one read producing both is why the rating on the matchup card
// can never disagree with the rating on the Team tab.
//
// The button is not a button that looks like it does something. Pressing it
// plays every club's week on the server, writes the results, the standings,
// the stats and the news, and moves the save on. The modal afterwards exists
// to show that it did.

import { useEffect, useRef, useState } from 'react';
import { COLOR, R, S, TYPE } from '../app/tokens';
import { useNavigator } from '../app/navigation';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { EmptyState, SectionHeader } from '../components/Surface';
import { ActionButton } from '../components/ActionButton';
import { Loading, NoDynasty, QueryError } from '../components/QueryState';
import { isOffseasonPhase } from '../domain/phase';
import { MatchupCard, PrepCard, PrepGrid, PrepWide } from './playMatchup';
import {
  ResultModal, SeasonSummaryModal, SeasonWarningModal, SimWarningModal, warningsFor,
} from './playResult';
import { DeadlineBanner } from './deadlineBanner';
import { Screen } from './Screen';
import type { DashboardOut } from '../../supabase/functions/_shared/api/reads/dashboard';

/** What the depth chart is, in one word, and how worried to be about it. */
function depthStatus(d: DashboardOut): { value: string; tone: 'ready' | 'warn' } {
  if (d.shape.depthStarters >= d.shape.positionGroups) return { value: 'Ready', tone: 'ready' };
  return d.shape.depthStarters === 0
    ? { value: 'Not set', tone: 'warn' }
    : { value: 'Incomplete', tone: 'warn' };
}

export function PlayScreen() {
  const nav = useNavigator();
  const {
    save, loaded, loadError, clubsById, version, busy, notice,
    simWeek, simSeason, nextSeason,
  } = useSave();
  const q = useQuery<DashboardOut>('dashboard', { saveId: save?.saveId ?? '' }, version, save !== null);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState(false);
  /** The season sim: confirmed before it runs, summarised after. */
  const [confirmingSeason, setConfirmingSeason] = useState(false);
  const [summary, setSummary] = useState(false);
  /** Set when the season sim was asked for on a save with no fixtures. */
  const [scheduleError, setScheduleError] = useState(false);
  const seasonWaiting = useRef(false);
  /** The game that was the latest one before this sim started. The modal opens
   *  when a newer one appears, which is the only signal that says the week was
   *  played rather than merely requested. */
  const before = useRef<string | null>(null);
  const waiting = useRef(false);
  const latest = q.status === 'ready' ? q.data.last?.gameId ?? null : null;

  const phase = q.status === 'ready' ? q.data.phase : '';

  useEffect(() => {
    if (!waiting.current || latest === null || latest === before.current) return;
    waiting.current = false;
    setResult(true);
  }, [latest]);

  // The season sim finishes when the phase leaves the regular season, which is
  // the bracket being drawn. Watching the phase rather than the week means a
  // season that ended early -- abandoned games, a short schedule -- still
  // lands on its summary instead of waiting for a week that never comes.
  useEffect(() => {
    if (!seasonWaiting.current || phase === '' || phase === 'REGULAR_SEASON') return;
    seasonWaiting.current = false;
    setSummary(true);
  }, [phase]);

  if (loadError !== null) return <Screen title="Play" screen="play"><QueryError error={loadError} /></Screen>;
  if (!loaded) return <Screen title="Play" screen="play"><Loading label="Loading the week" /></Screen>;
  if (save === null) return <Screen title="Play" screen="play"><NoDynasty /></Screen>;

  const d = q.status === 'ready' ? q.data : null;
  const done = isOffseasonPhase(save.phase);
  const inPlayoffs = save.phase === 'PLAYOFFS';
  const round = d?.thisWeek.round ?? null;
  const competition = inPlayoffs
    ? `Postseason · ${round ?? 'Playoffs'}`
    : `Regular Season · Week ${String(save.week)}`;
  const warnings = d === null ? [] : warningsFor(d);

  const play = (): void => {
    setConfirming(false);
    before.current = d?.last?.gameId ?? null;
    waiting.current = true;
    void simWeek();
  };

  return (
    <Screen
      // A club that missed the field has no round to name, and counting its
      // weeks past the eighteenth would say "Week 19 of 18". The postseason is
      // what it is, whether or not you are in it.
      title={done ? 'Offseason' : round ?? (inPlayoffs ? 'Postseason' : `Week ${String(save.week)}`)}
      subtitle={done
        ? `${String(save.season)} · Season complete`
        : `${String(save.season)} · ${inPlayoffs ? 'Postseason' : `Week ${String(save.week)} of ${String(save.weeks)}`}`}
      screen="play"
    >
      {notice !== null && (
        <p
          data-testid="notice"
          style={{
            margin: `0 0 ${String(S[3])}px`, padding: `${String(S[2])}px ${String(S[3])}px`,
            borderRadius: R.md, background: 'rgba(226,87,76,0.12)',
            border: `1px solid ${COLOR.red}`, color: COLOR.tx, fontSize: 12, lineHeight: 1.5,
          }}
        >
          {notice}
        </p>
      )}
      {/* The clock, above the week. A manager about to simulate past the
          deadline should be told before they do it, not after. */}
      {d !== null && (
        <div style={{ marginBottom: S[3] }}>
          <DeadlineBanner
            deadline={d.tradeDeadline}
            onOpen={() => { nav.push('trades'); }}
          />
        </div>
      )}
      {q.status === 'error' && <QueryError error={q.error} onRetry={q.retry} />}
      {q.status === 'loading' && <Loading label="Loading the week" rows={6} />}

      {d !== null && done && (
        <>
          <EmptyState
            title="The season is over"
            detail="Play the offseason out, or simulate it and start the next year."
          />
          <div style={{ display: 'grid', gap: S[2], marginTop: S[3] }}>
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
              Season recap
            </ActionButton>
          </div>
        </>
      )}

      {d !== null && !done && (
        <>
          {d.thisWeek.state === 'FIXTURE' ? (
            <MatchupCard
              identity={d.identity}
              ratings={d.ratings}
              record={d.record}
              week={d.thisWeek}
              competition={competition}
              clubOf={(id) => clubsById.get(id)}
            />
          ) : (
            <EmptyState
              title={d.thisWeek.state === 'NO_SCHEDULE' ? 'Schedule not generated' : 'No game this week'}
              detail={d.thisWeek.state === 'NO_SCHEDULE'
                ? 'This save has no fixtures for the season, so there is nothing to play.'
                : inPlayoffs
                  ? 'Your club is not in this round. Play it out to see who takes it.'
                  : 'A bye week. The league plays on without you; advance to join it.'}
            />
          )}

          <SectionHeader title="Game prep" />
          <PrepGrid>
            <PrepCard
              label="Depth chart"
              value={depthStatus(d).value}
              detail={`${String(d.shape.depthStarters)} of ${String(d.shape.positionGroups)} groups`}
              tone={depthStatus(d).tone}
            />
            <PrepCard
              label="Injury report"
              value={d.injuries === 0 ? 'Everyone fit' : `${String(d.injuries)} out`}
              detail={d.injuredStarters === 0
                ? 'No starters affected'
                : `${String(d.injuredStarters)} of them start`}
              tone={d.injuredStarters > 0 ? 'warn' : d.injuries === 0 ? 'ready' : 'plain'}
            />
            <PrepCard
              label="Gameplan"
              value="Balanced"
              detail="Every club plays its base approach."
              tone="absent"
            />
            <PrepCard
              label="Opponent strength"
              value={d.thisWeek.opponentOverall === null
                ? '—'
                : `${String(d.thisWeek.opponentOverall)} overall`}
              detail={d.thisWeek.opponentStrongest === null
                ? 'Not measured'
                : `Strongest: ${d.thisWeek.opponentStrongest.toLowerCase()}`}
              tone="plain"
            />
            <PrepWide>
              <PrepCard
                label="Owner and fans"
                value={d.owner?.mood ?? 'No owner on file'}
                detail={d.fanPressure === null
                  ? 'Market not measured'
                  : `${d.fanPressure} market · the owner does not act on this yet`}
                tone="plain"
              />
            </PrepWide>
          </PrepGrid>

          <div style={{ display: 'grid', gap: S[2], marginTop: S[4] }}>
            <ActionButton
              onClick={() => {
                if (warnings.length > 0) { setConfirming(true); return; }
                play();
              }}
              disabled={busy !== null}
              testId="sim-week"
            >
              {busy ?? (inPlayoffs
                ? `Play the ${round ?? 'next round'}`
                : `Sim week ${String(save.week)}`)}
            </ActionButton>
            <div style={{ display: 'grid', gap: S[2], gridTemplateColumns: '1fr 1fr' }}>
              <ActionButton tone="quiet" onClick={() => { nav.replaceRoot('team'); }} testId="to-preview">
                Preview
              </ActionButton>
              <ActionButton tone="quiet" onClick={() => { nav.push('roster'); }} testId="to-depth">
                Depth chart
              </ActionButton>
              <ActionButton tone="quiet" onClick={() => { nav.push('roster'); }} testId="to-roster">
                View roster
              </ActionButton>
              <ActionButton tone="quiet" onClick={() => { nav.push('schedule'); }} testId="to-schedule">
                Fixtures
              </ActionButton>
            </div>
            {inPlayoffs && (
              <ActionButton onClick={() => { nav.push('playoffs'); }} tone="quiet" testId="view-bracket">
                See the bracket
              </ActionButton>
            )}
          </div>

          <p style={{ ...TYPE.prose, margin: `${String(S[4])}px 2px 0`, color: COLOR.dim, fontSize: 12 }}>
            Simulating plays every club&rsquo;s week, not only yours. The results, the table,
            the statistics and the news all move with it.
          </p>

          {/* Down here, and not gold. Running the season out in one press is
              the most destructive thing on the screen -- every week it plays
              is a week of decisions taken by the simulation instead of by the
              manager -- so it sits below the week it would skip, looks like
              the shortcut it is, and asks first. */}
          {!inPlayoffs && (
            <>
              <SectionHeader title="Quick sim" />
              <ActionButton
                tone="quiet"
                onClick={() => {
                  // A save with no fixture list cannot be simulated, and the
                  // screen says so rather than opening a dialog that would
                  // promise weeks it cannot play.
                  if (d.thisWeek.state === 'NO_SCHEDULE' || d.shape.fixtures === 0) {
                    setScheduleError(true);
                    return;
                  }
                  setConfirmingSeason(true);
                }}
                disabled={busy !== null}
                testId="sim-season"
              >
                Sim to End of Regular Season
              </ActionButton>
              <p style={{ ...TYPE.prose, margin: `${String(S[2])}px 2px 0`, color: COLOR.dim, fontSize: 11 }}>
                {scheduleError
                  ? 'This save has no schedule for the season, so there is nothing to '
                    + 'simulate. Nothing was played.'
                  : `Plays the remaining ${String(Math.max(0, save.weeks - save.week + 1))} `
                    + 'weeks in one go and stops at the bracket.'}
              </p>
            </>
          )}
        </>
      )}

      {confirming && d !== null && (
        <SimWarningModal
          warnings={warnings}
          week={save.week}
          onCancel={() => { setConfirming(false); }}
          onConfirm={play}
        />
      )}

      {confirmingSeason && d !== null && (
        <SeasonWarningModal
          weeks={Math.max(0, save.weeks - save.week + 1)}
          record={d.record}
          onCancel={() => { setConfirmingSeason(false); }}
          onConfirm={() => {
            setConfirmingSeason(false);
            seasonWaiting.current = true;
            void simSeason();
          }}
        />
      )}

      {summary && d !== null && (
        <SeasonSummaryModal
          season={save.season}
          record={d.record}
          seed={d.seed}
          bestWin={d.bestWin}
          worstLoss={d.worstLoss}
          nameOf={(id) => clubsById.get(id)?.nickname ?? id}
          onBracket={() => { setSummary(false); nav.push('playoffs'); }}
          onClose={() => { setSummary(false); }}
        />
      )}

      {result && d?.last != null && (
        <ResultModal
          result={d.last}
          record={d.record}
          mine={d.ratings.overall}
          theirs={d.thisWeek.opponentOverall}
          opponentName={clubsById.get(d.last.opponentId)?.name ?? d.last.opponentId}
          onRecap={() => { setResult(false); nav.push('game', { id: d.last?.gameId ?? '' }); }}
          onResults={() => { setResult(false); nav.push('schedule'); }}
          onClose={() => { setResult(false); }}
        />
      )}
    </Screen>
  );
}
