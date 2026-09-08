// Trading, in the play-test build.
//
// One of yours for one of theirs, with both valuations on the screen: the
// numbers shown are the ones the other club is weighing, so a refusal shows
// you the gap rather than hiding it.

import { useState } from 'react';
import { COLOR } from '../../src/app/tokens';
import { EmptyState, Panel, SectionHeader } from '../../src/components/Surface';
import { ListRow } from '../../src/components/ListRow';
import { ActionButton } from '../../src/components/ActionButton';
import {
  capRules, rosterOf, tradeValue, type CareerPlayer,
} from '../../supabase/functions/_shared/engine/offseason/index.ts';
import { proposeTrade, type MoveResult } from './winter';
import type { Game } from './host';

/**
 * Trades: one of yours for one of theirs.
 *
 * The values are the engine's, the same numbers the other club weighs, so a
 * refusal shows you the gap you asked them to swallow.
 */
export function TradeSection(
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

