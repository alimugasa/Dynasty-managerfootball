// The league read, against Postgres.
//
// One dynasty played to a champion, then the read asked for both competitions.
// The point of the suite is the split: a regular-season board and a playoff
// board are different questions, and the leader of one is not the leader of
// the other by accident of summing them.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPipe, type Pipe } from './harness.ts';
import type { CreateSaveOut } from '../../supabase/functions/_shared/api/createSave';
import type { WeekOutcome } from '../../supabase/functions/_shared/api/week';
import { BOARD_DEPTH, type LeagueOut } from '../../supabase/functions/_shared/api/reads/league';

const TEAM = 'BUF';
const LEAGUE_USER = '88888888-0000-0000-0000-00000000dead';

describe('the league read against Postgres', () => {
  let pipe: Pipe;
  let saveId = '';
  let regular: LeagueOut;
  let playoff: LeagueOut;

  beforeAll(async () => {
    pipe = await openPipe(LEAGUE_USER);
    const created = await pipe.api.call<CreateSaveOut>('create-save', { name: 'Leaders', teamId: TEAM });
    saveId = created.saveId;
    let outcome: WeekOutcome = {
      season: 0, week: 0, phase: 'REGULAR_SEASON', played: 0, abandoned: [], champion: null,
    };
    // The whole season, regular weeks and bracket alike, so both competitions
    // have games in them.
    while (outcome.phase !== 'OFFSEASON') {
      outcome = await pipe.api.call<WeekOutcome>('sim-week', { saveId });
    }
    regular = await pipe.api.call<LeagueOut>('league', { saveId, competition: 'REGULAR' });
    playoff = await pipe.api.call<LeagueOut>('league', { saveId, competition: 'PLAYOFF' });
  }, 300_000);

  afterAll(async () => {
    await pipe.sql`delete from public.saves where id = ${saveId}`;
    await pipe.close();
  });

  it('names its own conferences and divisions, so no screen has to guess', () => {
    expect(regular.conferences.map((c) => c.id).sort()).toEqual(['AC', 'NC']);
    for (const c of regular.conferences) expect(c.name.length).toBeGreaterThan(0);
    expect(regular.divisions.length).toBe(8);
    for (const d of regular.divisions) {
      expect(d.name.length).toBeGreaterThan(0);
      expect(regular.conferences.some((c) => c.id === d.conferenceId)).toBe(true);
    }
    // Every club in the table sits in a division the league named.
    const named = new Set(regular.divisions.map((d) => d.id));
    for (const row of regular.standings) expect(named.has(row.divisionId)).toBe(true);
  });

  it('returns the same twelve boards for either competition, in the same order', () => {
    expect(regular.boards.map((b) => b.key)).toEqual(playoff.boards.map((b) => b.key));
    expect(regular.boards.length).toBe(12);
    for (const board of regular.boards) {
      expect(['OFFENCE', 'DEFENCE', 'KICKING']).toContain(board.side);
      expect(board.unit.length).toBeGreaterThan(0);
      expect(board.rows.length).toBeLessThanOrEqual(BOARD_DEPTH);
    }
    expect(new Set(regular.boards.map((b) => b.side)).size).toBe(3);
  });

  it('ranks every board descending, and lists nobody on nothing', () => {
    for (const board of [...regular.boards, ...playoff.boards]) {
      for (const [i, row] of board.rows.entries()) {
        expect(row.value).toBeGreaterThan(0);
        expect(row.games).toBeGreaterThan(0);
        const previous = board.rows[i - 1];
        if (previous !== undefined) expect(row.value).toBeLessThanOrEqual(previous.value);
      }
    }
  });

  it('counts the games of the competition it was asked about, and they differ', () => {
    // Fourteen clubs over eighteen weeks, then a thirteen-game bracket.
    expect(regular.gamesPlayed).toBeGreaterThan(playoff.gamesPlayed);
    expect(playoff.gamesPlayed).toBe(13);
  });

  it('never sums a playoff run into a regular-season board', async () => {
    const passing = (out: LeagueOut): number => out.boards.find((b) => b.key === 'passYards')?.rows[0]?.value ?? 0;
    expect(passing(regular)).toBeGreaterThan(passing(playoff));

    // The claim, checked against the rows rather than against the read: the
    // regular-season leader's number is his regular-season number alone.
    const top = regular.boards.find((b) => b.key === 'passYards')?.rows[0];
    expect(top).toBeDefined();
    const rows = await pipe.sql<{ competition: string; pass_yards: number }[]>`
      select competition, pass_yards from public.player_season_stats
       where save_id = ${saveId} and player_id = ${top?.playerId ?? ''}`;
    const reg = rows.find((r) => r.competition === 'REGULAR');
    expect(reg?.pass_yards).toBe(top?.value);
    const post = rows.find((r) => r.competition === 'PLAYOFF');
    if (post !== undefined) expect(reg?.pass_yards).not.toBe(reg!.pass_yards + post.pass_yards);
  });

  it('gives the same table whichever competition is asked for: there is one table', () => {
    expect(playoff.standings.map((r) => r.teamId)).toEqual(regular.standings.map((r) => r.teamId));
    expect(regular.standings.length).toBe(32);
  });

  it('returns the table in the league\'s own order, with seeds and streaks', () => {
    const pct = (r: { wins: number; ties: number; played: number }): number =>
      (r.played === 0 ? 0 : (r.wins + r.ties / 2) / r.played);
    for (const [i, row] of regular.standings.entries()) {
      const previous = regular.standings[i - 1];
      if (previous !== undefined) expect(pct(row)).toBeLessThanOrEqual(pct(previous));
      expect(row.played).toBe(row.wins + row.losses + row.ties);
      // A streak is a run of the games played, never longer than them.
      expect(Math.abs(row.streak)).toBeLessThanOrEqual(row.played);
    }
    expect(regular.standings.filter((r) => r.seed !== null).length).toBe(14);
    expect(regular.standings.filter((r) => r.divisionWinner).length).toBe(8);
    expect(regular.champion).not.toBeNull();
  });

  it('reads the regular season when asked for nothing, rather than guessing', async () => {
    const bare = await pipe.api.call<LeagueOut>('league', { saveId });
    expect(bare.competition).toBe('REGULAR');
    expect(bare.gamesPlayed).toBe(regular.gamesPlayed);
  });
});
