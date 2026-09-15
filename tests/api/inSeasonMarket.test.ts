// The in-season market, against Postgres.
//
// Split from waivers.test.ts, which covers the wire: this covers what happens
// to a player once nobody has claimed him. The two share a season and nothing
// else -- a claim is a queue and a deadline, a signing is a negotiation -- and
// keeping them in one file made a suite long enough that a failure in one half
// read as a failure in the other.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPipe, type Pipe } from './harness.ts';
import type { CreateSaveOut } from '../../supabase/functions/_shared/api/createSave';
import type { WeekOutcome } from '../../supabase/functions/_shared/api/week';
import type { CutOutcome } from '../../supabase/functions/_shared/api/handlers/campMoves';
import type { FreeAgentsOut } from '../../supabase/functions/_shared/api/reads/freeAgents';
import type { TransactionsOut } from '../../supabase/functions/_shared/api/reads/transactions';
import type { OfferOut } from '../../supabase/functions/_shared/api/handlers/marketMoves';

const OWNER = '77777777-0000-0000-0000-0000000000fa';

describe('signing a free agent during the season', () => {
  let pipe: Pipe;
  let saveId = '';
  let userTeam = '';

  const pool = (extra: Record<string, unknown> = {}): Promise<FreeAgentsOut> =>
    pipe.api.call<FreeAgentsOut>('free-agents', { saveId, ...extra });
  const history = (extra: Record<string, unknown> = {}): Promise<TransactionsOut> =>
    pipe.api.call<TransactionsOut>('transactions', { saveId, ...extra });
  const sim = (): Promise<WeekOutcome> => pipe.api.call<WeekOutcome>('sim-week', { saveId });

  /** Releases the most expensive expendable player, until there is room. */
  const makeRoom = async (): Promise<void> => {
    for (let i = 0; i < 6; i += 1) {
      const p = await pool({ limit: 1 });
      if (p.capSpace > 8_000_000 && p.rosterCount < 53) return;
      const [row] = await pipe.sql<{ player_id: string }[]>`
        select r.player_id
          from public.team_rosters r
          join public.players p on p.save_id = r.save_id and p.player_id = r.player_id
          left join public.player_contracts c
            on c.save_id = r.save_id and c.player_id = r.player_id
           and c.contract_status = 'ACTIVE'
          left join public.team_depth_charts d
            on d.save_id = r.save_id and d.player_id = r.player_id
         where r.save_id = ${saveId} and r.team_id = ${userTeam}
           and coalesce(d.depth_order, 99) > 2
         order by c.average_annual_value desc nulls last
         limit 1`;
      if (row === undefined) return;
      await pipe.api.call<CutOutcome>('cut-player', { saveId, playerId: row.player_id });
    }
  };

  beforeAll(async () => {
    pipe = await openPipe(OWNER);
    await pipe.sql`delete from public.saves where user_id = ${OWNER} and not is_template`;
    const out = await pipe.api.call<CreateSaveOut>('create-save', {
      name: 'Market dynasty', teamId: 'DEN', slot: 1,
      gmFirstName: 'Imani', gmLastName: 'Fontaine',
    });
    saveId = out.saveId;
    const [save] = await pipe.sql<{ user_team_id: string }[]>`
      select user_team_id from public.saves where id = ${saveId}`;
    userTeam = save?.user_team_id ?? '';
    for (let i = 0; i < 4; i += 1) await sim();
    // Room and money first. This club opens the season carrying 53 men and a
    // little over the cap, which is a franchise situation rather than a fault
    // -- 25 of the 32 have room -- but it means no offer can be made at all
    // until something gives. Clearing it here rather than inside one test
    // makes it what it is: the precondition every signing shares.
    await makeRoom();
  }, 600_000);

  afterAll(async () => {
    if (saveId !== '') await pipe.sql`delete from public.saves where id = ${saveId}`;
    await pipe.close();
  }, 120_000);

  it('filters the pool by everything the screen offers', async () => {
    const all = await pool({ limit: 200 });
    expect(all.players.length).toBeGreaterThan(0);
    expect(all.poolSize).toBeGreaterThanOrEqual(all.players.length);

    const position = all.players[0]?.position ?? 'WR';
    const byPosition = await pool({ position, limit: 200 });
    expect(byPosition.players.every((p) => p.position === position)).toBe(true);

    // The position-group filter the screen's chips actually send. This failed
    // silently in a browser and could not fail here, because the filter was
    // matching the engine's group vocabulary ('QB') against the seed's display
    // grouping ('Quarterback') -- two different vocabularies one column apart.
    // Every chip on the screen emptied the list, and nothing said why.
    for (const group of ['QB', 'WR', 'CB']) {
      const byGroup = await pool({ group, limit: 200 });
      expect(byGroup.players.length, `${group} free agents`).toBeGreaterThan(0);
    }
    const quarterbacks = await pool({ group: 'QB', limit: 200 });
    expect(quarterbacks.players.every((p) => p.position === 'QB')).toBe(true);

    const young = await pool({ maxAge: 25, limit: 200 });
    expect(young.players.every((p) => p.age <= 25)).toBe(true);

    const good = await pool({ minOverall: 70, limit: 200 });
    expect(good.players.every((p) => p.overall >= 70)).toBe(true);

    const healthy = await pool({ health: 'HEALTHY', limit: 200 });
    expect(healthy.players.every((p) => p.injuredWeeksOut === null)).toBe(true);

    const cheap = await pool({ maxAsk: 2_000_000, limit: 200 });
    expect(cheap.players.every((p) => p.askingAav <= 2_000_000)).toBe(true);

    const byAge = await pool({ sort: 'AGE', limit: 20 });
    const ages = byAge.players.map((p) => p.age);
    expect([...ages].sort((a, b) => a - b)).toEqual(ages);
  });

  it('quotes an offer before it is put, and honours the quote', async () => {
    const p = await pool({ minOverall: 55, limit: 40 });
    const target = p.players[0];
    if (target === undefined) throw new Error('the pool is empty');

    const quote = await pipe.api.call<OfferOut>('offer-contract', {
      saveId, playerId: target.playerId,
    });
    expect(quote.outcome).toBeNull();
    expect(quote.quote.probability).toBeGreaterThanOrEqual(0);
    expect(quote.quote.probability).toBeLessThanOrEqual(1);
    expect(quote.suggested.years).toBeGreaterThanOrEqual(1);
    expect(quote.quote.capSpaceAfter).toBe(p.capSpace - quote.quote.capHit);
    expect(quote.quote.rosterAfter).toBe(p.rosterCount + 1);

    // A derisory offer is refused, and says why rather than failing.
    const lowball = await pipe.api.call<OfferOut>('offer-contract', {
      saveId, playerId: target.playerId, aav: 1, years: 1, role: 'DEPTH', commit: true,
    });
    expect(lowball.outcome?.verdict.kind).not.toBe('ACCEPTED');
  });

  it('signs a free agent, and moves the roster, cap, history and news with him', async () => {
    const p = await pool({ minOverall: 60, limit: 40 });
    const target = p.players.find((x) => x.injuredWeeksOut === null
      && x.askingAav < p.capSpace);
    if (target === undefined) throw new Error('nobody healthy and affordable in the pool');

    const quote = await pipe.api.call<OfferOut>('offer-contract', {
      saveId, playerId: target.playerId,
    });
    // Offer him his number, at the length and role he wants: this is the deal
    // the market model says closes.
    let signed = await pipe.api.call<OfferOut>('offer-contract', {
      saveId, playerId: target.playerId,
      aav: Math.round(quote.suggested.aav * 1.25),
      years: quote.suggested.years, role: quote.suggested.role, commit: true,
    });
    // He may want more than the opening number -- a player who wants a ring
    // does not join a club out of the race at his asking price. A counter
    // names what would close it, so meeting it has to close it: that round
    // trip is the whole reason a counter exists rather than a refusal.
    const counter = signed.outcome?.verdict;
    if (counter?.kind === 'COUNTERED') {
      signed = await pipe.api.call<OfferOut>('offer-contract', {
        saveId, playerId: target.playerId,
        aav: counter.aav, years: counter.years, role: 'STARTER', commit: true,
      });
    }
    expect(signed.outcome?.verdict.kind).toBe('ACCEPTED');

    const [roster] = await pipe.sql<{ team_id: string }[]>`
      select team_id from public.team_rosters
       where save_id = ${saveId} and player_id = ${target.playerId}`;
    expect(roster?.team_id).toBe(userTeam);

    // Off the pool: a signed player is not still available.
    const after = await pool({ limit: 200 });
    expect(after.players.some((x) => x.playerId === target.playerId)).toBe(false);

    const [contract] = await pipe.sql<{ aav: string; years: number }[]>`
      select average_annual_value::text as aav, years_remaining as years
        from public.player_contracts
       where save_id = ${saveId} and player_id = ${target.playerId}
         and contract_status = 'ACTIVE'`;
    expect(Number(contract?.aav)).toBe(signed.outcome?.aav);

    const log = await history({ kind: 'FREE_AGENT_SIGNING' });
    expect(log.rows.some((r) => r.playerId === target.playerId)).toBe(true);

    const [news] = await pipe.sql<{ n: string }[]>`
      select count(*)::text as n from public.news
       where save_id = ${saveId} and category = 'TRANSACTION'
         and player_id = ${target.playerId}`;
    expect(Number(news?.n)).toBeGreaterThan(0);
  }, 180_000);

  it('refuses a signing the roster has no room for', async () => {
    // Fill the roster to the limit, then try. The refusal has to come before
    // the player is asked, not after he says yes.
    await pipe.sql`
      insert into public.team_rosters (save_id, team_id, player_id, position, roster_status)
      select ${saveId}, ${userTeam}, p.player_id, p.position, 'ACTIVE'
        from public.players p
       where p.save_id = ${saveId} and p.team_id is null and p.retired_season is null
       limit greatest(0, 53 - (select count(*) from public.team_rosters
                                where save_id = ${saveId} and team_id = ${userTeam}))
      on conflict (save_id, player_id) do nothing`;
    const [count] = await pipe.sql<{ n: string }[]>`
      select count(*)::text as n from public.team_rosters
       where save_id = ${saveId} and team_id = ${userTeam}`;
    if (Number(count?.n) < 53) return;

    const p = await pool({ limit: 10 });
    const target = p.players[0];
    if (target === undefined) return;
    await expect(pipe.api.call('offer-contract', {
      saveId, playerId: target.playerId, aav: 20_000_000, years: 1,
      role: 'STARTER', commit: true,
    })).rejects.toThrow(/roster is full/i);
  }, 120_000);

  it('has the computer-run clubs working the market too', async () => {
    const log = await history({ limit: 300 });
    const theirs = log.rows.filter((r) => r.teamId !== userTeam);
    // Over a month of football with injuries accumulating, somebody other than
    // the managed club has moved a player. If nothing here ever fires, the
    // league is a museum and the manager is the only person in it.
    expect(theirs.length).toBeGreaterThan(0);
  });
});
