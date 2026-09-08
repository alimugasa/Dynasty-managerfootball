// The panels of an offseason: contracts, the draft board, the market.
//
// Each one draws rows the server sent and offers the moves the server will
// accept. No screen works out a price, a value or whose turn it is: those are
// engine numbers, read from the offseason handler.

import { COLOR } from '../app/tokens';
import { Caption, EmptyState, Panel, SectionHeader } from '../components/Surface';
import { ListRow } from '../components/ListRow';
import { ActionButton } from '../components/ActionButton';
import type { OffseasonOut, OffseasonPlayer } from '../../supabase/functions/_shared/api/reads/offseason';

export const money = (n: number | null): string =>
  (n === null ? '—' : `${(n / 1e6).toFixed(1)}M`);

interface MoveProps {
  readonly data: OffseasonOut;
  readonly busy: boolean;
  readonly move: (route: string, input: Record<string, unknown>) => void;
}

const line = (p: OffseasonPlayer): string =>
  `${p.group} · ${String(p.age)} · ${String(p.overall)} ovr`;

/** Contracts: keep your own, or let them go. */
export function ContractsPanel({ data, busy, move }: MoveProps) {
  return (
    <>
      <SectionHeader title="Out of contract" />
      {data.expiring.length === 0 ? (
        <EmptyState title="Nobody is out of contract" detail="Your squad is under contract for next season." />
      ) : (
        <Panel padded={false}>
          <div style={{ padding: '0 12px' }} data-testid="expiring">
            {data.expiring.map((p) => (
              <ListRow
                key={p.playerId}
                title={p.name}
                subtitle={`${line(p)} · wants ${money(p.ask)} a year`}
                trailing={
                  <ActionButton
                    onClick={() => { move('re-sign', { playerId: p.playerId, years: 3, aav: p.ask }); }}
                    disabled={busy || (p.ask ?? 0) > data.capRoom}
                    tone="quiet"
                    compact
                  >
                    Re-sign
                  </ActionButton>
                }
              />
            ))}
          </div>
        </Panel>
      )}

      <SectionHeader title="Your squad" />
      <Panel padded={false}>
        <div style={{ padding: '0 12px' }} data-testid="squad">
          {data.roster.slice(0, 20).map((p) => (
            <ListRow
              key={p.playerId}
              title={p.name}
              subtitle={`${line(p)} · ${money(p.aav)}${p.yearsLeft === null ? '' : ` · ${String(p.yearsLeft)} yr left`}`}
              trailing={
                <ActionButton
                  onClick={() => { move('release', { playerId: p.playerId }); }}
                  disabled={busy}
                  tone="quiet"
                  compact
                >
                  {p.deadMoney === null || p.deadMoney === 0 ? 'Release' : `Cut · ${money(p.deadMoney)}`}
                </ActionButton>
              }
            />
          ))}
        </div>
      </Panel>
    </>
  );
}

/** The draft: the board when you are on the clock, and what has gone. */
export function DraftPanel({ data, busy, move }: MoveProps) {
  return (
    <>
      {data.onTheClock !== null && (
        <Panel>
          <div style={{ color: COLOR.amber, fontSize: 12, letterSpacing: 0.6 }}>ON THE CLOCK</div>
          <div style={{ color: COLOR.tx, fontSize: 15, marginTop: 2 }}>
            Round {data.onTheClock.round}, pick {data.onTheClock.overall} overall
          </div>
        </Panel>
      )}

      <SectionHeader title={data.onTheClock === null ? 'The board' : 'Take a player'} />
      {data.board.length === 0 ? (
        <EmptyState title="The board is not open" detail="Advance the draft to see who is left." />
      ) : (
        <Panel padded={false}>
          <div style={{ padding: '0 12px' }} data-testid="board">
            {data.board.map((p) => (
              <ListRow
                key={p.prospectId}
                title={p.name}
                subtitle={`${p.group} · age ${String(p.age)} · your scouts say ${String(p.estimate)}`}
                trailing={data.onTheClock === null
                  ? <Caption>{String(p.estimate)}</Caption>
                  : (
                    <ActionButton
                      onClick={() => { move('draft-pick', { prospectId: p.prospectId }); }}
                      disabled={busy}
                      tone="quiet"
                      compact
                    >
                      Pick
                    </ActionButton>
                  )}
              />
            ))}
          </div>
        </Panel>
      )}

      {data.picks.length > 0 && (
        <>
          <SectionHeader title="Off the board" />
          <Panel padded={false}>
            <div style={{ padding: '0 12px' }}>
              {data.picks.map((p) => (
                <ListRow
                  key={p.overall}
                  title={p.name}
                  subtitle={`Round ${String(p.round)}, pick ${String(p.overall)} · ${p.teamId}`}
                  {...(p.yours ? { trailing: <span style={{ color: COLOR.amber, fontSize: 11 }}>YOURS</span> } : {})}
                />
              ))}
            </div>
          </Panel>
        </>
      )}
    </>
  );
}

