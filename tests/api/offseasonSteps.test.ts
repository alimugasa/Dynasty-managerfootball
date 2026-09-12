// The offseason a manager plays through, against Postgres.
//
// One dynasty walked from the final whistle to the next September, making
// every decision the game offers on the way: keeping a player, cutting one,
// trading, drafting, and bidding in the market.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPipe, type Pipe } from './harness.ts';
import type { CreateSaveOut } from '../../supabase/functions/_shared/api/createSave';
import type { WeekOutcome } from '../../supabase/functions/_shared/api/week';
import type { OffseasonOut } from '../../supabase/functions/_shared/api/reads/offseason';
import type { StepOutcome } from '../../supabase/functions/_shared/api/steps';
import type { MoveOutcome, TradeOutcome } from '../../supabase/functions/_shared/api/moves';
import type { RecapOut } from '../../supabase/functions/_shared/api/reads/recap';

const TEAM = 'BUF';
const USER = '99999999-0000-0000-0000-00000000dead';

describe('an offseason played through', () => {
  let pipe: Pipe;
  let saveId = '';
  let season = 0;

  const read = (): Promise<OffseasonOut> => pipe.api.call<OffseasonOut>('offseason', { saveId });
  const step = (): Promise<StepOutcome> => pipe.api.call<StepOutcome>('advance-offseason', { saveId });

  beforeAll(async () => {
    pipe = await openPipe(USER);
    const created = await pipe.api.call<CreateSaveOut>('create-save', { name: 'Winter', teamId: TEAM });
    saveId = created.saveId;
    let phase = 'REGULAR_SEASON';
    while (phase === 'REGULAR_SEASON' || phase === 'PLAYOFFS') {
      const out = await pipe.api.call<WeekOutcome>('sim-week', { saveId });
      phase = out.phase;
      season = out.season;
    }
  }, 300_000);

  afterAll(async () => {
    await pipe.sql`delete from public.saves where id = ${saveId}`;
    await pipe.close();
  });

  it('opens on the season just played, with nothing to decide yet', async () => {
    const out = await read();
    expect(out.phase).toBe('OFFSEASON');
    expect(out.label).toBe('Season over');
    expect(out.expiring).toEqual([]);
    expect(out.roster.length).toBeGreaterThan(40);
    expect(out.capLimit).toBeGreaterThan(0);
  });

  it('ends the season on the awards, then the year, then the work', async () => {
    const voted = await step();
    expect(voted.phase).toBe('AWARDS');
    expect(voted.summary).toBe('The votes are in');
    // The ceremony reads the vote that was just taken.
    const ceremony = await pipe.api.call<RecapOut>('recap', { saveId, season });
    expect(ceremony.awards.length).toBe(5);
    expect(ceremony.honours.filter((h) => h.team === 'ALL_LEAGUE_FIRST').length).toBeGreaterThan(20);

    const year = await step();
    expect(year.phase).toBe('RECAP');
    expect(year.summary).toContain(String(season));
    expect((await read()).label).toBe('The year in review');

    const outcome = await step();
    expect(outcome.phase).toBe('RETIREMENTS');
    expect(outcome.summary).toContain('out of contract');
    const out = await read();
    expect(out.expiring.length).toBeGreaterThan(0);
    for (const p of out.expiring) {
      expect(p.ask).toBeGreaterThan(0);
      expect(p.name).not.toBe('');
    }
  }, 120_000);

  it('names his price, and holds you to it', async () => {
    const before = await read();
    const target = before.expiring.find((p) => (p.ask ?? 0) < before.capRoom);
    expect(target).toBeDefined();
    const ask = target?.ask ?? 0;

    const lowball = await pipe.api.call<MoveOutcome>('re-sign', {
      saveId, playerId: target?.playerId, years: 3, aav: Math.round(ask * 0.5),
    });
    expect(lowball.done).toBe(false);
    expect(lowball.detail).toContain('wants');

    const agreed = await pipe.api.call<MoveOutcome>('re-sign', {
      saveId, playerId: target?.playerId, years: 3, aav: ask,
    });
    expect(agreed.done).toBe(true);
    const after = await read();
    expect(after.roster.some((p) => p.playerId === target?.playerId)).toBe(true);
    expect(after.expiring.some((p) => p.playerId === target?.playerId)).toBe(false);
    // The deal is on the books, at the price agreed.
    const [row] = await pipe.sql<{ aav: string }[]>`
      select average_annual_value::text as aav from public.player_contracts
       where save_id = ${saveId} and player_id = ${target?.playerId ?? ''}`;
    expect(Number(row?.aav)).toBe(ask);
  }, 60_000);

  it('releases a player, and charges the dead money for it', async () => {
    const before = await read();
    const target = before.roster.find((p) => (p.deadMoney ?? 0) > 0 && (p.aav ?? 0) > 0);
    expect(target).toBeDefined();
    const out = await pipe.api.call<MoveOutcome>('release', { saveId, playerId: target?.playerId });
    expect(out.done).toBe(true);
    expect(out.detail).toContain('dead money');
    const after = await read();
    expect(after.roster.some((p) => p.playerId === target?.playerId)).toBe(false);
    const [logged] = await pipe.sql<{ kind: string }[]>`
      select kind from public.transactions
       where save_id = ${saveId} and player_id = ${target?.playerId ?? ''} and kind = 'RELEASE'`;
    expect(logged?.kind).toBe('RELEASE');
  }, 60_000);

  it('refuses a trade that is not worth their while, and says why', async () => {
    const mine = await read();
    const ranked = [...mine.roster].sort((a, b) => b.tradeValue - a.tradeValue);
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    const theirs = await pipe.sql<{ player_id: string }[]>`
      select player_id from public.team_rosters
       where save_id = ${saveId} and team_id = 'DAL' and roster_status = 'ACTIVE' limit 60`;
    const theirBest = theirs[0]?.player_id ?? '';

    const refused = await pipe.api.call<TradeOutcome>('trade', {
      saveId, teamId: 'DAL', give: [worst?.playerId ?? ''], get: [theirBest],
    });
    expect(refused.done).toBe(false);
    expect(refused.detail).not.toBe('');
    expect(refused.wanted).toBeGreaterThan(0);

    // The other way round: they take the better player for a fringe one.
    const accepted = await pipe.api.call<TradeOutcome>('trade', {
      saveId, teamId: 'DAL', give: [best?.playerId ?? ''], get: [theirs[theirs.length - 1]?.player_id ?? ''],
    });
    expect(accepted.done).toBe(true);
    const [moved] = await pipe.sql<{ team_id: string }[]>`
      select team_id from public.team_rosters
       where save_id = ${saveId} and player_id = ${best?.playerId ?? ''}`;
    expect(moved?.team_id).toBe('DAL');
    const [logged] = await pipe.sql<{ n: string }[]>`
      select count(*)::text as n from public.transactions
       where save_id = ${saveId} and kind = 'TRADE'`;
    expect(Number(logged?.n)).toBe(2);
  }, 60_000);

  it('stops the draft on your pick and takes the player you name', async () => {
    expect((await step()).phase).toBe('DRAFT');
    const opened = await step();
    expect(opened.phase).toBe('DRAFT');
    expect(opened.waitingOnPick).not.toBeNull();

    const board = await read();
    expect(board.onTheClock).not.toBeNull();
    expect(board.board.length).toBeGreaterThan(5);
    const wanted = board.board[0];
    const picked = await pipe.api.call<MoveOutcome>('draft-pick', {
      saveId, prospectId: wanted?.prospectId,
    });
    expect(picked.done).toBe(true);
    expect(picked.detail).toContain(wanted?.name ?? '');

    const [row] = await pipe.sql<{ team: string; user: boolean }[]>`
      select current_owner_team_id as team, made_by_user as user from public.draft_picks
       where save_id = ${saveId} and selected_player_id = ${wanted?.prospectId ?? ''}`;
    expect(row?.team).toBe(TEAM);
    expect(row?.user).toBe(true);
  }, 180_000);

  it('runs the rest of the draft and opens the market', async () => {
    let phase = (await read()).phase;
    let guard = 0;
    while (phase === 'DRAFT' && guard < 12) {
      guard += 1;
      const out = await step();
      phase = out.phase;
      if (out.waitingOnPick !== null) {
        const board = await read();
        await pipe.api.call<MoveOutcome>('draft-pick', {
          saveId, prospectId: board.board[0]?.prospectId,
        });
        phase = (await read()).phase;
      }
    }
    expect(phase).toBe('FREE_AGENCY');
    // The class is named for the season it declared in, which is the season
    // just played: it is drafted in that winter and plays the year after.
    const [picks] = await pipe.sql<{ n: string }[]>`
      select count(*)::text as n from public.draft_picks
       where save_id = ${saveId} and draft_year = ${season} and selected_player_id is not null`;
    expect(Number(picks?.n)).toBeGreaterThan(200);
    const mine = await pipe.sql<{ n: string }[]>`
      select count(*)::text as n from public.draft_picks
       where save_id = ${saveId} and draft_year = ${season} and made_by_user`;
    expect(Number(mine[0]?.n)).toBeGreaterThan(0);
  }, 300_000);

  it('takes your offers into the market, where they can win and can lose', async () => {
    const market = await read();
    expect(market.market.length).toBeGreaterThan(5);
    // Three offers, each well above the asking price: a manager who overpays
    // that hard gets somebody. Which of the three is the market's business --
    // a player weighs money against the club, and can still say no.
    const targets = market.market
      .filter((p) => (p.ask ?? 0) * 2.5 < market.capRoom / 3)
      .slice(0, 3);
    expect(targets.length).toBe(3);
    for (const t of targets) {
      const made = await pipe.api.call<MoveOutcome>('offer', {
        saveId, playerId: t.playerId, aav: Math.round((t.ask ?? 0) * 2.5), years: 3,
      });
      expect(made.done).toBe(true);
    }
    expect((await read()).offers.length).toBe(3);

    const opened = await step();
    expect(opened.phase).toBe('CAMP');
    expect(opened.summary).toContain('signings');
    const signed = await pipe.sql<{ player_id: string; team_id: string }[]>`
      select player_id, team_id from public.team_rosters
       where save_id = ${saveId}
         and player_id = any(${targets.map((t) => t.playerId)}::text[])`;
    expect(signed.some((r) => r.team_id === TEAM)).toBe(true);
  }, 180_000);

  it('breaks camp into a legal roster and a new season', async () => {
    const out = await step();
    expect(out.phase).toBe('REGULAR_SEASON');
    expect(out.seasonStarted?.season).toBe(season + 1);

    const [save] = await pipe.sql<{ season: number; week: number; phase: string }[]>`
      select season, week, phase from public.saves where id = ${saveId}`;
    expect(save).toEqual({ season: season + 1, week: 1, phase: 'REGULAR_SEASON' });
    const rosters = await pipe.sql<{ team_id: string; n: string }[]>`
      select team_id, count(*)::text as n from public.team_rosters
       where save_id = ${saveId} group by team_id`;
    expect(rosters.length).toBe(32);
    for (const r of rosters) expect(Number(r.n)).toBe(53);
    // The winter's decisions are finished with; nothing is left in flight.
    const [state] = await pipe.sql<{ offseason: unknown }[]>`
      select offseason from public.save_documents where save_id = ${saveId}`;
    expect(state?.offseason).toBeNull();
  }, 180_000);
});
