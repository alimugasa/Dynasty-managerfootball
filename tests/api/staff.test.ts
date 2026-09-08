// The staff, against Postgres: cloned with the dynasty, read by the screen,
// and still coherent after the engine has written it back.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPipe, type Pipe } from './harness.ts';
import type { CreateSaveOut } from '../../supabase/functions/_shared/api/createSave';
import type { StaffOut } from '../../supabase/functions/_shared/api/reads/staff';
import type { WeekOutcome } from '../../supabase/functions/_shared/api/week';
import type { SeasonOutcome } from '../../supabase/functions/_shared/api/rollover';

const PORT = 8795;
const TEAM = 'BUF';
const STAFF_USER = '66666666-0000-0000-0000-00000000dead';

describe('the coaching staff against Postgres', () => {
  let pipe: Pipe;
  let saveId = '';

  beforeAll(async () => {
    pipe = await openPipe(PORT, STAFF_USER);
    const created = await pipe.api.call<CreateSaveOut>('create-save', { name: 'Staff', teamId: TEAM });
    saveId = created.saveId;
  }, 120_000);

  afterAll(async () => {
    await pipe.sql`delete from public.saves where id = ${saveId}`;
    await pipe.close();
  });

  it('gives the new dynasty a full staff, cloned rather than invented', async () => {
    const out = await pipe.api.call<StaffOut>('staff', { saveId });
    expect(out.teamId).toBe(TEAM);
    expect(out.coaches.length).toBeGreaterThan(5);
    expect(out.coaches[0]?.role).toBe('Head Coach');
    expect(out.coaches.map((c) => c.role)).toContain('Offensive Coordinator');
    expect(out.coaches.map((c) => c.role)).toContain('Defensive Coordinator');
    for (const coach of out.coaches) {
      expect(coach.name).not.toBe('');
      expect(coach.overall).not.toBeNull();
    }
    expect(out.headCoaches.length).toBe(32);
    expect(out.rank).toBeGreaterThanOrEqual(1);
    expect(out.rank).toBeLessThanOrEqual(32);
    expect(out.clubs).toBe(32);
  });

  it('answers for another club, not only the one you manage', async () => {
    const out = await pipe.api.call<StaffOut>('staff', { saveId, teamId: 'DAL' });
    expect(out.teamId).toBe('DAL');
    expect(out.coaches.length).toBeGreaterThan(5);
  });

  it('is the staff the engine plays with: the same play-caller', async () => {
    const out = await pipe.api.call<StaffOut>('staff', { saveId });
    const caller = out.coaches.find((c) => c.callsPlays);
    expect(caller?.role).toBe('Offensive Coordinator');
    const [row] = await pipe.sql<{ play_calling: number }[]>`
      select a.play_calling from public.coach_attributes a
       where a.save_id = ${saveId} and a.coach_id = ${caller?.coachId ?? ''}`;
    expect(caller?.playCalling).toBe(row?.play_calling);
  });

  it('keeps every coach on exactly one staff', async () => {
    const [dupes] = await pipe.sql<{ n: string }[]>`
      select count(*)::text as n from (
        select coach_id from public.team_coaching_staff
         where save_id = ${saveId} group by coach_id having count(*) > 1) x`;
    expect(Number(dupes?.n)).toBe(0);
    const [heads] = await pipe.sql<{ n: string }[]>`
      select count(*)::text as n from public.team_coaching_staff
       where save_id = ${saveId} and role = 'Head Coach'`;
    expect(Number(heads?.n)).toBe(32);
  });
});

describe('the carousel against Postgres', () => {
  let pipe: Pipe;
  let saveId = '';
  let season = 0;

  beforeAll(async () => {
    pipe = await openPipe(PORT + 1, '77777777-0000-0000-0000-00000000dead');
    const created = await pipe.api.call<CreateSaveOut>('create-save', { name: 'Carousel', teamId: TEAM });
    saveId = created.saveId;
    let phase = 'REGULAR_SEASON';
    while (phase === 'REGULAR_SEASON' || phase === 'PLAYOFFS') {
      const out = await pipe.api.call<WeekOutcome>('sim-week', { saveId });
      phase = out.phase;
      season = out.season;
    }
    await pipe.api.call<SeasonOutcome>('advance-season', { saveId });
  }, 300_000);

  afterAll(async () => {
    await pipe.sql`delete from public.saves where id = ${saveId}`;
    await pipe.close();
  });

  it('writes a season of coach history, with an outcome for everyone', async () => {
    const rows = await pipe.sql<{ outcome: string; wins: number | null; n: string }[]>`
      select outcome, count(*)::text as n, max(wins) as wins from public.coach_history
       where save_id = ${saveId} and season = ${season} group by outcome`;
    const total = rows.reduce((a, r) => a + Number(r.n), 0);
    expect(total).toBeGreaterThan(300);
    expect(rows.map((r) => r.outcome)).toContain('RETAINED');
    const [missing] = await pipe.sql<{ n: string }[]>`
      select count(*)::text as n from public.coach_history
       where save_id = ${saveId} and season = ${season} and (wins is null or team_id is null)`;
    expect(Number(missing?.n)).toBe(0);
  });

  it('logs every move it made, and each one names a club', async () => {
    const moves = await pipe.sql<{ kind: string; team_id: string | null; player_name: string; detail: string }[]>`
      select kind, team_id, player_name, detail from public.transactions
       where save_id = ${saveId} and kind like 'COACH%'`;
    expect(moves.length).toBeGreaterThan(0);
    for (const move of moves) {
      expect(move.team_id).not.toBeNull();
      expect(move.player_name).not.toBe('');
      expect(move.detail).not.toBe('');
    }
    // A firing is always explained by the record that caused it.
    for (const fired of moves.filter((m) => m.kind === 'COACH_FIRE')) {
      expect(fired.detail).toMatch(/after \d+-\d+/);
    }
  });

  it('leaves all thirty-two clubs coached', async () => {
    const [heads] = await pipe.sql<{ n: string }[]>`
      select count(distinct team_id)::text as n from public.coaches
       where save_id = ${saveId} and role = 'Head Coach' and team_id is not null`;
    expect(Number(heads?.n)).toBe(32);
    const staff = await pipe.api.call<StaffOut>('staff', { saveId });
    expect(staff.coaches[0]?.role).toBe('Head Coach');
  });

  it('tells the hot-seat stories from the coaches who are on one', async () => {
    const [news] = await pipe.sql<{ n: string }[]>`
      select count(*)::text as n from public.news
       where save_id = ${saveId} and category = 'HOT_SEAT'`;
    expect(Number(news?.n)).toBeGreaterThan(0);
  });
});
