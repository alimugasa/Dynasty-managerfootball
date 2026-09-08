// The offseason, in the play-test build: five steps, and the decisions in
// each. The same panels the product shows, drawn from the same engine numbers
// rather than from rows.

import { useState } from 'react';
import { COLOR } from '../../src/app/tokens';
import { Caption, EmptyState, Panel, SectionHeader } from '../../src/components/Surface';
import { ListRow } from '../../src/components/ListRow';
import { StatTiles } from '../../src/components/StatTiles';
import { ActionButton } from '../../src/components/ActionButton';
import {
  capRules, marketValue, reSignAsk, releaseCost, rosterOf, tradeValue,
  type CareerPlayer,
} from '../../supabase/functions/_shared/engine/offseason/index.ts';
import {
  capRoom, draftPick, makeOffer, PHASE_ACTION, proposeTrade, release, reSign,
  type MoveResult,
} from './winter';
import type { Game, WinterPhase } from './host';
import { money, type ScreenProps as Props } from './common';

const EXPLAIN: Readonly<Record<WinterPhase, string>> = {
  OFFSEASON: 'The season is over. Closing it grades everyone, ages the league, retires who is finished and votes on the year.',
  RETIREMENTS: 'Your out-of-contract players are free to leave. Keep the ones you want, and cut what you cannot afford.',
  DRAFT: 'The draft runs pick by pick. It stops when your turn comes and waits for you.',
  FREE_AGENCY: 'Put offers in. They go to market with every other club\'s, and the player decides.',
  CAMP: 'Every club cuts to the limit, the calendar is drawn, and the season opens.',
};

interface OffProps extends Props {
  readonly phase: WinterPhase;
  readonly busy: string | null;
  readonly notice: string | null;
  readonly onStep: () => void;
  readonly onRunAll: () => void;
  readonly onMove: (make: (g: Game) => MoveResult) => void;
}

/**
 * Trades: one of yours for one of theirs.
 *
 * The values are the engine's, the same numbers the other club weighs, so a
 * refusal shows you the gap you asked them to swallow.
 */
function TradeSection(
  { game, busy, onMove }: {
    readonly game: Game; readonly busy: boolean;
    readonly onMove: (make: (g: Game) => MoveResult) => void;
  },
) {
  const [partner, setPartner] = useState<string>('');
  const [mine, setMine] = useState<string | null>(null);
  const [theirs, setTheirs] = useState<string | null>(null);
  const rules = capRules(game.league.season);
  const value = (id: string | null): number => {
    const p = game.league.players.find((x) => x.id === id);
    return p === undefined ? 0 : tradeValue(p, rules);
  };
  const squad = rosterOf(game.league, game.userTeamId)
    .sort((a, b) => tradeValue(b, rules) - tradeValue(a, rules)).slice(0, 20);
  const theirSquad = partner === '' ? [] : rosterOf(game.league, partner)
    .sort((a, b) => tradeValue(b, rules) - tradeValue(a, rules)).slice(0, 20);
  const row = (p: CareerPlayer, chosen: boolean, pick: () => void, label: string) => (
    <ListRow
      key={p.id}
      title={p.name}
      subtitle={`${p.group} · ${String(Math.round(p.age))} · value ${String(tradeValue(p, rules))}`}
      trailing={
        <ActionButton onClick={pick} disabled={busy} tone="quiet" compact>
          {chosen ? 'On the table' : label}
        </ActionButton>
      }
    />
  );

  return (
    <>
      <SectionHeader title="Trade" />
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '2px 0 8px' }}>
        {game.league.teamIds.filter((id) => id !== game.userTeamId).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => { setPartner(id); setTheirs(null); }}
            style={{
              flexShrink: 0, padding: '6px 10px', borderRadius: 999, cursor: 'pointer',
              border: `1px solid ${id === partner ? COLOR.amber : COLOR.line2}`,
              background: 'transparent', fontSize: 12,
              color: id === partner ? COLOR.amber : COLOR.mut,
            }}
          >
            {game.clubs.get(id)?.nickname ?? id}
          </button>
        ))}
      </div>

      <Panel>
        <div style={{ color: COLOR.mut, fontSize: 12, lineHeight: 1.5 }}>
          You give <span style={{ color: COLOR.tx }}>{value(mine) || 'nobody'}</span>
          {' · '}they give <span style={{ color: COLOR.tx }}>{value(theirs) || 'nobody'}</span>
        </div>
        <div style={{ marginTop: 8 }}>
          <ActionButton
            onClick={() => {
              const give = mine;
              const get = theirs;
              if (give === null || get === null) return;
              onMove((g) => proposeTrade(g, partner, [give], [get]));
              setMine(null); setTheirs(null);
            }}
            disabled={busy || mine === null || theirs === null}
          >
            Propose the trade
          </ActionButton>
        </div>
      </Panel>

      <SectionHeader title="You give" />
      <Panel padded={false}>
        <div style={{ padding: '0 12px' }}>
          {squad.map((p) => row(p, p.id === mine,
            () => { setMine(p.id === mine ? null : p.id); }, 'Offer'))}
        </div>
      </Panel>

      <SectionHeader title={`You get${partner === '' ? '' : ` · ${game.clubs.get(partner)?.nickname ?? partner}`}`} />
      {theirSquad.length === 0 ? (
        <EmptyState title="Pick a club" detail="Choose who you want to trade with." />
      ) : (
        <Panel padded={false}>
          <div style={{ padding: '0 12px' }}>
            {theirSquad.map((p) => row(p, p.id === theirs,
              () => { setTheirs(p.id === theirs ? null : p.id); }, 'Ask'))}
          </div>
        </Panel>
      )}
    </>
  );
}

