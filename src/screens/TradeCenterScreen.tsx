// The Trade Center.
//
// Six sections and a header, and the header comes first for a reason: a
// manager opening this in week 9 needs to know whether trading is even open
// and how long they have before they look at a single name. A deadline nobody
// can see coming is a rule rather than an event.
//
// The builder underneath is the point of the screen. Pick a club, tick assets
// on both sides, and the interest meter moves as you go -- which is the whole
// negotiation, because what a manager is really doing is searching for the
// package that crosses a line they cannot see directly.

import { useRef, useState } from 'react';
import { COLOR, S, TYPE } from '../app/tokens';
import { useSave } from '../app/SaveProvider';
import { useQuery } from '../hooks/useQuery';
import { useAvatars } from '../hooks/useAvatars';
import { PlayerFace } from '../avatar/PlayerFace';
import { useNavigator } from '../app/navigation';
import { Caption, EmptyState, Panel, SectionHeader } from '../components/Surface';
import { StatTiles, type Stat } from '../components/StatTiles';
import { ActionButton } from '../components/ActionButton';
import { Loading, NoDynasty, QueryError } from '../components/QueryState';
import { Screen } from './Screen';
import { money } from './marketRows';
import { ClubLine, TradeLine } from './tradeParts';
import { TradeBuilder } from './tradeBuilder';
import type { TradeCenterOut } from '../../supabase/functions/_shared/api/reads/tradeCenter';

/** Stable across renders while the trade read is in flight. */
const NO_IDS: readonly string[] = [];

