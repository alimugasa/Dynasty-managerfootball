// The offseason, played rather than watched.
//
// Five steps: review the season, settle the contracts, hold the draft, open
// the market, break camp. The button at the top moves the winter forward; the
// panel below it is whatever there is to decide at this point. A manager who
// would rather not can hand the rest to the computer at any step.

import { COLOR } from '../app/tokens';
import { useNavigator } from '../app/navigation';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { useUiState } from '../app/useUiState';
import { EmptyState, Panel, SectionHeader } from '../components/Surface';
import { ListRow } from '../components/ListRow';
import { StatTiles } from '../components/StatTiles';
import { ActionButton } from '../components/ActionButton';
import { Loading, NoDynasty, QueryError } from '../components/QueryState';
import { Screen } from './Screen';
import { ContractsPanel, DraftPanel, MarketPanel, TradePanel, money } from './offseasonPanels';
import { AwardsPanel, YearPanel } from './seasonPanels';
import type { RecapOut } from '../../supabase/functions/_shared/api/reads/recap';
import type { OffseasonOut } from '../../supabase/functions/_shared/api/reads/offseason';

/** What each step is for, in one line, so the button is never a mystery. */
const EXPLAIN: Readonly<Record<string, string>> = {
  OFFSEASON: 'The season is over. Closing it grades everyone, ages the league, retires who is finished and votes on the year.',
  AWARDS: 'The votes are in. Five awards, decided by what the season actually was: the grade, the position, the production, and what the club won.',
  RECAP: 'The year, in full: who took it, what your club did, and which records fell.',
  RETIREMENTS: 'Your out-of-contract players are free to leave. Keep the ones you want, cut what you cannot afford, and trade if you can find a partner.',
  DRAFT: 'The draft runs pick by pick. It stops when your turn comes and waits for you.',
  FREE_AGENCY: 'Put offers in. They go to market with every other club\'s, and the player decides.',
  CAMP: 'Every club cuts to the limit, the calendar is drawn, and the season opens.',
};

