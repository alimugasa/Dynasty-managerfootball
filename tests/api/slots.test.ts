// Save files, against Postgres.
//
// The menu's whole promise is that a slot holds one save and that what it says
// about that save is true. Both are checked here against rows, not against the
// read that produced them.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPipe, type Pipe } from './harness.ts';
import type { CreateSaveOut } from '../../supabase/functions/_shared/api/createSave';
import { SLOT_COUNT, type SlotsOut } from '../../supabase/functions/_shared/api/reads/slots';
import type { SaveOut } from '../../supabase/functions/_shared/api/reads/save';
import type { ClubsOut } from '../../supabase/functions/_shared/api/reads/clubs';
import type { WeekOutcome } from '../../supabase/functions/_shared/api/week';

const SLOT_USER = '99999999-0000-0000-0000-00000000dead';

describe('save files against Postgres', () => {
  let pipe: Pipe;
  const made: string[] = [];

  beforeAll(async () => {
    pipe = await openPipe(SLOT_USER);
    await pipe.sql`delete from public.saves where user_id = ${SLOT_USER}`;
  }, 60_000);

  afterAll(async () => {
    await pipe.sql`delete from public.saves where user_id = ${SLOT_USER}`;
    await pipe.close();
  });

  it('offers empty files before anything is saved', async () => {
    const out = await pipe.api.call<SlotsOut>('slots', {});
    expect(out.slots.length).toBe(SLOT_COUNT);
    expect(out.slots.map((s) => s.slot)).toEqual([1, 2, 3]);
    for (const slot of out.slots) {
      expect(slot.saveId).toBeNull();
      // Empty is empty all the way down: no club, no record, no date.
      expect(slot.teamName).toBeNull();
      expect(slot.wins).toBeNull();
      expect(slot.savedAt).toBeNull();
    }
  });

  it('lists the thirty-two clubs before any save exists', async () => {
    const out = await pipe.api.call<ClubsOut>('clubs', {});
    expect(out.clubs.length).toBe(32);
    for (const club of out.clubs) {
      expect(club.name.length).toBeGreaterThan(0);
      expect(club.primary).toMatch(/^#/);
    }
  });

  it('creates a dynasty in the file it was asked for, at week 1 of the regular season', async () => {
    const out = await pipe.api.call<CreateSaveOut>('create-save', {
      name: 'Casey Okonkwo', teamId: 'CLE', slot: 2,
      gmFirstName: 'Casey', gmLastName: 'Okonkwo',
    });
    made.push(out.saveId);
    expect(out.slot).toBe(2);

    const [row] = await pipe.sql<{ slot: number; week: number; phase: string; gm: string }[]>`
      select slot, week, phase, gm_first_name || ' ' || gm_last_name as gm
        from public.saves where id = ${out.saveId}`;
    expect(row?.slot).toBe(2);
    expect(row?.week).toBe(1);
    expect(row?.phase).toBe('REGULAR_SEASON');
    expect(row?.gm).toBe('Casey Okonkwo');
  }, 120_000);

  it('shows the club, the GM, the position, the record and the date on an occupied file', async () => {
    const out = await pipe.api.call<SlotsOut>('slots', {});
    const two = out.slots.find((s) => s.slot === 2);
    expect(two?.saveId).toBe(made[0]);
    expect(two?.teamId).toBe('CLE');
    expect(two?.teamName?.length ?? 0).toBeGreaterThan(0);
    expect(two?.gmName).toBe('Casey Okonkwo');
    expect(two?.season).toBeGreaterThan(2000);
    expect(two?.week).toBe(1);
    expect(two?.phase).toBe('REGULAR_SEASON');
    expect(two?.wins).toBe(0);
    expect(two?.losses).toBe(0);
    // A real instant, not a formatted string: the browser knows the timezone.
    expect(Number.isNaN(Date.parse(two?.savedAt ?? ''))).toBe(false);
    // The colours travel with it, so the menu draws a badge without opening
    // the save they live in.
    expect(two?.primary).toMatch(/^#/);

    // The others are still empty, and say so.
    expect(out.slots.filter((s) => s.saveId === null).map((s) => s.slot)).toEqual([1, 3]);
  });

  it('refuses a file that is already in use', async () => {
    await expect(pipe.api.call<CreateSaveOut>('create-save', {
      name: 'Someone Else', teamId: 'DAL', slot: 2,
      gmFirstName: 'Someone', gmLastName: 'Else',
    })).rejects.toThrow(/already in use/i);
    const [{ n } = { n: '0' }] = await pipe.sql<{ n: string }[]>`
      select count(*) as n from public.saves where user_id = ${SLOT_USER}`;
    expect(Number(n)).toBe(1);
  });

  it('refuses half a GM name', async () => {
    await expect(pipe.api.call<CreateSaveOut>('create-save', {
      name: 'Half', teamId: 'DAL', slot: 1, gmFirstName: 'Casey',
    })).rejects.toThrow(/first and a last name/i);
  });

  it('takes the lowest free file when the caller names none', async () => {
    const out = await pipe.api.call<CreateSaveOut>('create-save', {
      name: 'No slot named', teamId: 'DAL',
    });
    made.push(out.saveId);
    expect(out.slot).toBe(1);
    // And says it has no GM rather than inventing one, because none was given.
    const list = await pipe.api.call<SlotsOut>('slots', {});
    expect(list.slots.find((s) => s.slot === 1)?.gmName).toBeNull();
  }, 120_000);

  it('opens the save it was asked for, not the one touched most recently', async () => {
    const [first, second] = made as [string, string];
    // Playing the second makes it the most recent; asking for the first must
    // still give the first.
    await pipe.api.call<WeekOutcome>('sim-week', { saveId: second });

    const asked = await pipe.api.call<SaveOut>('save', { saveId: first });
    expect(asked.save?.saveId).toBe(first);
    expect(asked.save?.slot).toBe(2);
    expect(asked.save?.gmName).toBe('Casey Okonkwo');

    const latest = await pipe.api.call<SaveOut>('save', {});
    expect(latest.save?.saveId).toBe(second);
  }, 120_000);

  it('frees the file when the save is deleted', async () => {
    const [first] = made as [string];
    await pipe.api.call('delete-save', { saveId: first });
    const out = await pipe.api.call<SlotsOut>('slots', {});
    expect(out.slots.find((s) => s.slot === 2)?.saveId).toBeNull();

    // And the freed file can be started in again.
    const again = await pipe.api.call<CreateSaveOut>('create-save', {
      name: 'Second time', teamId: 'CLE', slot: 2,
      gmFirstName: 'Second', gmLastName: 'Time',
    });
    expect(again.slot).toBe(2);
  }, 180_000);
});
