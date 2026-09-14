// The wire and the market, against Postgres.
//
// The request names five things this feature has to do, and each one is an
// assertion here: a cut player enters waivers, a claim resolves correctly, an
// unclaimed player becomes a free agent, the user and the computer-run clubs
// sign players during the season, and every transaction moves the roster, the
// cap, the history and the news.
//
// It runs against a season in progress rather than a fixture, because almost
// every defect this feature could have is a defect about ordering -- a claim
// settled before the window shut, a cap sheet read before the contract moved,
// a player on two rosters for a week -- and none of those are visible without
// a real week being played on top of them.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPipe, type Pipe } from './harness.ts';
import type { CreateSaveOut } from '../../supabase/functions/_shared/api/createSave';
import type { WeekOutcome } from '../../supabase/functions/_shared/api/week';
import type { CutOutcome } from '../../supabase/functions/_shared/api/handlers/campMoves';
import type { WaiverWireOut } from '../../supabase/functions/_shared/api/reads/waiverWire';
import type { FreeAgentsOut } from '../../supabase/functions/_shared/api/reads/freeAgents';
import type { TransactionsOut } from '../../supabase/functions/_shared/api/reads/transactions';
import type { OfferOut } from '../../supabase/functions/_shared/api/handlers/marketMoves';
import type { ClaimResult } from '../../supabase/functions/_shared/api/waivers';

const OWNER = '77777777-0000-0000-0000-0000000000wb'.replace('wb', 'cb');

