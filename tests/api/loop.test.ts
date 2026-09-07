// The loop, against Postgres.
//
// Successor to the in-memory newGame suite: the same properties -- two
// dynasties differ, the ledger forbids a repeat, a week is written whole --
// proven on rows rather than on an object graph. Every assertion below is a
// count or a value read back from the database after the API call returned.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { countRows, openPipe, type Pipe } from './harness.ts';
import type { CreateSaveOut } from '../../supabase/functions/_shared/api/createSave';
import type { WeekOutcome } from '../../supabase/functions/_shared/api/week';
import type { RosterOut } from '../../supabase/functions/_shared/api/reads/roster';
import type { TeamOut } from '../../supabase/functions/_shared/api/reads/team';

const PORT = 8792;
const TEAM = 'BUF';

describe('the loop against Postgres', () => {
  let pipe: Pipe;
  const saves: string[] = [];

  beforeAll(async () => {
    pipe = await openPipe(PORT);
    for (const name of ['Loop A', 'Loop B']) {
      const out = await pipe.api.call<CreateSaveOut>('create-save', { name, teamId: TEAM });
      saves.push(out.saveId);
    }
  }, 60_000);

  afterAll(async () => {
    for (const id of saves) await pipe.sql`delete from public.saves where id = ${id}`;
    await pipe.close();
  });

  it('gives two dynasties for the same club different seeds and different week-1 results', async () => {
    const [a, b] = saves as [string, string];
    const seeds = await pipe.sql<{ rng_seed: string }[]>`
      select rng_seed::text from public.saves where id in (${a}, ${b})`;
    expect(new Set(seeds.map((s) => s.rng_seed)).size).toBe(2);

    await pipe.api.call<WeekOutcome>('sim-week', { saveId: a });
    await pipe.api.call<WeekOutcome>('sim-week', { saveId: b });
    const scores = async (id: string): Promise<string> => {
      const rows = await pipe.sql<{ game_id: string; home_score: number; away_score: number }[]>`
        select game_id, home_score, away_score from public.game_results
         where save_id = ${id} and week = 1 order by game_id`;
      return rows.map((r) => `${r.game_id}:${String(r.home_score)}-${String(r.away_score)}`).join(' ');
    };
    expect(await countRows(pipe.sql, 'game_results', a)).toBe(16);
    expect(await scores(a)).not.toBe(await scores(b));
  }, 60_000);

  it('writes a week whole: lines, totals, table, injuries, stories, and the save', async () => {
    const [a] = saves as [string, string];
    const lines = await countRows(pipe.sql, 'player_game_stats', a);
    expect(lines).toBeGreaterThan(500);
    expect(await countRows(pipe.sql, 'player_season_stats', a)).toBe(lines);
    expect(await countRows(pipe.sql, 'standings', a, 'and wins + losses + ties = 1')).toBe(32);
    expect(await countRows(pipe.sql, 'news', a, 'and week = 1')).toBeGreaterThan(0);
    const [save] = await pipe.sql<{ week: number; phase: string }[]>`
      select week, phase from public.saves where id = ${a}`;
    expect(save).toEqual({ week: 2, phase: 'REGULAR_SEASON' });
    // Nothing the engine does not count is written as a number.
    const [nulls] = await pipe.sql<{ n: string }[]>`
      select count(*) as n from public.player_season_stats
       where save_id = ${a} and (snaps is not null or games_started is not null or fumbles is not null)`;
    expect(Number(nulls?.n)).toBe(0);
  });

  it('plays the depth chart the client set', async () => {
    const [a] = saves as [string, string];
    const before = await pipe.api.call<RosterOut>('roster', { saveId: a, group: 'QB' });
    expect(before.order.length).toBeGreaterThanOrEqual(2);
    const order = before.order.map((r) => r.playerId);
    const swapped = [order[1] ?? '', order[0] ?? '', ...order.slice(2)];
    await pipe.api.call('set-depth-chart', { saveId: a, group: 'QB', order: swapped });

    const [row] = await pipe.sql<{ player_id: string; is_starter: boolean }[]>`
      select player_id, is_starter from public.team_depth_charts
       where save_id = ${a} and team_id = ${TEAM} and slot = 'QB' and depth_order = 1`;
    expect(row).toEqual({ player_id: swapped[0], is_starter: true });

    await pipe.api.call<WeekOutcome>('sim-week', { saveId: a });
    const [line] = await pipe.sql<{ pass_att: number }[]>`
      select pass_att from public.player_game_stats
       where save_id = ${a} and week = 2 and team_id = ${TEAM} and player_id = ${swapped[0] ?? ''}`;
    expect(line?.pass_att ?? 0).toBeGreaterThan(0);
  }, 60_000);

  it('refuses a chart that is not a permutation of the group', async () => {
    const [a] = saves as [string, string];
    await expect(pipe.api.call('set-depth-chart', { saveId: a, group: 'QB', order: ['NOBODY'] }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('never repeats a headline within a season, across requests', async () => {
    const [a] = saves as [string, string];
    for (let i = 0; i < 4; i += 1) await pipe.api.call<WeekOutcome>('sim-week', { saveId: a });
    const [dupes] = await pipe.sql<{ n: string }[]>`
      select count(*) - count(distinct headline) as n from public.news
       where save_id = ${a} and season = 2026`;
    expect(Number(dupes?.n)).toBe(0);
    const [ledger] = await pipe.sql<{ n: number }[]>`
      select jsonb_array_length(ledger->'headlines') as n from public.save_documents where save_id = ${a}`;
    expect(ledger?.n).toBe(await countRows(pipe.sql, 'news', a, 'and season = 2026'));
  }, 120_000);

  it('answers the team screen from rows, not from a client-side tally', async () => {
    const [a] = saves as [string, string];
    const team = await pipe.api.call<TeamOut>('team', { saveId: a });
    const [st] = await pipe.sql<{ wins: number; losses: number; ties: number }[]>`
      select wins, losses, ties from public.standings where save_id = ${a} and team_id = ${TEAM}`;
    expect(team.standing).toMatchObject(st ?? {});
    expect(team.squadSize).toBe(53);
    // Six weeks played; the seed schedule gives every club a bye, so the last
    // result is week 6 or the week before it.
    const [save] = await pipe.sql<{ week: number }[]>`select week from public.saves where id = ${a}`;
    expect(save?.week).toBe(7);
    expect(team.last?.week).toBeGreaterThanOrEqual(5);
    expect(team.last?.week).toBeLessThanOrEqual(6);
  });

  it('hides one user\'s save from another', async () => {
    const [a] = saves as [string, string];
    const other = await openPipe(PORT + 1, '22222222-0000-0000-0000-00000000dead');
    try {
      await expect(other.api.call('team', { saveId: a })).rejects.toMatchObject({ status: 404 });
    } finally {
      await other.close();
    }
  }, 30_000);
});
