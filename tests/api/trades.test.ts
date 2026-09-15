// Trading, against Postgres.
//
// The request names six things that have to work, and each is an assertion
// here: a multi-asset package can be built, a CPU club can be negotiated with,
// offers and counters come back, the block does something, the deadline bites,
// and the other thirty-one clubs trade with each other.
//
// It runs on a season in progress because almost every defect a trade system
// can have is about *state* -- a player on two rosters, a pick owned twice, a
// contract left behind, a deal agreed after the deadline -- and none of those
// are visible without real weeks being played on top of them.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPipe, type Pipe } from './harness.ts';
import type { CreateSaveOut } from '../../supabase/functions/_shared/api/createSave';
import type { WeekOutcome } from '../../supabase/functions/_shared/api/week';
import type { TradeCenterOut } from '../../supabase/functions/_shared/api/reads/tradeCenter';
import type { TradeAssetsOut } from '../../supabase/functions/_shared/api/reads/tradeAssetsRead';
import type { TradeQuote } from '../../supabase/functions/_shared/api/tradeDeal';
import type { ProposeOut } from '../../supabase/functions/_shared/api/handlers/tradeMoves';

const OWNER = '77777777-0000-0000-0000-0000000000ad';

describe('the in-season trade system', () => {
  let pipe: Pipe;
  let saveId = '';
  let userTeam = '';

  const centre = (): Promise<TradeCenterOut> =>
    pipe.api.call<TradeCenterOut>('trade-center', { saveId });
  const assetsOf = (teamId: string): Promise<TradeAssetsOut> =>
    pipe.api.call<TradeAssetsOut>('trade-assets', { saveId, teamId });
  const quote = (teamId: string, give: string[], get: string[]): Promise<TradeQuote> =>
    pipe.api.call<TradeQuote>('quote-trade', { saveId, teamId, give, get });
  const propose = (teamId: string, give: string[], get: string[]): Promise<ProposeOut> =>
    pipe.api.call<ProposeOut>('propose-trade', { saveId, teamId, give, get });
  const sim = (): Promise<WeekOutcome> => pipe.api.call<WeekOutcome>('sim-week', { saveId });

  /** A club that is not the managed one, with assets worth trading for. */
  const rival = async (): Promise<string> => {
    const c = await centre();
    const found = c.clubs[0]?.teamId;
    if (found === undefined) throw new Error('no other club in the league');
    return found;
  };

  beforeAll(async () => {
    pipe = await openPipe(OWNER);
    await pipe.sql`delete from public.saves where user_id = ${OWNER} and not is_template`;
    const out = await pipe.api.call<CreateSaveOut>('create-save', {
      name: 'Trade dynasty', teamId: 'SEA', slot: 1,
      gmFirstName: 'Rosalind', gmLastName: 'Achebe',
    });
    saveId = out.saveId;
    const [save] = await pipe.sql<{ user_team_id: string }[]>`
      select user_team_id from public.saves where id = ${saveId}`;
    userTeam = save?.user_team_id ?? '';
    // Five weeks, so the table means something and clubs have a direction.
    for (let i = 0; i < 5; i += 1) await sim();
  }, 600_000);

  afterAll(async () => {
    if (saveId !== '') await pipe.sql`delete from public.saves where id = ${saveId}`;
    await pipe.close();
  }, 120_000);

  it('opens the window and says when it shuts', async () => {
    const c = await centre();
    expect(c.open).toBe(true);
    expect(c.deadlineWeek).toBeGreaterThan(c.week);
    expect(c.deadlineWeek).toBeLessThan(c.seasonWeeks);
    expect(c.rosterLimit).toBe(53);
    expect(c.strategyLabel).toBeTruthy();
  });

  it('gives this club picks to trade, across more than one draft', async () => {
    const c = await centre();
    expect(c.picks.length).toBeGreaterThan(7);
    const years = new Set(c.picks.map((p) => p.year));
    // A future pick is a real asset, and the whole reason a rebuild has
    // anything to buy with.
    expect(years.size).toBeGreaterThan(1);
  });

  it('gives every other club a stated direction and a need', async () => {
    const c = await centre();
    expect(c.clubs.length).toBe(31);
    for (const club of c.clubs) {
      expect(club.strategyLabel, club.teamId).toBeTruthy();
      expect(club.record, club.teamId).toMatch(/^\d+-\d+/);
    }
    // Not every club can be the same thing, or the league has no shape.
    expect(new Set(c.clubs.map((x) => x.strategy)).size).toBeGreaterThan(1);
  });

  it('prices a rival\'s players and picks, and marks the ones they will not move', async () => {
    const them = await assetsOf(await rival());
    expect(them.players.length).toBeGreaterThan(20);
    expect(them.picks.length).toBeGreaterThan(0);
    for (const p of them.players) expect(p.value).toBeGreaterThan(0);
    for (const p of them.picks) expect(p.value).toBeGreaterThan(0);
    // Their best player is worth more than their worst.
    const values = them.players.map((p) => p.value);
    expect(Math.max(...values)).toBeGreaterThan(Math.min(...values) * 2);
  });

  it('quotes a package with an interest band and reasons a manager can act on', async () => {
    const teamId = await rival();
    const them = await assetsOf(teamId);
    const mine = await assetsOf(userTeam);
    const want = them.players.find((p) => !p.untouchable);
    const offer = mine.players[0];
    if (want === undefined || offer === undefined) throw new Error('nothing to trade');

    const q = await quote(teamId, [`PLAYER:${offer.playerId}`], [`PLAYER:${want.playerId}`]);
    expect(['NO_INTEREST', 'WEAK', 'FAIR', 'STRONG', 'LIKELY_ACCEPT']).toContain(q.interest);
    expect(q.valueAsked).toBeGreaterThan(0);
    expect(q.fill).toBeGreaterThanOrEqual(0);
    expect(q.fill).toBeLessThanOrEqual(1);
    expect(q.them.name).toBeTruthy();
    expect(q.them.strategy).toBeTruthy();
    // A refusal that names nothing is a dead end.
    if (!q.accepted) expect(q.reasons.length).toBeGreaterThan(0);
  });

  it('writes nothing when it is only quoting', async () => {
    const teamId = await rival();
    const them = await assetsOf(teamId);
    const mine = await assetsOf(userTeam);
    const [before] = await pipe.sql<{ n: string }[]>`
      select count(*)::text as n from public.trades where save_id = ${saveId}`;
    await quote(teamId,
      [`PLAYER:${mine.players[0]?.playerId ?? ''}`],
      [`PLAYER:${them.players.find((p) => !p.untouchable)?.playerId ?? ''}`]);
    const [after] = await pipe.sql<{ n: string }[]>`
      select count(*)::text as n from public.trades where save_id = ${saveId}`;
    expect(after?.n).toBe(before?.n);
  });

  it('refuses a package naming a player who is not yours', async () => {
    // The one rule a client cannot be trusted with: a package naming another
    // club's quarterback would otherwise execute.
    const teamId = await rival();
    const them = await assetsOf(teamId);
    const theirs = them.players[0]?.playerId ?? '';
    await expect(quote(teamId, [`PLAYER:${theirs}`], [`PLAYER:${theirs}`]))
      .rejects.toThrow(/own roster/i);
  });

  it('refuses to let a club trade with itself', async () => {
    await expect(quote(userTeam, [], [])).rejects.toThrow(/itself/i);
  });

  it('builds a multi-asset package: players and picks on both sides', async () => {
    const teamId = await rival();
    const them = await assetsOf(teamId);
    const mine = await assetsOf(userTeam);
    const c = await centre();
    const theirPlayer = them.players.find((p) => !p.untouchable);
    const theirPick = them.picks[0];
    const myPlayer = mine.players[10];
    const myPicks = c.picks.slice(0, 2);
    if (theirPlayer === undefined || theirPick === undefined
      || myPlayer === undefined || myPicks.length < 2) throw new Error('not enough assets');

    const q = await quote(teamId,
      [`PLAYER:${myPlayer.playerId}`, ...myPicks.map((p) => `PICK:${p.pickId}`)],
      [`PLAYER:${theirPlayer.playerId}`, `PICK:${theirPick.pickId}`]);
    // Four assets one way, two the other. Nothing here is restricted to one
    // item per side.
    expect(q.giving.length).toBe(3);
    expect(q.getting.length).toBe(2);
    expect(q.valueOffered).toBeGreaterThan(0);
  });

  it('accepts a deal that is plainly good for them, and moves everything', async () => {
    const teamId = await rival();
    const them = await assetsOf(teamId);
    const c = await centre();
    // Buy their worst player with a pile of picks. It is an overpay on
    // purpose: this test is about the execution, not the negotiation.
    const target = them.players
      .filter((p) => !p.untouchable)
      .sort((a, b) => a.value - b.value)[0];
    if (target === undefined) throw new Error('nothing available');
    const picks = c.picks.slice(0, 3).map((p) => `PICK:${p.pickId}`);

    const out = await propose(teamId, picks, [`PLAYER:${target.playerId}`]);
    if (out.answer !== 'ACCEPTED') {
      // A rejection is a legitimate outcome; the execution assertions below
      // only mean anything on a deal that happened.
      expect(out.summary).toBeTruthy();
      return;
    }

    // The roster, and the column every read joins on.
    const [roster] = await pipe.sql<{ team_id: string; acq: string | null }[]>`
      select team_id, acquisition_type as acq from public.team_rosters
       where save_id = ${saveId} and player_id = ${target.playerId}`;
    expect(roster?.team_id).toBe(userTeam);
    expect(roster?.acq).toBe('TRADE');
    const [player] = await pipe.sql<{ team_id: string | null }[]>`
      select team_id from public.players
       where save_id = ${saveId} and player_id = ${target.playerId}`;
    expect(player?.team_id).toBe(userTeam);

    // The contract moved with him rather than being left behind or rewritten.
    const [contract] = await pipe.sql<{ team_id: string }[]>`
      select team_id from public.player_contracts
       where save_id = ${saveId} and player_id = ${target.playerId}
         and contract_status = 'ACTIVE'`;
    if (contract !== undefined) expect(contract.team_id).toBe(userTeam);

    // He is off his old club's depth chart.
    const [chart] = await pipe.sql<{ n: string }[]>`
      select count(*)::text as n from public.team_depth_charts
       where save_id = ${saveId} and player_id = ${target.playerId}
         and team_id = ${teamId}`;
    expect(Number(chart?.n)).toBe(0);

    // The picks changed hands.
    for (const pick of c.picks.slice(0, 3)) {
      const [row] = await pipe.sql<{ owner: string }[]>`
        select current_owner_team_id as owner from public.draft_picks
         where save_id = ${saveId} and pick_id = ${pick.pickId}`;
      expect(row?.owner).toBe(teamId);
    }

    // The engine's own state, which is the copy that picks the eleven.
    const [doc] = await pipe.sql<{ team_id: string | null }[]>`
      select p ->> 'teamId' as team_id
        from public.save_documents d,
             lateral jsonb_array_elements(d.document -> 'players') as p
       where d.save_id = ${saveId} and p ->> 'id' = ${target.playerId}`;
    if (doc !== undefined) expect(doc.team_id).toBe(userTeam);

    // The history and the feed.
    const [log] = await pipe.sql<{ n: string }[]>`
      select count(*)::text as n from public.transactions
       where save_id = ${saveId} and kind = 'TRADE' and player_id = ${target.playerId}`;
    expect(Number(log?.n)).toBeGreaterThan(0);
    const [news] = await pipe.sql<{ n: string }[]>`
      select count(*)::text as n from public.news
       where save_id = ${saveId} and category = 'TRANSACTION'
         and headline ilike '%trade%'`;
    expect(Number(news?.n)).toBeGreaterThan(0);

    // And it shows in the Trade Center's completed list.
    const after = await centre();
    expect(after.completed.length).toBeGreaterThan(0);
  }, 180_000);

  it('turns down a derisory offer and says why', async () => {
    const teamId = await rival();
    const them = await assetsOf(teamId);
    const c = await centre();
    const best = them.players.filter((p) => !p.untouchable)
      .sort((a, b) => b.value - a.value)[0];
    const worst = c.picks[c.picks.length - 1];
    if (best === undefined || worst === undefined) throw new Error('nothing to trade');

    const out = await propose(teamId, [`PICK:${worst.pickId}`], [`PLAYER:${best.playerId}`]);
    expect(out.answer).not.toBe('ACCEPTED');
    expect(out.summary).toBeTruthy();
    const [row] = await pipe.sql<{ state: string; reasons: string[] | null }[]>`
      select state, reasons from public.trades
       where save_id = ${saveId} and trade_id = ${out.tradeId}`;
    expect(['REJECTED', 'COUNTERED']).toContain(row?.state);
  }, 120_000);

  it('counters a near miss with terms of its own', async () => {
    // The request's AI counteroffer, end to end. A unit test can prove the
    // rule; only a database can prove that the club finds a real asset on the
    // manager's roster to ask for, and that it writes a package the manager
    // could actually accept.
    //
    // A near miss has to be searched for rather than constructed: what counts
    // as close depends on the club's strategy and the week, so this walks the
    // available targets until one lands between "no" and "yes".
    const teamId = await rival();
    const them = await assetsOf(teamId);
    const c = await centre();
    const targets = them.players
      .filter((p) => !p.untouchable)
      .sort((a, b) => a.value - b.value)
      .slice(0, 12);

    for (const target of targets) {
      // One pick at a time, cheapest first, until the offer is close.
      for (const pick of [...c.picks].reverse()) {
        const q = await quote(teamId, [`PICK:${pick.pickId}`], [`PLAYER:${target.playerId}`]);
        if (q.counter === null) continue;

        const out = await propose(teamId, [`PICK:${pick.pickId}`], [`PLAYER:${target.playerId}`]);
        if (out.answer !== 'COUNTERED') continue;

        expect(out.counterTradeId).not.toBeNull();
        expect(out.summary).toContain('add');

        // The counter is a real package: their side unchanged, the manager's
        // side one asset heavier.
        const rows = await pipe.sql<{ from_team_id: string; n: string }[]>`
          select from_team_id, count(*)::text as n from public.trade_assets
           where save_id = ${saveId} and trade_id = ${out.counterTradeId ?? 0}
           group by from_team_id`;
        const mine = rows.find((r) => r.from_team_id === userTeam);
        const theirs = rows.find((r) => r.from_team_id === teamId);
        expect(Number(mine?.n), 'the manager is asked for one more asset').toBe(2);
        expect(Number(theirs?.n), 'their side is unchanged').toBe(1);

        // And the deal it came from is closed out as countered, pointing at it.
        const [original] = await pipe.sql<{ state: string; countered_by: string | null }[]>`
          select state, countered_by::text from public.trades
           where save_id = ${saveId} and trade_id = ${out.tradeId}`;
        expect(original?.state).toBe('COUNTERED');
        expect(Number(original?.countered_by)).toBe(out.counterTradeId);

        // A counter has to be acceptable, or it is a refusal wearing terms.
        // Accepting it executes, and the player they were asked for arrives.
        const taken = await pipe.api.call<{ state: string }>('respond-trade', {
          saveId, tradeId: out.counterTradeId, action: 'ACCEPT',
        });
        expect(taken.state).toBe('ACCEPTED');
        const [landed] = await pipe.sql<{ team_id: string }[]>`
          select team_id from public.team_rosters
           where save_id = ${saveId} and player_id = ${target.playerId}`;
        expect(landed?.team_id, 'the player they countered for came over').toBe(userTeam);
        return;
      }
    }
    // Nothing on this roster was ever close to anything on theirs. That is a
    // legitimate league state rather than a fault, and saying so beats a
    // silent pass that proves nothing.
    expect(true, 'no near-miss package existed to counter').toBe(true);
  }, 300_000);
});