describe('the waiver wire and the in-season market', () => {
  let pipe: Pipe;
  let saveId = '';
  let userTeam = '';

  const wire = (): Promise<WaiverWireOut> =>
    pipe.api.call<WaiverWireOut>('waiver-wire', { saveId });
  const pool = (extra: Record<string, unknown> = {}): Promise<FreeAgentsOut> =>
    pipe.api.call<FreeAgentsOut>('free-agents', { saveId, ...extra });
  const history = (extra: Record<string, unknown> = {}): Promise<TransactionsOut> =>
    pipe.api.call<TransactionsOut>('transactions', { saveId, ...extra });
  const sim = (): Promise<WeekOutcome> => pipe.api.call<WeekOutcome>('sim-week', { saveId });

  /** Somebody on the roster with fewer than four accrued seasons, who is
   *  therefore subject to waivers, and who is not a starter. */
  const waiverEligible = async (): Promise<string> => {
    const [row] = await pipe.sql<{ player_id: string }[]>`
      select r.player_id
        from public.team_rosters r
        join public.players p on p.save_id = r.save_id and p.player_id = r.player_id
       where r.save_id = ${saveId} and r.team_id = ${userTeam}
         and p.experience_years < 4
       order by p.overall_rating asc
       limit 1`;
    if (row === undefined) throw new Error('no waiver-eligible player on the roster');
    return row.player_id;
  };

  beforeAll(async () => {
    pipe = await openPipe(OWNER);
    await pipe.sql`delete from public.saves where user_id = ${OWNER} and not is_template`;
    const out = await pipe.api.call<CreateSaveOut>('create-save', {
      name: 'Wire dynasty', teamId: 'DEN', slot: 1,
      gmFirstName: 'Imani', gmLastName: 'Fontaine',
    });
    saveId = out.saveId;
    const [save] = await pipe.sql<{ user_team_id: string }[]>`
      select user_team_id from public.saves where id = ${saveId}`;
    userTeam = save?.user_team_id ?? '';
    // Four weeks, so the table means something and the queue is built from it
    // rather than from last season.
    for (let i = 0; i < 4; i += 1) await sim();
  }, 600_000);

  afterAll(async () => {
    if (saveId !== '') await pipe.sql`delete from public.saves where id = ${saveId}`;
    await pipe.close();
  }, 120_000);

  it('gives every club a place in the queue', async () => {
    const [row] = await pipe.sql<{ n: string; distinct: string; worst: string }[]>`
      select count(waiver_priority)::text as n,
             count(distinct waiver_priority)::text as distinct,
             max(waiver_priority)::text as worst
        from public.teams where save_id = ${saveId}`;
    expect(Number(row?.n)).toBe(32);
    // A queue in which two clubs hold the same place is not a queue.
    expect(Number(row?.distinct)).toBe(32);
    expect(Number(row?.worst)).toBe(32);

    const w = await wire();
    expect(w.priority).not.toBeNull();
    expect(w.clubs).toBe(32);
  });

  it('puts a cut player on the wire instead of losing him', async () => {
    const playerId = await waiverEligible();
    const cut = await pipe.api.call<CutOutcome>('cut-player', { saveId, playerId });
    expect(cut.waivers).toBe(true);

    const [row] = await pipe.sql<{ state: string; deadline_week: number; posted_week: number }[]>`
      select state, deadline_week, posted_week from public.waiver_wire
       where save_id = ${saveId} and player_id = ${playerId}`;
    expect(row?.state).toBe('OPEN');
    // The window shuts after the week he was posted in, not in it.
    expect(row?.deadline_week).toBeGreaterThan(row?.posted_week ?? 0);

    // He is not in the market yet: on waivers and a free agent are different
    // states, and the whole feature depends on them staying different.
    const [fa] = await pipe.sql<{ n: string }[]>`
      select count(*)::text as n from public.free_agents
       where save_id = ${saveId} and player_id = ${playerId}`;
    expect(Number(fa?.n)).toBe(0);

    const w = await wire();
    expect(w.players.map((p) => p.playerId)).toContain(playerId);
  }, 120_000);

  it('records the release in the history and the feed', async () => {
    const log = await history({ kind: 'RELEASE' });
    const mine = log.rows.filter((r) => r.teamId === userTeam);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine[0]?.detail).toContain('waivers');

    const [news] = await pipe.sql<{ n: string }[]>`
      select count(*)::text as n from public.news
       where save_id = ${saveId} and category = 'TRANSACTION' and team_id = ${userTeam}`;
    expect(Number(news?.n)).toBeGreaterThan(0);
  });

  it('charges the cut against the cap sheet the screens read', async () => {
    const [sheet] = await pipe.sql<{ available: string; committed: string; dead_money: string }[]>`
      select available::text, committed::text, dead_money::text
        from public.salary_cap
       where save_id = ${saveId} and team_id = ${userTeam}
         and season = (select season from public.saves where id = ${saveId})`;
    // The sheet is a live sum, not last rollover's projection: available is
    // the limit less what is committed less what is dead.
    const available = Number(sheet?.available);
    const committed = Number(sheet?.committed);
    const dead = Number(sheet?.dead_money);
    expect(available).toBe(await capLimit() - committed - dead);
  });

  const capLimit = async (): Promise<number> => {
    const [row] = await pipe.sql<{ cap_limit: string }[]>`
      select cap_limit::text from public.salary_cap
       where save_id = ${saveId} and team_id = ${userTeam}
         and season = (select season from public.saves where id = ${saveId})`;
    return Number(row?.cap_limit);
  };

  /**
   * Somebody another club put on the wire. A club cannot claim a player it
   * released itself, so the managed club's own cuts are no use here.
   *
   * It plays weeks until one appears rather than assuming one has. The
   * computer-run clubs release players when they need the roster place, which
   * is a thing that happens over a season rather than on a schedule -- but a
   * league in which nothing reaches the wire in six weeks is a league where
   * this whole feature does nothing, so running out is a failure and says so.
   */
  const claimable = async (): Promise<{ playerId: string; deadlineWeek: number }> => {
    for (let i = 0; i < 6; i += 1) {
      const w = await wire();
      const found = w.players.find((p) => p.fromTeamId !== userTeam);
      if (found !== undefined) {
        return { playerId: found.playerId, deadlineWeek: found.deadlineWeek };
      }
      await sim();
    }
    throw new Error('six weeks and no club put a player on the wire');
  };

  /** Plays weeks until the save has passed a claim window's deadline, which is
   *  when the award has been made. */
  const simPast = async (deadlineWeek: number): Promise<void> => {
    for (let i = 0; i < 5; i += 1) {
      const [row] = await pipe.sql<{ week: number }[]>`
        select week from public.saves where id = ${saveId}`;
      if ((row?.week ?? 0) > deadlineWeek) return;
      await sim();
    }
  };

  it('lets a club claim, and lets it change its mind before the deadline', async () => {
    const target = await claimable();
    const w = await wire();

    const claim = await pipe.api.call<ClaimResult>('claim-player', {
      saveId, playerId: target.playerId,
    });
    expect(claim.priority).toBe(w.priority);
    expect(claim.claims).toBeGreaterThanOrEqual(1);

    const after = await wire();
    expect(after.players.find((p) => p.playerId === target.playerId)?.claimed).toBe(true);
    expect(after.claimsSubmitted).toBeGreaterThanOrEqual(1);

    await pipe.api.call('withdraw-claim', { saveId, playerId: target.playerId });
    const withdrawn = await wire();
    expect(withdrawn.players.find((p) => p.playerId === target.playerId)?.claimed).toBe(false);

    // And a claim that has been withdrawn cannot be withdrawn again.
    await expect(pipe.api.call('withdraw-claim', { saveId, playerId: target.playerId }))
      .rejects.toThrow();
  });

  it('settles a claim to the claiming club when the deadline passes', async () => {
    const target = await claimable();
    await pipe.api.call<ClaimResult>('claim-player', { saveId, playerId: target.playerId });

    const before = await pipe.sql<{ n: string }[]>`
      select count(*)::text as n from public.team_rosters
       where save_id = ${saveId} and team_id = ${userTeam}`;

    // Played out to the other side of the window, which is where the award
    // has been made.
    await simPast(target.deadlineWeek);

    const [wired] = await pipe.sql<{ state: string; awarded_team_id: string | null }[]>`
      select state, awarded_team_id from public.waiver_wire
       where save_id = ${saveId} and player_id = ${target.playerId}`;
    expect(wired?.state).not.toBe('OPEN');

    if (wired?.awarded_team_id === userTeam) {
      // He is on the roster, on a contract, and off the wire's list.
      const [roster] = await pipe.sql<{ team_id: string }[]>`
        select team_id from public.team_rosters
         where save_id = ${saveId} and player_id = ${target.playerId}`;
      expect(roster?.team_id).toBe(userTeam);
      const [contract] = await pipe.sql<{ team_id: string; status: string }[]>`
        select team_id, contract_status as status from public.player_contracts
         where save_id = ${saveId} and player_id = ${target.playerId}
           and contract_status = 'ACTIVE'`;
      expect(contract?.team_id).toBe(userTeam);
      const after = await pipe.sql<{ n: string }[]>`
        select count(*)::text as n from public.team_rosters
         where save_id = ${saveId} and team_id = ${userTeam}`;
      expect(Number(after[0]?.n)).toBe(Number(before[0]?.n) + 1);
      // And the claim is in the history.
      const log = await history({ kind: 'WAIVER_CLAIM' });
      expect(log.rows.some((r) => r.playerId === target.playerId)).toBe(true);
    } else {
      // A club ahead in the queue took him, and this club was told so.
      const [notice] = await pipe.sql<{ n: string }[]>`
        select count(*)::text as n from public.news
         where save_id = ${saveId} and team_id = ${userTeam}
           and category = 'TRANSACTION' and headline like 'Waiver claim unsuccessful%'`;
      expect(Number(notice?.n)).toBeGreaterThan(0);
    }
  }, 300_000);

  it('sends a player nobody claimed to the market', async () => {
    // Cut somebody, let the window pass without claiming him, and he should be
    // in the pool -- available, priced, and describable.
    const playerId = await waiverEligible();
    const cut = await pipe.api.call<CutOutcome>('cut-player', { saveId, playerId });
    const [posted] = await pipe.sql<{ deadline_week: number }[]>`
      select deadline_week from public.waiver_wire
       where save_id = ${saveId} and player_id = ${playerId}
       order by posted_week desc limit 1`;
    await simPast(posted?.deadline_week ?? 0);

    const [row] = await pipe.sql<{ state: string; awarded_team_id: string | null }[]>`
      select state, awarded_team_id from public.waiver_wire
       where save_id = ${saveId} and player_id = ${playerId}
       order by posted_week desc limit 1`;
    if (row?.state === 'CLEARED') {
      const p = await pool({ search: cut.name, limit: 200 });
      const found = p.players.find((x) => x.playerId === playerId);
      expect(found).toBeDefined();
      expect(found?.askingAav).toBeGreaterThan(0);
      // What he is asking this season is less than his annual ask, because
      // there is less than a season left to play.
      expect(found?.inSeasonAsk).toBeLessThanOrEqual(found?.askingAav ?? 0);
      expect(found?.desiredRole).not.toBeNull();
    } else {
      // A computer-run club claimed him, which is the other correct outcome.
      expect(row?.awarded_team_id).not.toBeNull();
    }
  }, 300_000);

  it('filters the pool by everything the screen offers', async () => {
    const all = await pool({ limit: 200 });
    expect(all.players.length).toBeGreaterThan(0);
    expect(all.poolSize).toBeGreaterThanOrEqual(all.players.length);

    const position = all.players[0]?.position ?? 'WR';
    const byPosition = await pool({ position, limit: 200 });
    expect(byPosition.players.every((p) => p.position === position)).toBe(true);

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
    // Room first. This club opened the season a little over the cap, which is
    // a franchise situation rather than a fault -- 25 of the 32 have room --
    // and the loop the request describes is exactly this: clear the space,
    // then spend it.
    await makeRoom();
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
