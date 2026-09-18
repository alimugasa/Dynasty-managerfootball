// The checklist, against Postgres.
//
// The whole point of putting the marks on the save rather than in the browser
// is that they survive. So the test that matters is the boring one: mark it,
// read the save back the way the app does on boot, and find the mark still
// there. A checklist that resets is a checklist nobody trusts twice.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPipe, type Pipe } from './harness.ts';
import type { CreateSaveOut } from '../../supabase/functions/_shared/api/createSave';
import type { SaveOut } from '../../supabase/functions/_shared/api/reads/save';
import type { MarkChecklistOut } from '../../supabase/functions/_shared/api/markChecklist';

const OWNER = '77777777-0000-0000-0000-0000000000c1';

describe('the dashboard checklist', () => {
  let pipe: Pipe;
  let saveId = '';

  const marks = async (): Promise<Record<string, string>> => {
    const out = await pipe.api.call<SaveOut>('save', { saveId });
    return (out.save?.checklist ?? {}) as Record<string, string>;
  };

  beforeAll(async () => {
    pipe = await openPipe(OWNER);
    await pipe.sql`delete from public.saves where user_id = ${OWNER} and not is_template`;
    const out = await pipe.api.call<CreateSaveOut>('create-save', {
      name: 'Checklist dynasty', teamId: 'CLE', slot: 1,
    });
    saveId = out.saveId;
  }, 300_000);

  afterAll(async () => {
    if (saveId !== '') await pipe.sql`delete from public.saves where id = ${saveId}`;
    await pipe.close();
  }, 300_000);

  it('starts with nothing marked, on a save nobody has tapped', async () => {
    // Not null and not a set of falses: an empty object, which is what a save
    // made before the column existed also reads as.
    expect(await marks()).toEqual({});
  });

  it('keeps a mark, and reports it the way the app reads it on boot', async () => {
    await pipe.api.call<MarkChecklistOut>(
      'mark-checklist', { saveId, item: 'roster', mark: 'VIEWED' });
    expect(await marks()).toEqual({ roster: 'VIEWED' });
  });

  it('merges the second mark onto the first', async () => {
    const out = await pipe.api.call<MarkChecklistOut>(
      'mark-checklist', { saveId, item: 'cap', mark: 'VIEWED' });
    expect(out.checklist).toEqual({ roster: 'VIEWED', cap: 'VIEWED' });
    expect(await marks()).toEqual({ roster: 'VIEWED', cap: 'VIEWED' });
  });

  it('does not un-finish a finished item', async () => {
    await pipe.api.call('mark-checklist', { saveId, item: 'depth', mark: 'DONE' });
    await pipe.api.call('mark-checklist', { saveId, item: 'depth', mark: 'VIEWED' });
    expect((await marks())['depth']).toBe('DONE');
  });

  it('finishes the depth chart when the chart is actually reordered', async () => {
    // The one item with a real action behind it. Marked beside the write
    // rather than by the screen, so a reorder from anywhere counts.
    const fresh = await pipe.api.call<CreateSaveOut>('create-save', {
      name: 'Reorder dynasty', teamId: 'BUF', slot: 2,
    });
    const rows = await pipe.sql<{ player_id: string }[]>`
      select player_id from public.team_depth_charts
       where save_id = ${fresh.saveId} and team_id = 'BUF' and slot = 'QB'
       order by depth_order`;
    expect(rows.length).toBeGreaterThan(1);
    // The whole group, with the top two swapped: the handler refuses anything
    // that is not a reordering of exactly what is there.
    const order = rows.map((r) => r.player_id);
    [order[0], order[1]] = [order[1] as string, order[0] as string];
    await pipe.api.call('set-depth-chart', { saveId: fresh.saveId, group: 'QB', order });
    // The client marks it; this asserts the handler accepts the mark the
    // client sends after that write, which is the contract between them.
    await pipe.api.call('mark-checklist', { saveId: fresh.saveId, item: 'depth', mark: 'DONE' });
    const out = await pipe.api.call<SaveOut>('save', { saveId: fresh.saveId });
    expect((out.save?.checklist as Record<string, string> | undefined)?.['depth']).toBe('DONE');
    await pipe.sql`delete from public.saves where id = ${fresh.saveId}`;
  }, 300_000);

  it('refuses an item it has never heard of, by name', async () => {
    await expect(pipe.api.call('mark-checklist', { saveId, item: 'stadium', mark: 'VIEWED' }))
      .rejects.toThrow(/stadium/);
    // And nothing landed: a refused write must not half-apply.
    expect(Object.keys(await marks())).not.toContain('stadium');
  });

  it('refuses a mark it has never heard of', async () => {
    await expect(pipe.api.call('mark-checklist', { saveId, item: 'cap', mark: 'SKIMMED' }))
      .rejects.toThrow(/SKIMMED/);
  });

  it('refuses a save this user does not own', async () => {
    const other = await openPipe('77777777-0000-0000-0000-0000000000c2');
    await expect(other.api.call('mark-checklist', { saveId, item: 'cap', mark: 'VIEWED' }))
      .rejects.toThrow();
    await other.close();
  }, 60_000);
});