export function TradeCenterScreen() {
  const nav = useNavigator();
  const { save, loaded, loadError, version, busy, notice, marketMove } = useSave();
  const [withClub, setWithClub] = useState<string | null>(null);
  const q = useQuery<TradeCenterOut>(
    'trade-center', { saveId: save?.saveId ?? '' }, version, save !== null);
  // The last good read, held across refetches.
  //
  // Every write bumps the save's version, which sends this query back to
  // loading. Dropping to null while that happens unmounted the whole screen
  // below -- including the package a manager was halfway through building,
  // which lost their work every time they proposed anything. Holding the
  // previous read keeps the subtree mounted, so the screen updates rather
  // than flickering through an empty state on its way back.
  //
  // Above the early returns, because a hook that runs only sometimes is a
  // hook that runs in a different order on the next render.
  const kept = useRef<TradeCenterOut | null>(null);
  if (q.status === 'ready') kept.current = q.data;
  // Read from the held data rather than from the query, for the same reason:
  // the faces must not disappear on every write either.
  const faces = useAvatars(kept.current?.block.map((p) => p.playerId) ?? NO_IDS);

  if (loadError !== null) {
    return <Screen title="Trade Center" screen="trades"><QueryError error={loadError} /></Screen>;
  }
  if (!loaded) {
    return <Screen title="Trade Center" screen="trades"><Loading label="Loading dynasty" /></Screen>;
  }
  if (save === null) return <Screen title="Trade Center" screen="trades"><NoDynasty /></Screen>;

  const d = q.status === 'ready' ? q.data : kept.current;

  const tiles: readonly Stat[] = d === null ? [] : [
    {
      label: 'Trading',
      value: d.open ? 'Open' : 'Shut',
      tone: d.open ? 'positive' : 'negative',
    },
    {
      label: 'Deadline',
      value: `Week ${String(d.deadlineWeek)}`,
      tone: d.urgency === 'now' || d.urgency === 'soon' ? 'accent' : 'default',
    },
    { label: 'Cap space', value: money(d.capSpace), tone: d.capSpace < 0 ? 'negative' : 'default' },
    { label: 'Picks', value: String(d.picks.length) },
    {
      label: 'On the block',
      value: String(d.block.length),
      tone: d.block.length > 0 ? 'accent' : 'default',
    },
    { label: 'Roster', value: `${String(d.rosterCount)}/${String(d.rosterLimit)}` },
  ];

  const respond = async (tradeId: number, action: string): Promise<void> => {
    await marketMove('respond-trade', { tradeId, action });
  };

  return (
    <Screen
      title="Trade Center"
      {...(d === null
        ? {}
        : { subtitle: `Week ${String(d.week)} · ${d.strategyLabel}` })}
      screen="trades"
    >
      {notice !== null && (
        <p data-testid="notice" style={{ ...TYPE.prose, margin: `0 0 ${String(S[2])}px`, color: COLOR.red }}>
          {notice}
        </p>
      )}

      {q.status === 'error' && <QueryError error={q.error} onRetry={q.retry} />}
      {q.status === 'loading' && <Loading label="Loading the trade market" rows={8} />}
      {d !== null && (
        <>
          <div data-testid="trade-header" style={{ marginBottom: S[3] }}>
            <StatTiles stats={tiles.slice(0, 3)} />
            <div style={{ marginTop: S[2] }}>
              <StatTiles stats={tiles.slice(3)} />
            </div>
          </div>
          {d.notice !== null && (
            <p
              data-testid="deadline-notice"
              style={{
                ...TYPE.body, margin: `0 0 ${String(S[3])}px`,
                color: d.open ? COLOR.amber : COLOR.mut,
              }}
            >
              {d.notice}
            </p>
          )}

          {/* Offers that came in. First, because they are the only thing here
              with somebody else waiting on the other end of it. */}
          <SectionHeader title="Incoming offers" />
          <Panel>
            {d.incoming.length === 0 ? (
              <EmptyState
                title="No offers in"
                detail={d.block.length === 0
                  ? 'Put a player on the trade block and clubs that need him will call.'
                  : 'Nobody has called about your listed players yet.'}
              />
            ) : (
              <div data-testid="incoming-list">
                {d.incoming.map((t) => (
                  <TradeLine
                    key={t.tradeId}
                    title={`${t.fromTeamName ?? t.fromTeamId} offer`}
                    sending={t.receiving}
                    receiving={t.sending}
                    actions={(
                      <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap' }}>
                        <ActionButton
                          compact
                          disabled={busy !== null || !d.open}
                          testId={`accept-${String(t.tradeId)}`}
                          onClick={() => { void respond(t.tradeId, 'ACCEPT'); }}
                        >
                          Accept
                        </ActionButton>
                        <ActionButton
                          tone="quiet"
                          compact
                          disabled={busy !== null}
                          testId={`reject-${String(t.tradeId)}`}
                          onClick={() => { void respond(t.tradeId, 'REJECT'); }}
                        >
                          Turn down
                        </ActionButton>
                      </div>
                    )}
                  />
                ))}
              </div>
            )}
          </Panel>

          <SectionHeader title="Build a trade" />
          {!d.open ? (
            <Panel>
              <EmptyState
                title="Trading is shut"
                detail={d.notice ?? 'The trade window is closed.'}
              />
            </Panel>
          ) : withClub === null ? (
            <>
              <Panel padded={false}>
                <div style={{ padding: S[3], display: 'grid', gap: S[2] }} data-testid="club-list">
                  {d.clubs.map((club) => (
                    <ClubLine
                      key={club.teamId}
                      name={club.name}
                      strategy={club.strategyLabel}
                      record={club.record}
                      needs={club.needs}
                      capSpace={club.capSpace}
                      onSelect={() => { setWithClub(club.teamId); }}
                      testId={`club-${club.teamId}`}
                    />
                  ))}
                </div>
              </Panel>
              <Caption>
                {'What each club is trying to do decides what it will pay for. A rebuilding '
                  + 'club wants picks and young players; a contender wants help this season.'}
              </Caption>
            </>
          ) : (
            <TradeBuilder
              teamId={withClub}
              ownPicks={d.picks}
              onClose={() => { setWithClub(null); }}
            />
          )}

          <SectionHeader title="Trade block" />
          <Panel>
            {d.block.length === 0 ? (
              <EmptyState
                title="Nobody listed"
                detail={'Open a player from the roster and list him here. Clubs that need him '
                  + 'will make offers — and he will know he is available.'}
              />
            ) : (
              <div data-testid="block-list">
                {d.block.map((p) => (
                  <TradeLine
                    key={p.playerId}
                    face={<PlayerFace avatars={faces} playerId={p.playerId} name={p.name} />}
                    title={`${p.position} ${p.name}`}
                    sending={[`${String(p.overall)} overall · ${String(p.age)} years old`]}
                    receiving={[p.note ?? 'No asking price named']}
                    footer={`${p.moraleLabel} · ${String(p.offers)} offer`
                      + `${p.offers === 1 ? '' : 's'} in`}
                    actions={(
                      <ActionButton
                        tone="quiet"
                        compact
                        testId={`open-${p.playerId}`}
                        onClick={() => { nav.push('player', { id: p.playerId }); }}
                      >
                        Open profile
                      </ActionButton>
                    )}
                  />
                ))}
              </div>
            )}
          </Panel>

          <SectionHeader title="Your proposals" />
          <Panel>
            {d.proposed.length === 0 ? (
              <EmptyState title="Nothing outstanding" detail="Offers you make appear here until they are answered." />
            ) : (
              <div data-testid="proposed-list">
                {d.proposed.map((t) => (
                  <TradeLine
                    key={t.tradeId}
                    title={`To ${t.toTeamName ?? t.toTeamId}`}
                    sending={t.sending}
                    receiving={t.receiving}
                    {...(t.interestLabel === null ? {} : { footer: t.interestLabel })}
                    actions={(
                      <ActionButton
                        tone="quiet"
                        compact
                        disabled={busy !== null}
                        testId={`withdraw-${String(t.tradeId)}`}
                        onClick={() => { void respond(t.tradeId, 'WITHDRAW'); }}
                      >
                        Withdraw
                      </ActionButton>
                    )}
                  />
                ))}
              </div>
            )}
          </Panel>

          <SectionHeader title="Your completed trades" />
          <Panel>
            {d.completed.length === 0 ? (
              <EmptyState title="No trades yet" detail="Deals you complete this season are kept here." />
            ) : (
              <div data-testid="completed-list">
                {d.completed.map((t) => (
                  <TradeLine
                    key={t.tradeId}
                    title={`Week ${String(t.week ?? 0)} · with `
                      + `${(t.fromTeamId === save.userTeamId ? t.toTeamName : t.fromTeamName)
                        ?? 'another club'}`}
                    sending={t.fromTeamId === save.userTeamId ? t.sending : t.receiving}
                    receiving={t.fromTeamId === save.userTeamId ? t.receiving : t.sending}
                  />
                ))}
              </div>
            )}
          </Panel>

          <SectionHeader title="League trade activity" />
          <Panel>
            {d.leagueActivity.length === 0 ? (
              <EmptyState
                title="Quiet so far"
                detail="No other club has completed a trade this season."
              />
            ) : (
              <div data-testid="league-activity">
                {d.leagueActivity.map((t) => (
                  <TradeLine
                    key={t.tradeId}
                    title={`Week ${String(t.week ?? 0)} · ${t.fromTeamName ?? t.fromTeamId}`
                      + ` and ${t.toTeamName ?? t.toTeamId}`}
                    sending={t.sending}
                    receiving={t.receiving}
                  />
                ))}
              </div>
            )}
          </Panel>
        </>
      )}
    </Screen>
  );
}
