// The staff, against Postgres: cloned with the dynasty, read by the screen,
// and still coherent after the engine has written it back.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPipe, type Pipe } from './harness.ts';
import type { CreateSaveOut } from '../../supabase/functions/_shared/api/createSave';
import type { StaffOut } from '../../supabase/functions/_shared/api/reads/staff';

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