export function OffseasonScreen() {
  const nav = useNavigator();
  // Who you are talking to, and the two players on the table. Frame state, so
  // the back button brings the conversation back with the screen.
  const {
    save, loaded, loadError, clubsById, version, busy, notice,
    advanceOffseason, offseasonMove, nextSeason,
  } = useSave();
  const [partner, setPartner] = useUiState('tradeWith', '');
  const [mine, setMine] = useUiState('tradeMine', '');
  const [theirs, setTheirs] = useUiState('tradeTheirs', '');
  const q = useQuery<OffseasonOut>(
    'offseason',
    { saveId: save?.saveId ?? '', ...(partner === '' ? {} : { teamId: partner }) },
    version, save !== null);
  // The season just closed, for the two steps that show it. Asked for only on
  // those steps: the draft has no use for a ballot.
  const showing = q.status === 'ready' && (q.data.phase === 'AWARDS' || q.data.phase === 'RECAP');
  const year = useQuery<RecapOut>(
    'recap', { saveId: save?.saveId ?? '' }, version, save !== null && showing);
  const club = save === null ? undefined : clubsById.get(save.userTeamId);

  const move = (route: string, input: Record<string, unknown>): void => {
    void offseasonMove(route, input);
  };

  return (
    <Screen
      title="Offseason"
      subtitle={q.status === 'ready' ? `${String(q.data.season)} · ${q.data.label}` : (club?.name ?? '')}
      screen="offseason"
    >
      {loadError !== null && <QueryError error={loadError} />}
      {loaded && save === null && <NoDynasty />}
      {save !== null && q.status === 'error' && <QueryError error={q.error} />}
      {save !== null && q.status === 'loading' && <Loading label="Loading the offseason" rows={8} />}
      {q.status === 'ready' && q.data.label === '' && (
        <EmptyState
          title="The season is still on"
          detail="The offseason opens once the final has been played."
        />
      )}
      {q.status === 'ready' && q.data.label !== '' && (
        <>
          <StatTiles
            stats={showing && year.status === 'ready' ? [
              // A ceremony is about the season, not about your cap sheet.
              { label: 'Season', value: String(year.data.season) },
              {
                label: 'Champions',
                value: year.data.championTeamId === null
                  ? '—' : clubsById.get(year.data.championTeamId)?.nickname ?? year.data.championTeamId,
              },
              {
                label: 'You finished',
                value: year.data.you === null
                  ? '—'
                  : `${String(year.data.you.wins)}-${String(year.data.you.losses)}${year.data.you.ties > 0 ? `-${String(year.data.you.ties)}` : ''}`,
              },
            ] : [
              { label: 'Cap room', value: money(q.data.capRoom), tone: q.data.capRoom < 0 ? 'negative' : 'positive' },
              { label: 'Squad', value: String(q.data.roster.length) },
              // The third tile is whatever this step is about.
              q.data.phase === 'AWARDS' || q.data.phase === 'RECAP'
                ? { label: 'Season', value: String(q.data.season) }
                : q.data.phase === 'RETIREMENTS'
                ? { label: 'Out of contract', value: String(q.data.expiring.length) }
                : q.data.phase === 'DRAFT'
                  ? { label: 'On the board', value: String(q.data.board.length) }
                  : q.data.phase === 'FREE_AGENCY'
                    ? { label: 'Offers out', value: String(q.data.offers.length) }
                    : { label: 'Season', value: String(q.data.season) },
            ]}
          />

          <p style={{ margin: '10px 0 0', color: COLOR.mut, fontSize: 13, lineHeight: 1.5 }}>
            {EXPLAIN[q.data.phase] ?? ''}
          </p>

          {notice !== null && (
            <p
              data-testid="notice"
              style={{
                margin: '10px 0 0', padding: '8px 10px', borderRadius: 8,
                background: 'rgba(240,168,48,0.10)', border: `1px solid ${COLOR.line2}`,
                color: COLOR.tx, fontSize: 12, lineHeight: 1.5,
              }}
            >
              {notice}
            </p>
          )}

          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            <ActionButton
              onClick={() => { void advanceOffseason(); }}
              disabled={busy !== null}
              testId="offseason-step"
            >
              {busy ?? q.data.action}
            </ActionButton>
            <ActionButton
              onClick={() => { void nextSeason(); }}
              disabled={busy !== null}
              tone="quiet"
              testId="sim-offseason"
            >
              Let the staff handle the rest
            </ActionButton>
          </div>

          {q.data.phase === 'OFFSEASON' && (
            <>
              <SectionHeader title="Before you start" />
              <Panel padded={false}>
                <div style={{ padding: '0 12px' }}>
                  <ListRow
                    title="Season recap"
                    subtitle="Champions, awards, all-league, the record book"
                    navigable
                    onSelect={() => { nav.push('recap'); }}
                  />
                  <ListRow
                    title="Coaching staff"
                    subtitle="Who is on the hot seat"
                    navigable
                    onSelect={() => { nav.push('staff'); }}
                  />
                </div>
              </Panel>
            </>
          )}

          {showing && year.status === 'error' && <QueryError error={year.error} />}
          {showing && year.status === 'loading' && <Loading label="Loading the season" rows={6} />}
          {showing && year.status === 'ready' && (
            q.data.phase === 'AWARDS'
              ? (
                <AwardsPanel
                  data={year.data}
                  nickname={(id) => (id === null ? '' : clubsById.get(id)?.nickname ?? id)}
                  clubName={(id) => (id === null ? '' : clubsById.get(id)?.name ?? id)}
                  colours={(id) => ({
                    primary: (id === null ? undefined : clubsById.get(id)?.primary) ?? '#28353F',
                    secondary: (id === null ? undefined : clubsById.get(id)?.secondary) ?? '#8698A8',
                  })}
                  open={(screen, params) => { nav.push(screen, params); }}
                />
              )
              : (
                <YearPanel
                  data={year.data}
                  nickname={(id) => (id === null ? '' : clubsById.get(id)?.nickname ?? id)}
                  clubName={(id) => (id === null ? '' : clubsById.get(id)?.name ?? id)}
                  colours={(id) => ({
                    primary: (id === null ? undefined : clubsById.get(id)?.primary) ?? '#28353F',
                    secondary: (id === null ? undefined : clubsById.get(id)?.secondary) ?? '#8698A8',
                  })}
                  open={(screen, params) => { nav.push(screen, params); }}
                />
              )
          )}

          {q.data.phase === 'RETIREMENTS' && (
            <>
              <ContractsPanel data={q.data} busy={busy !== null} move={move} />
              <TradePanel
                data={q.data}
                busy={busy !== null}
                move={move}
                partnerId={partner}
                setPartner={setPartner}
                mine={mine === '' ? null : mine}
                theirs={theirs === '' ? null : theirs}
                select={(side, playerId) => {
                  if (side === 'mine') setMine(playerId ?? '');
                  else setTheirs(playerId ?? '');
                }}
                clubs={clubsById === undefined ? [] : [...clubsById.values()]
                  .filter((c) => c.id !== save?.userTeamId)
                  .map((c) => ({ id: c.id, nickname: c.nickname }))}
              />
            </>
          )}
          {q.data.phase === 'DRAFT' && (
            <DraftPanel data={q.data} busy={busy !== null} move={move} />
          )}
          {q.data.phase === 'FREE_AGENCY' && (
            <MarketPanel data={q.data} busy={busy !== null} move={move} />
          )}
          {q.data.phase === 'CAMP' && (
            <>
              <SectionHeader title="Camp" />
              <EmptyState
                title="Nothing left to decide"
                detail="Break camp: every club cuts to fifty-three and the season opens."
              />
            </>
          )}
        </>
      )}
    </Screen>
  );
}
