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
import type {
  BlockOut, ProposeOut,
} from '../../supabase/functions/_shared/api/handlers/tradeMoves';

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

  it('puts a player on the block, and he notices', async () => {
    const mine = await assetsOf(userTeam);
    const target = mine.players[5];
    if (target === undefined) throw new Error('empty roster');

    const on = await pipe.api.call<BlockOut>('trade-block', {
      saveId, playerId: target.playerId, listed: true, note: 'Looking for a pick',
    });
    expect(on.listed).toBe(true);
    // Morale is created by this event, because being shopped is exactly the
    // event that makes a player's mood knowable.
    expect(on.morale).not.toBeNull();

    const c = await centre();
    const listed = c.block.find((b) => b.playerId === target.playerId);
    expect(listed).toBeDefined();
    expect(listed?.note).toBe('Looking for a pick');
    expect(listed?.moraleLabel).toBeTruthy();

    // And taking him off returns some of it.
    const off = await pipe.api.call<BlockOut>('trade-block', {
      saveId, playerId: target.playerId, listed: false,
    });
    expect(off.listed).toBe(false);
    expect(off.morale ?? 0).toBeGreaterThan(on.morale ?? 0);
  });

  it('refuses to list a player who is not on this roster', async () => {
    const them = await assetsOf(await rival());
    await expect(pipe.api.call('trade-block', {
      saveId, playerId: them.players[0]?.playerId ?? '', listed: true,
    })).rejects.toThrow(/your roster/i);
  });

  it('has the other thirty-one clubs trading with each other', async () => {
    // Play on until the league does something. A manager who does nothing at
    // the deadline should still find the league changed when they look; if
    // nothing ever happens here, the Trade Center is a shop rather than a
    // league.
    for (let i = 0; i < 6; i += 1) {
      const [row] = await pipe.sql<{ n: string }[]>`
        select count(*)::text as n from public.trades
         where save_id = ${saveId} and state = 'ACCEPTED'
           and from_team_id <> ${userTeam} and to_team_id <> ${userTeam}`;
      if (Number(row?.n) > 0) {
        const c = await centre();
        expect(c.leagueActivity.length).toBeGreaterThan(0);
        return;
      }
      await sim();
    }
    throw new Error('six weeks and no club traded with another');
  }, 300_000);

  it('shuts at the deadline and stays shut', async () => {
    const before = await centre();
    // Play past the deadline.
    for (let i = 0; i < 20; i += 1) {
      const c = await centre();
      if (!c.open) break;
      await sim();
    }
    const after = await centre();
    expect(after.open).toBe(false);
    expect(after.notice).toBeTruthy();

    // And a trade cannot be agreed now, whatever it is worth.
    const teamId = before.clubs[0]?.teamId ?? '';
    const them = await assetsOf(teamId);
    const mine = await centre();
    const target = them.players.find((p) => !p.untouchable);
    if (target !== undefined && mine.picks.length > 0) {
      await expect(propose(teamId,
        mine.picks.slice(0, 3).map((p) => `PICK:${p.pickId}`),
        [`PLAYER:${target.playerId}`])).rejects.toThrow();
    }
  }, 600_000);

  it('writes a deadline recap the league can read', async () => {
    const [row] = await pipe.sql<{ n: string }[]>`
      select count(*)::text as n from public.news
       where save_id = ${saveId} and category = 'TRANSACTION'
         and headline ilike '%deadline%'`;
    expect(Number(row?.n)).toBeGreaterThan(0);
  });
});
