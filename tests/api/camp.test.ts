// Camp, the preseason and the cut, against Postgres.
//
// The claims worth a database: that the offseason hands over to camp rather
// than to week 1, that a preseason game is played and leaves the standings
// alone, that its statistics are kept apart from the season's, that a cut
// costs what the confirmation said it would, and that the season cannot start
// from an illegal roster.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPipe, type Pipe } from './harness.ts';
import type { CreateSaveOut } from '../../supabase/functions/_shared/api/createSave';
import type { SeasonOutcome } from '../../supabase/functions/_shared/api/rollover';
import type { WeekOutcome } from '../../supabase/functions/_shared/api/week';
import type { CampOut } from '../../supabase/functions/_shared/api/reads/camp';
import type {
  CampStepOutcome, CutOutcome, FinalizeOutcome,
} from '../../supabase/functions/_shared/api/handlers/campMoves';
import { PRESEASON_WEEKS } from '../../supabase/functions/_shared/api/preseason';

const OWNER = '77777777-0000-0000-0000-0000000000ca';

describe('training camp and the preseason', () => {
  let pipe: Pipe;
  let saveId = '';

  const board = (): Promise<CampOut> => pipe.api.call<CampOut>('camp', { saveId });
  const step = (): Promise<CampStepOutcome> =>
    pipe.api.call<CampStepOutcome>('advance-camp', { saveId });
  const phase = async (): Promise<string> => {
    const [row] = await pipe.sql<{ phase: string }[]>`
      select phase from public.saves where id = ${saveId}`;
    return row?.phase ?? '';
  };

  beforeAll(async () => {
    pipe = await openPipe(OWNER);
    await pipe.sql`delete from public.saves where user_id = ${OWNER} and not is_template`;
    const out = await pipe.api.call<CreateSaveOut>('create-save', {
      name: 'Camp dynasty', teamId: 'CLE', slot: 1,
      gmFirstName: 'Dahlia', gmLastName: 'Okonkwo',
    });
    saveId = out.saveId;
    // Get to an offseason the short way, then run it: camp is what the
    // offseason hands over to, so that is the path this tests.
    for (let i = 0; i < 25; i += 1) {
      const [s] = await pipe.sql<{ phase: string }[]>`
        select phase from public.saves where id = ${saveId}`;
      if (s?.phase !== 'REGULAR_SEASON' && s?.phase !== 'PLAYOFFS') break;
      await pipe.api.call<WeekOutcome>('sim-week', { saveId });
    }
    await pipe.api.call<SeasonOutcome>('advance-season', { saveId });
  }, 600_000);

  afterAll(async () => {
    if (saveId !== '') await pipe.sql`delete from public.saves where id = ${saveId}`;
    await pipe.close();
  }, 120_000);

  it('hands the offseason over to camp, not to week 1', async () => {
    expect(await phase()).toBe('TRAINING_CAMP');
  });

  it('opens camp on a roster bigger than the one the season starts with', async () => {
    const b = await board();
    expect(b.rosterCount).toBeGreaterThan(b.rosterLimit);
    expect(b.rosterLimit).toBe(53);
    expect(b.cutsRemaining).toBe(b.rosterCount - b.rosterLimit);
    // And it says why the roster is not legal yet, in the words the modal
    // uses. Matched on the part that does not change: this asserted the plural
    // "have to go", which holds only while more than one cut is owed -- and
    // how many are owed depends on the seed, so the test passed or failed on
    // which league it happened to get rather than on anything it was checking.
    expect(b.rosterFault).toMatch(/to go before the season/);
    expect(b.rosterFault).toContain(String(b.cutsRemaining));
    expect(b.players).toHaveLength(b.rosterCount);
    expect(b.groups.reduce((n, g) => n + g.count, 0)).toBe(b.rosterCount);
    expect(b.progress.advanceRoute).toBe('advance-camp');
    expect(b.progress.finalizeFault).toBe(b.rosterFault);
  });

  it('finds camp battles and puts somebody on the bubble', async () => {
    const b = await board();
    expect(b.battles.length).toBeGreaterThan(0);
    // A battle is two or more men close enough that it could go either way.
    for (const battle of b.battles) expect(battle.players.length).toBeGreaterThanOrEqual(2);
    expect(b.bubble.length).toBeGreaterThan(0);
    expect(b.rookies.length).toBeGreaterThan(0);
  });

  it('writes three preseason rounds when camp breaks', async () => {
    const out = await step();
    expect(out.phase).toBe('PRESEASON');
    const [row] = await pipe.sql<{ n: string; weeks: string }[]>`
      select count(*)::text as n, count(distinct week)::text as weeks
        from public.season_schedule
       where save_id = ${saveId} and competition = 'PRESEASON'`;
    expect(Number(row?.weeks)).toBe(PRESEASON_WEEKS);
    expect(Number(row?.n)).toBe(16 * PRESEASON_WEEKS);
    const b = await board();
    expect(b.fixtures).toHaveLength(PRESEASON_WEEKS);
    expect(b.fixtures.every((f) => f.result === null)).toBe(true);
  }, 120_000);

  it('plays the preseason without touching the standings or the record', async () => {
    const before = await pipe.sql<{ wins: number; losses: number }[]>`
      select wins, losses from public.standings
       where save_id = ${saveId} and season = (select season from public.saves where id = ${saveId})`;
    const out = await step();
    expect(out.game?.played).toBeGreaterThan(0);

    const after = await pipe.sql<{ wins: number; losses: number }[]>`
      select wins, losses from public.standings
       where save_id = ${saveId} and season = (select season from public.saves where id = ${saveId})`;
    // Not one win, not one loss, anywhere in the league.
    expect(after).toEqual(before);

    // The games exist, and they are marked as what they are.
    const [games] = await pipe.sql<{ n: string }[]>`
      select count(*)::text as n from public.game_results
       where save_id = ${saveId} and competition = 'PRESEASON'`;
    expect(Number(games?.n)).toBeGreaterThan(0);
    const b = await board();
    expect(b.fixtures.filter((f) => f.result !== null)).toHaveLength(1);
    expect(b.preseasonRecord.wins + b.preseasonRecord.losses + b.preseasonRecord.ties).toBe(1);
  }, 180_000);

  it('keeps preseason statistics apart from the season\'s', async () => {
    const rows = await pipe.sql<{ competition: string; n: string }[]>`
      select competition, count(*)::text as n from public.player_season_stats
       where save_id = ${saveId}
         and season = (select season from public.saves where id = ${saveId})
       group by competition`;
    const pre = rows.find((r) => r.competition === 'PRESEASON');
    expect(Number(pre?.n ?? 0)).toBeGreaterThan(0);
    // The new season has played no regular games, so there is nothing under
    // REGULAR to confuse it with -- which is the point.
    expect(rows.find((r) => r.competition === 'REGULAR')).toBeUndefined();
  });

  it('grades the roster once camp has been played', async () => {
    // Somebody was seen. Not every man on a ninety-man roster plays in three
    // games, so this asserts the preseason produced evaluations at all rather
    // than that any particular player got one.
    const [seen] = await pipe.sql<{ graded: string; played: string }[]>`
      select count(*) filter (where preseason_grade is not null)::text as graded,
             count(*) filter (where preseason_games > 0)::text as played
        from public.camp_evaluations
       where save_id = ${saveId}
         and season = (select season from public.saves where id = ${saveId})`;
    expect(Number(seen?.played)).toBeGreaterThan(0);
    expect(Number(seen?.graded)).toBeGreaterThan(0);
    const b = await board();
    expect(b.players.some((p) => p.preseasonGrade !== null)).toBe(true);
    expect(b.players.every((p) => p.practiceSource === 'RECORDED')).toBe(true);
    const graded = b.bubble.concat(b.rookies).concat(b.movers)
      .filter((p) => p.preseasonGrade !== null);
    // A grade is a read, not a rating: nothing here moved an overall.
    for (const p of graded) {
      expect(p.preseasonGrade).toBeGreaterThanOrEqual(0);
      expect(p.preseasonGrade).toBeLessThanOrEqual(100);
    }
  });

  it('refuses to start the season over the limit, and says by how many', async () => {
    // Play out the rest of the preseason.
    for (let i = 0; i < PRESEASON_WEEKS; i += 1) {
      if (await phase() !== 'PRESEASON') break;
      await step();
    }
    expect(await phase()).toBe('FINAL_CUTS');

    const blocked = await step();
    expect(blocked.blockedBy).toMatch(/to go before the season/);
    expect(blocked.cutsRemaining).toBeGreaterThan(0);
    // And it did not move the save on.
    expect(await phase()).toBe('FINAL_CUTS');

    const refused = await pipe.api.call<FinalizeOutcome>('finalize-roster', { saveId });
    expect(refused.finalized).toBe(false);
    expect(refused.fault).not.toBeNull();
  }, 300_000);

  it('states a cut before it makes it, and the two agree', async () => {
    const b = await board();
    const victim = b.bubble[0] ?? b.rookies[0];
    expect(victim).toBeDefined();
    const id = victim?.playerId ?? '';

    const preview = await pipe.api.call<CutOutcome>('preview-cut', { saveId, playerId: id });
    expect(preview.age).toBe(victim?.age);
    expect(preview.capHit).toBe(victim?.capHit);
    expect(preview.deadMoney).toBe(victim?.deadMoney);
    expect(preview.rosterAfter).toBe(preview.rosterBefore - 1);
    expect(preview.capSavings).toBe(Math.max(0, preview.capHit - preview.deadMoney));
    // Waivers or free agency, decided by accrued seasons and stated up front.
    expect(preview.waivers).toBe(preview.experienceYears < 4);

    const done = await pipe.api.call<CutOutcome>('cut-player', { saveId, playerId: id });
    expect(done.deadMoney).toBe(preview.deadMoney);
    expect(done.capSavings).toBe(preview.capSavings);

    // He is off the roster, off the chart, and recorded.
    const [still] = await pipe.sql<{ n: string }[]>`
      select count(*)::text as n from public.team_rosters
       where save_id = ${saveId} and player_id = ${id}`;
    expect(Number(still?.n)).toBe(0);
    const [logged] = await pipe.sql<{ kind: string; detail: string }[]>`
      select kind, detail from public.transactions
       where save_id = ${saveId} and player_id = ${id} order by transaction_id desc limit 1`;
    expect(logged?.kind).toBe('RELEASE');
    // Which of the two it was lives in the detail: a WAIVER_CLAIM is another
    // club claiming him, not this club letting him go.
    expect(logged?.detail).toContain(preview.waivers ? 'waivers' : 'free agent');
  }, 120_000);

  it('reports missing contract data and refuses an unpriced cut without changing the roster', async () => {
    const before = await board();
    const victim = before.players[0];
    if (victim === undefined) throw new Error('Camp fixture has no players');
    const contracts = await pipe.sql<{ contract_id: string }[]>`
      update public.player_contracts set contract_status = 'TERMINATED'
       where save_id = ${saveId} and player_id = ${victim.playerId} and contract_status = 'ACTIVE'
       returning contract_id`;
    expect(contracts.length).toBeGreaterThan(0);
    try {
      const missing = (await board()).players.find((p) => p.playerId === victim.playerId);
      expect(missing).toMatchObject({ capHit: null, deadMoney: null, probability: null, status: null });
      for (const route of ['preview-cut', 'cut-player']) {
        await expect(pipe.api.call(route, { saveId, playerId: victim.playerId })).rejects.toThrow('Contract information unavailable');
      }
      expect((await board()).rosterCount).toBe(before.rosterCount);
    } finally {
      for (const contract of contracts) await pipe.sql`
        update public.player_contracts set contract_status = 'ACTIVE'
         where save_id = ${saveId} and contract_id = ${contract.contract_id}`;
    }
  });

  it('starts the season once the roster is legal, and writes the story of it', async () => {
    // Cut to the limit the blunt way: this is a test of the gate, not of
    // whose 53 it is.
    for (let guard = 0; guard < 60; guard += 1) {
      const b = await board();
      if (b.cutsRemaining === 0) break;
      const next = b.bubble[0] ?? b.rookies[0] ?? b.veteransAtRisk[0];
      if (next === undefined) break;
      await pipe.api.call<CutOutcome>('cut-player', { saveId, playerId: next.playerId });
    }
    const ready = await board();
    expect(ready.rosterCount).toBe(ready.rosterLimit);
    expect(ready.rosterFault).toBeNull();

    const done = await pipe.api.call<FinalizeOutcome>('finalize-roster', { saveId });
    expect(done.finalized).toBe(true);
    expect(done.phase).toBe('REGULAR_SEASON');
    expect(await phase()).toBe('REGULAR_SEASON');

    // The roster is signed off for this season, and the feed says so.
    const [saved] = await pipe.sql<{ n: number | null; season: number }[]>`
      select roster_finalized_season as n, season from public.saves where id = ${saveId}`;
    expect(saved?.n).toBe(saved?.season);
    const [story] = await pipe.sql<{ headline: string; body: string }[]>`
      select headline, body from public.news
       where save_id = ${saveId} and category = 'FRANCHISE'
       order by news_id desc limit 1`;
    expect(story?.headline).toContain('roster');
    expect(story?.body).toContain('53 players');
  }, 600_000);

  it('plays week 1 for real once camp is over', async () => {
    const out = await pipe.api.call<WeekOutcome>('sim-week', { saveId });
    expect(out.played).toBeGreaterThan(0);
    // And now the standings do move.
    const [row] = await pipe.sql<{ n: string }[]>`
      select sum(wins + losses + ties)::text as n from public.standings
       where save_id = ${saveId} and season = (select season from public.saves where id = ${saveId})`;
    expect(Number(row?.n)).toBeGreaterThan(0);
  }, 180_000);
});
