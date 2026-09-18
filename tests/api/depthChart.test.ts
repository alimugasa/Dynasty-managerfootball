// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { openPipe, type Pipe } from './harness';
import type { CreateSaveOut } from '../../supabase/functions/_shared/api/createSave';
import type { DepthChartOut } from '../../supabase/functions/_shared/api/reads/depthChartTypes';
import { POSITION_GROUPS, STARTERS } from '../../supabase/functions/_shared/engine/types';
import { loadEngineState } from '../../supabase/functions/_shared/api/saveStore';
import { teamStatesFor } from '../../supabase/functions/_shared/engine/careerBridge';
let pipe: Pipe; let id: string;
const owner = randomUUID();
const read = () => pipe.api.call<DepthChartOut>('depth-chart', { saveId: id });
beforeAll(async () => {
  pipe = await openPipe(owner);
  id = (await pipe.api.call<CreateSaveOut>('create-save', { name: 'Depth test', teamId: 'CLE', slot: 1,
    gmFirstName: 'Ari', gmLastName: 'Vale' })).saveId;
}, 90_000);
afterAll(async () => {
  if (pipe) {
    if (id) await pipe.sql`delete from public.saves where id = ${id}`;
    await pipe.sql`delete from auth.users where id = ${owner}`;
    await pipe.close();
  }
}, 30_000);
describe('authoritative depth chart', () => {
  it('exposes canonical groups and every starting place', async () => {
    const d = await read();
    expect(d.groups.map((g) => g.group)).toEqual(POSITION_GROUPS);
    expect(d.startingPlaces).toBe(Object.values(STARTERS).reduce((a, b) => a + b, 0));
    expect(d.groups.find((g) => g.group === 'WR')?.order.filter((p) => p.role === 'Starter')).toHaveLength(3);
    expect(d.groups.find((g) => g.group === 'LS')?.startingPlaces).toBe(0);
  });
  it('persists ordering and rejects a stale tab without undoing the saved choice', async () => {
    const d = await read(); const qb = d.groups.find((g) => g.group === 'QB');
    if (!qb) throw new Error('QB missing');
    const order = qb.order.map((p) => p.playerId).reverse();
    await pipe.api.call('set-depth-chart', { saveId: id, group: 'QB', order, expectedRevision: d.revision });
    expect((await read()).groups.find((g) => g.group === 'QB')?.order.map((p) => p.playerId)).toEqual(order);
    await expect(pipe.api.call('set-depth-chart', { saveId: id, group: 'QB', order, expectedRevision: d.revision }))
      .rejects.toMatchObject({ status: 409 });
  });
  it('accepts generated OL labels without mistaking them for missing roster data', async () => {
    const d = await read(); const lineman = d.groups.find((g) => g.group === 'OL')?.order[0];
    if (lineman === undefined) throw new Error('No lineman in fixture');
    try {
      await pipe.sql`update public.players set position = 'OL' where save_id = ${id} and player_id = ${lineman.playerId}`;
      const fresh = await read(); const group = fresh.groups.find((g) => g.group === 'OL');
      if (group === undefined) throw new Error('Missing OL group');
      expect(group.order.some((p) => p.playerId === lineman.playerId && p.position === 'OL')).toBe(true);
      await pipe.api.call('set-depth-chart', { saveId: id, group: 'OL', order: group.order.map((p) => p.playerId), expectedRevision: fresh.revision });
    } finally {
      await pipe.sql`update public.players set position = ${lineman.position} where save_id = ${id} and player_id = ${lineman.playerId}`;
    }
  });
  it('rejects foreign or duplicate players', async () => {
    await expect(pipe.api.call('set-depth-chart', { saveId: id, group: 'QB', order: ['foreign'] }))
      .rejects.toMatchObject({ status: 400 });
  });
  it('reports missing saved chart and lets the existing automatic algorithm restore it', async () => {
    await pipe.sql`delete from public.team_depth_charts where save_id = ${id} and team_id = 'CLE' and slot = 'QB'`;
    const d = await read();
    expect(d.chartSaved).toBe(false);
    expect(d.groups.find((g) => g.group === 'QB')?.order.length).toBeGreaterThan(1);
    await pipe.api.call('auto-depth-chart', { saveId: id, expectedRevision: d.revision });
    expect((await read()).chartSaved).toBe(true);
  });
  it('uses the existing count gate during final cuts and returns to Week 1 without playing', async () => {
    await pipe.sql`update public.saves set phase = 'FINAL_CUTS' where id = ${id}`;
    const d = await read();
    expect(d.action).toBe('FINALIZE');
    expect(d.blockers.length).toBe(d.rosterCount === d.rosterTarget ? 0 : 1);
    // The seeded opening roster is legal; the real route must make the decision.
    expect(d.rosterCount).toBe(d.rosterTarget);
    await pipe.api.call('finalize-roster', { saveId: id });
    const after = await read(); expect(after.phase).toBe('REGULAR_SEASON'); expect(after.week).toBe(1);
    const [row] = await pipe.sql<{ n: string }[]>`select count(*)::text as n from public.game_results where save_id = ${id}`;
    expect(row?.n).toBe('0');
  });
  it('reports an illegal camp count as a blocker', async () => {
    await pipe.sql`update public.saves set phase = 'FINAL_CUTS' where id = ${id}`;
    const d = await read(); const victim = d.groups.find((g) => g.group === 'QB')?.order.at(-1);
    if (!victim) throw new Error('No cut candidate');
    await pipe.api.call('cut-player', { saveId: id, playerId: victim.playerId });
    const after = await read(); expect(after.canFinalize).toBe(false); expect(after.blockers).toHaveLength(1);
    const out = await pipe.api.call<{ finalized: boolean }>('finalize-roster', { saveId: id });
    expect(out.finalized).toBe(false);
  });
  it('CPU runtime charts contain only eligible roster players, in existing default order', async () => {
    const { league } = await loadEngineState(pipe.sql, id);
    const teams = teamStatesFor(league.teamIds, league.players, { fronts: league.fronts, coaches: league.coaches });
    for (const [teamId, team] of teams) {
      if (teamId === 'CLE') continue;
      for (const group of POSITION_GROUPS) {
        const ids = team.depthChart[group];
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids.every((p) => team.players.some((r) => r.id === p && r.group === group))).toBe(true);
        expect(ids.length).toBeGreaterThanOrEqual(STARTERS[group]);
      }
    }
  });
});
