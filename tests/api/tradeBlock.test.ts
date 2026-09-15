// The trade block, the deadline, and the league's own dealing.
//
// Split from trades.test.ts, which covers building a package and being
// answered. This covers everything around that: listing a player, the clock
// running out, and the other thirty-one clubs trading among themselves. The
// two halves share a season and nothing else, and one file long enough to hold
// both made a failure in either read as a failure in the other.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPipe, type Pipe } from './harness.ts';
import type { CreateSaveOut } from '../../supabase/functions/_shared/api/createSave';
import type { WeekOutcome } from '../../supabase/functions/_shared/api/week';
import type { TradeCenterOut } from '../../supabase/functions/_shared/api/reads/tradeCenter';
import type { TradeAssetsOut } from '../../supabase/functions/_shared/api/reads/tradeAssetsRead';
import type {
  BlockOut, ProposeOut,
} from '../../supabase/functions/_shared/api/handlers/tradeMoves';

const OWNER = '77777777-0000-0000-0000-0000000000bd';

describe('the trade block, the deadline and the league', () => {
  let pipe: Pipe;
  let saveId = '';
  let userTeam = '';

  const centre = (): Promise<TradeCenterOut> =>
    pipe.api.call<TradeCenterOut>('trade-center', { saveId });
  const assetsOf = (teamId: string): Promise<TradeAssetsOut> =>
    pipe.api.call<TradeAssetsOut>('trade-assets', { saveId, teamId });
  const propose = (teamId: string, give: string[], get: string[]): Promise<ProposeOut> =>
    pipe.api.call<ProposeOut>('propose-trade', { saveId, teamId, give, get });
  const sim = (): Promise<WeekOutcome> => pipe.api.call<WeekOutcome>('sim-week', { saveId });

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
      name: 'Block dynasty', teamId: 'SEA', slot: 1,
      gmFirstName: 'Rosalind', gmLastName: 'Achebe',
    });
    saveId = out.saveId;
    const [save] = await pipe.sql<{ user_team_id: string }[]>`
      select user_team_id from public.saves where id = ${saveId}`;
    userTeam = save?.user_team_id ?? '';
    for (let i = 0; i < 5; i += 1) await sim();
  }, 600_000);

  afterAll(async () => {
    if (saveId !== '') await pipe.sql`delete from public.saves where id = ${saveId}`;
    await pipe.close();
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
