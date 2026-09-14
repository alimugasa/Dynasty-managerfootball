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

  it("moves a player in the engine's own state, not only in the tables", async () => {
    // The one that hides. Every screen reads the relational tables, so a
    // signing that wrote team_rosters, a contract and a cap sheet looked
    // correct from every direction a person can look -- while the week runner,
    // which builds its elevens from the save document, still had the player
    // unattached. He never took a snap, and the next rollover projected the
    // document back over his roster row and undid the move entirely.
    //
    // So this asserts on the copy nobody can see.
    const moved = await pipe.sql<{ player_id: string; team_id: string }[]>`
      select distinct t.player_id, r.team_id
        from public.transactions t
        join public.team_rosters r on r.save_id = t.save_id and r.player_id = t.player_id
       where t.save_id = ${saveId}
         and t.kind in ('FREE_AGENT_SIGNING', 'WAIVER_CLAIM')
       limit 8`;
    expect(moved.length, 'no in-season signings to check').toBeGreaterThan(0);

    for (const m of moved) {
      const [doc] = await pipe.sql<{ team_id: string | null; contract: string | null }[]>`
        select p ->> 'teamId' as team_id, p ->> 'contract' as contract
          from public.save_documents d,
               lateral jsonb_array_elements(d.document -> 'players') as p
         where d.save_id = ${saveId} and p ->> 'id' = ${m.player_id}`;
      // A player the engine never modelled is not in the document at all, and
      // is not simulated either way -- nothing to keep in step.
      if (doc === undefined) continue;
      expect(doc.team_id, `${m.player_id} in the save document`).toBe(m.team_id);
      expect(doc.contract, `${m.player_id} contract in the save document`).not.toBeNull();
    }
  }, 120_000);

  it("takes a released player off his club in the engine's state too", async () => {
    const playerId = await waiverEligible();
    const [before] = await pipe.sql<{ team_id: string | null }[]>`
      select p ->> 'teamId' as team_id
        from public.save_documents d,
             lateral jsonb_array_elements(d.document -> 'players') as p
       where d.save_id = ${saveId} and p ->> 'id' = ${playerId}`;
    await pipe.api.call<CutOutcome>('cut-player', { saveId, playerId });
    const [after] = await pipe.sql<{ team_id: string | null; previous: string | null }[]>`
      select p ->> 'teamId' as team_id, p ->> 'previousTeamId' as previous
        from public.save_documents d,
             lateral jsonb_array_elements(d.document -> 'players') as p
       where d.save_id = ${saveId} and p ->> 'id' = ${playerId}`;
    if (before === undefined || after === undefined) return;
    expect(before.team_id).toBe(userTeam);
    expect(after.team_id).toBeNull();
    // And the club he just left is on record as the one he might go back to.
    expect(after.previous).toBe(userTeam);
  }, 120_000);

  it('charges the release against the dead money the engine carries', async () => {
    // The relational cap sheet is what the screens read; this is the figure
    // the offseason's compliance pass actually spends the winter working
    // around. A charge written to only one of them expires at the rollover,
    // which is the most convenient possible bug and so the one worth the test.
    const [dead] = await pipe.sql<{ total: string | null }[]>`
      select (d.document #>> array['deadMoney', ${userTeam},
              (select season::text from public.saves where id = ${saveId})]) as total
        from public.save_documents d where d.save_id = ${saveId}`;
    expect(Number(dead?.total ?? 0)).toBeGreaterThan(0);
  }, 60_000);
});