/** The market: what an offer costs, and what you have out. */
export function MarketPanel({ data, busy, move }: MoveProps) {
  const committed = data.offers.reduce((a, o) => a + o.aav, 0);
  return (
    <>
      {data.offers.length > 0 && (
        <>
          <SectionHeader title="Your offers" />
          <Panel padded={false}>
            <div style={{ padding: '0 12px' }} data-testid="offers">
              {data.offers.map((o) => (
                <ListRow
                  key={o.playerId}
                  title={o.name}
                  subtitle={`${money(o.aav)} a year · ${String(o.years)} years`}
                  trailing={
                    <ActionButton
                      onClick={() => { move('offer', { playerId: o.playerId, aav: 0, years: o.years }); }}
                      disabled={busy}
                      tone="quiet"
                      compact
                    >
                      Withdraw
                    </ActionButton>
                  }
                />
              ))}
            </div>
          </Panel>
          <p style={{ margin: '8px 0 0', color: COLOR.mut, fontSize: 12 }}>
            {money(committed)} committed of {money(data.capRoom)} room. Offers go to market together.
          </p>
        </>
      )}

      <SectionHeader title="On the market" />
      {data.market.length === 0 ? (
        <EmptyState title="The market is not open" />
      ) : (
        <Panel padded={false}>
          <div style={{ padding: '0 12px' }} data-testid="market">
            {data.market.map((p) => {
              const bid = Math.round((p.ask ?? 0) * 1.1);
              return (
                <ListRow
                  key={p.playerId}
                  title={p.name}
                  subtitle={`${line(p)} · asking ${money(p.ask)}`}
                  trailing={
                    <ActionButton
                      onClick={() => { move('offer', { playerId: p.playerId, aav: bid, years: 3 }); }}
                      disabled={busy || bid > data.capRoom - committed}
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
      )}
    </>
  );
}

interface TradeProps extends MoveProps {
  /** The club being looked at, and the two players on the table. */
  readonly partnerId: string;
  readonly setPartner: (teamId: string) => void;
  readonly mine: string | null;
  readonly theirs: string | null;
  readonly select: (side: 'mine' | 'theirs', playerId: string | null) => void;
  readonly clubs: readonly { readonly id: string; readonly nickname: string }[];
}

/**
 * Trades: one of yours for one of theirs.
 *
 * The values shown are the engine's, the same numbers the other club is
 * weighing, so a refusal is never a mystery -- you can see the gap you are
 * asking them to swallow.
 */
export function TradePanel(
  { data, busy, move, partnerId, setPartner, mine, theirs, select, clubs }: TradeProps,
) {
  const rowsMine = data.roster.slice(0, 25);
  // Read once, and defensively: a server that has not been restarted since
  // this panel was added sends no partner at all, and a screen that assumed
  // the field was there took the whole offseason down with it.
  const partner = data.partner ?? null;
  const rowsTheirs = partner?.players ?? [];
  const valueMine = rowsMine.find((p) => p.playerId === mine)?.tradeValue ?? 0;
  const valueTheirs = rowsTheirs.find((p) => p.playerId === theirs)?.tradeValue ?? 0;

  return (
    <>
      <SectionHeader title="Trade" />
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '2px 0 8px' }}>
        {clubs.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => { setPartner(c.id); }}
            style={{
              flexShrink: 0, padding: '6px 10px', borderRadius: 999, cursor: 'pointer',
              border: `1px solid ${c.id === partnerId ? COLOR.amber : COLOR.line2}`,
              background: 'transparent',
              color: c.id === partnerId ? COLOR.amber : COLOR.mut,
              fontSize: 12,
            }}
          >
            {c.nickname}
          </button>
        ))}
      </div>

      <Panel>
        <div style={{ color: COLOR.mut, fontSize: 12, lineHeight: 1.5 }}>
          You give <span style={{ color: COLOR.tx }}>{valueMine === 0 ? 'nobody' : String(valueMine)}</span>
          {' · '}they give <span style={{ color: COLOR.tx }}>{valueTheirs === 0 ? 'nobody' : String(valueTheirs)}</span>
        </div>
        <div style={{ marginTop: 8 }}>
          <ActionButton
            onClick={() => {
              move('trade', { teamId: partnerId, give: [mine], get: [theirs] });
              select('mine', null);
              select('theirs', null);
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
          {rowsMine.map((p) => (
            <ListRow
              key={p.playerId}
              title={p.name}
              subtitle={`${line(p)} · value ${String(p.tradeValue)}`}
              trailing={
                <ActionButton
                  onClick={() => { select('mine', p.playerId === mine ? null : p.playerId); }}
                  tone="quiet"
                  compact
                >
                  {p.playerId === mine ? 'On the table' : 'Offer'}
                </ActionButton>
              }
            />
          ))}
        </div>
      </Panel>

      <SectionHeader title={`You get${partner === null ? '' : ` · ${partner.teamId}`}`} />
      {rowsTheirs.length === 0 ? (
        <EmptyState title="Pick a club" detail="Choose who you want to trade with." />
      ) : (
        <Panel padded={false}>
          <div style={{ padding: '0 12px' }}>
            {rowsTheirs.map((p) => (
              <ListRow
                key={p.playerId}
                title={p.name}
                subtitle={`${line(p)} · value ${String(p.tradeValue)}`}
                trailing={
                  <ActionButton
                    onClick={() => { select('theirs', p.playerId === theirs ? null : p.playerId); }}
                    tone="quiet"
                    compact
                  >
                    {p.playerId === theirs ? 'Asked for' : 'Ask'}
                  </ActionButton>
                }
              />
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}