export function OffseasonScreen({
  game, phase, busy, notice, onStep, onRunAll, onMove,
}: OffProps) {
  const rules = capRules(game.league.season);
  const room = capRoom(game.league, game.userTeamId);
  const squad = rosterOf(game.league, game.userTeamId)
    .sort((a, b) => b.ability - a.ability);
  const expiring = game.league.players
    .filter((p) => !p.retired && p.teamId === null && p.previousTeamId === game.userTeamId)
    .sort((a, b) => b.ability - a.ability);
  const market = game.league.players
    .filter((p) => !p.retired && p.teamId === null)
    .sort((a, b) => b.reputation - a.reputation)
    .slice(0, 40);
  const board = (game.league.pipeline.get(game.league.season) ?? [])
    .map((p) => ({ p, estimate: Math.round(p.ability * 0.55 + p.potential * 0.45) }))
    .sort((a, b) => b.estimate - a.estimate)
    .slice(0, 30);
  const onTheClock = phase === 'DRAFT' && game.draftOrder.length > 0
    && game.draftOrder[(game.nextPick - 1) % game.draftOrder.length] === game.userTeamId;
  const line = (p: CareerPlayer): string =>
    `${p.group} · ${String(Math.round(p.age))} · ${String(Math.round(p.ability + p.mental))} ovr`;
  const committed = game.offers.reduce((a, o) => a + o.aav, 0);

  return (
    <>
      <StatTiles stats={[
        { label: 'Cap room', value: money(room), tone: room < 0 ? 'negative' : 'positive' },
        { label: 'Squad', value: String(squad.length) },
        phase === 'RETIREMENTS'
          ? { label: 'Out of contract', value: String(expiring.length) }
          : phase === 'DRAFT'
            ? { label: 'On the board', value: String(board.length) }
            : phase === 'FREE_AGENCY'
              ? { label: 'Offers out', value: String(game.offers.length) }
              : { label: 'Season', value: String(game.season) },
      ]}
      />

      <p style={{ margin: '10px 0 0', color: COLOR.mut, fontSize: 13, lineHeight: 1.5 }}>
        {EXPLAIN[phase]}
      </p>

      {notice !== null && (
        <p style={{
          margin: '10px 0 0', padding: '8px 10px', borderRadius: 8,
          background: 'rgba(240,168,48,0.10)', border: `1px solid ${COLOR.line2}`,
          color: COLOR.tx, fontSize: 12, lineHeight: 1.5,
        }}
        >
          {notice}
        </p>
      )}

      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        <ActionButton onClick={onStep} disabled={busy !== null} testId="offseason-step">
          {busy ?? PHASE_ACTION[phase]}
        </ActionButton>
        <ActionButton onClick={onRunAll} disabled={busy !== null} tone="quiet" testId="sim-offseason">
          Let the staff handle the rest
        </ActionButton>
      </div>

      {phase === 'RETIREMENTS' && (
        <>
          <SectionHeader title="Out of contract" />
          {expiring.length === 0 ? (
            <EmptyState title="Nobody is out of contract" />
          ) : (
            <Panel padded={false}>
              <div style={{ padding: '0 12px' }}>
                {expiring.slice(0, 20).map((p) => {
                  const ask = reSignAsk(p, rules);
                  return (
                    <ListRow
                      key={p.id}
                      title={p.name}
                      subtitle={`${line(p)} · wants ${money(ask)} a year`}
                      trailing={
                        <ActionButton
                          onClick={() => { onMove((g) => reSign(g, p.id, 3, ask)); }}
                          disabled={busy !== null || ask > room}
                          tone="quiet"
                          compact
                        >
                          Re-sign
                        </ActionButton>
                      }
                    />
                  );
                })}
              </div>
            </Panel>
          )}

          <SectionHeader title="Your squad" />
          <Panel padded={false}>
            <div style={{ padding: '0 12px' }}>
              {squad.slice(0, 20).map((p) => (
                <ListRow
                  key={p.id}
                  title={p.name}
                  subtitle={`${line(p)} · ${money(p.contract?.aav ?? 0)} · value ${String(tradeValue(p, rules))}`}
                  trailing={
                    <ActionButton
                      onClick={() => { onMove((g) => release(g, p.id)); }}
                      disabled={busy !== null}
                      tone="quiet"
                      compact
                    >
                      {releaseCost(p) > 0 ? `Cut · ${money(releaseCost(p))}` : 'Release'}
                    </ActionButton>
                  }
                />
              ))}
            </div>
          </Panel>
        </>
      )}

      {phase === 'RETIREMENTS' && (
        <TradeSection game={game} busy={busy !== null} onMove={onMove} />
      )}

      {phase === 'DRAFT' && (
        <>
          {onTheClock && (
            <Panel>
              <div style={{ color: COLOR.amber, fontSize: 12, letterSpacing: '0.06em' }}>ON THE CLOCK</div>
              <div style={{ color: COLOR.tx, fontSize: 15, marginTop: 2 }}>
                Pick {game.nextPick} overall
              </div>
            </Panel>
          )}
          <SectionHeader title={onTheClock ? 'Take a player' : 'The board'} />
          <Panel padded={false}>
            <div style={{ padding: '0 12px' }}>
              {board.map(({ p, estimate }) => (
                <ListRow
                  key={p.id}
                  title={p.name}
                  subtitle={`${p.group} · age ${String(Math.round(p.age))} · your scouts say ${String(estimate)}`}
                  trailing={onTheClock
                    ? (
                      <ActionButton
                        onClick={() => { onMove((g) => draftPick(g, p.id)); }}
                        disabled={busy !== null}
                        tone="quiet"
                        compact
                      >
                        Pick
                      </ActionButton>
                    )
                    : <Caption>{String(estimate)}</Caption>}
                />
              ))}
            </div>
          </Panel>
        </>
      )}

      {phase === 'FREE_AGENCY' && (
        <>
          {game.offers.length > 0 && (
            <>
              <SectionHeader title="Your offers" />
              <Panel padded={false}>
                <div style={{ padding: '0 12px' }}>
                  {game.offers.map((o) => {
                    const p = game.league.players.find((x) => x.id === o.playerId);
                    return (
                      <ListRow
                        key={o.playerId}
                        title={p?.name ?? o.playerId}
                        subtitle={`${money(o.aav)} a year · ${String(o.years)} years`}
                        trailing={
                          <ActionButton
                            onClick={() => { onMove((g) => makeOffer(g, o.playerId, 0, o.years)); }}
                            disabled={busy !== null}
                            tone="quiet"
                            compact
                          >
                            Withdraw
                          </ActionButton>
                        }
                      />
                    );
                  })}
                </div>
              </Panel>
            </>
          )}

          <SectionHeader title="On the market" />
          <Panel padded={false}>
            <div style={{ padding: '0 12px' }}>
              {market.map((p) => {
                const ask = marketValue(p, rules);
                const bid = Math.round(ask * 1.1);
                return (
                  <ListRow
                    key={p.id}
                    title={p.name}
                    subtitle={`${line(p)} · asking ${money(ask)}`}
                    trailing={
                      <ActionButton
                        onClick={() => { onMove((g) => makeOffer(g, p.id, bid, 3)); }}
                        disabled={busy !== null || bid > room - committed}
                        tone="quiet"
                        compact
                      >
                        Offer {money(bid)}
                      </ActionButton>
                    }
                  />
                );
              })}
            </div>
          </Panel>
        </>
      )}

      {phase === 'CAMP' && (
        <>
          <SectionHeader title="Camp" />
          <EmptyState
            title="Nothing left to decide"
            detail="Break camp: every club cuts to fifty-three and the season opens."
          />
        </>
      )}

      {phase === 'OFFSEASON' && (
        <>
          <SectionHeader title="Before you start" />
          <EmptyState
            title={`${String(game.season)} is done`}
            detail="Close it to grade the year, retire who is finished and vote on the awards."
          />
        </>
      )}
    </>
  );
}
