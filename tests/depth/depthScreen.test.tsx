import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { depthFixture, DepthHarness, prepare } from './fixtures';
import { saveRead } from '../camp/fixtures';
import { requireDepthChart } from '../../src/data/depthChart';
import type { DepthChartOut } from '../../supabase/functions/_shared/api/reads/depthChartTypes';
import type * as Client from '../../src/data/client';
const { call } = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('../../src/data/client', async (original) => ({ ...await original<typeof Client>(), api: () => ({ call }) }));
let board: DepthChartOut;
let fail: string | null;
beforeEach(() => {
  prepare(); board = depthFixture(); fail = null;
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  call.mockReset().mockImplementation(async (route: string, input: Record<string, unknown>) => {
    if (route === 'save') return saveRead(board.phase);
    if (route === 'avatars') return { rows: [] };
    if (route === 'depth-chart') return board;
    if (route === 'set-depth-chart') {
      if (fail !== null) throw new Error(fail);
      board = { ...board, revision: 'two', groups: board.groups.map((g) => g.group !== input['group'] ? g : {
        ...g, order: (input['order'] as string[]).map((id, i) => {
          const p = g.order.find((r) => r.playerId === id);
          if (!p) throw new Error(id);
          return { ...p, rank: i + 1, role: i === 0 ? 'Starter' : i === 1 ? 'Backup' : 'Reserve' };
        }),
      }) };
      return { ok: true };
    }
    if (route === 'mark-checklist') return { checklist: { depth: 'DONE' } };
    if (route === 'auto-depth-chart') return { ok: true };
    if (route === 'finalize-roster') {
      if (fail !== null) return { finalized: false, fault: fail };
      board = { ...board, phase: 'REGULAR_SEASON', action: 'PLAY', canFinalize: false };
      return { finalized: true, fault: null };
    }
    throw new Error(route);
  });
});
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
async function open() { render(<DepthHarness />); await screen.findByTestId('depth-readiness'); }
describe('depth chart experience', () => {
  it('renders server groups, counts and starter/backup/reserve labels', async () => {
    await open();
    expect(screen.getByTestId('depth-readiness').textContent).toContain('53 / 53');
    expect(screen.getByRole('button', { name: 'Review DT' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Review LS' })).toBeTruthy();
    expect((await screen.findByTestId('depth-player-p0')).textContent).toContain('1. Starter');
    expect(screen.getByTestId('depth-player-p1').textContent).toContain('2. Backup');
    expect(screen.getByTestId('depth-player-p2').textContent).toContain('3. Reserve');
    expect(screen.getByRole('img', { name: 'Ability 70' })).toBeTruthy();
  });
  it('selects an empty canonical group without inventing players', async () => {
    await open(); fireEvent.click(screen.getByRole('button', { name: 'Review DT' }));
    expect(screen.queryByTestId('depth-player-p0')).toBeNull();
    expect(screen.getByText('No DT players')).toBeTruthy();
  });
  it('persists a move with revision and renders the refreshed server order', async () => {
    await open(); fireEvent.click(screen.getByRole('button', { name: 'Move Kellan Mercer up' }));
    await waitFor(() => expect(screen.getByTestId('depth-player-p1').textContent).toContain('1. Starter'));
    expect(call).toHaveBeenCalledWith('set-depth-chart', expect.objectContaining({
      group: 'QB', order: ['p1', 'p0', 'p2'], expectedRevision: 'one',
    }));
  });
  it('keeps authoritative order after a failed write and reports the refusal', async () => {
    fail = 'Roster changed; refresh'; await open();
    fireEvent.click(screen.getByRole('button', { name: 'Move Kellan Mercer up' }));
    await screen.findByText(fail);
    expect((await screen.findByTestId('depth-player-p0')).textContent).toContain('1. Starter');
  });
  it('links the player through entity routing and keeps 44px keyboard controls', async () => {
    await open(); const row = screen.getByTestId('depth-player-p0');
    fireEvent.click(within(row).getByRole('button', { name: 'Ari Vale' }));
    expect(screen.getByTestId('location').textContent).toBe('player:p0');
    expect(screen.getByRole('button', { name: 'Move Ari Vale down' }).style.minHeight).toBe('44px');
  });
  it('shows injured starters as advisory and keeps continuation enabled', async () => {
    board = { ...board, injuredStarters: 1, warnings: ['QB: injured starter'], groups: board.groups.map((g) =>
      g.group !== 'QB' ? g : { ...g, injuredStarters: 1, order: g.order.map((p, i) => i === 0 ? { ...p, out: 2 } : p) }) };
    await open();
    expect(screen.getByText('Injured · Out 2w · Starting slot affected')).toBeTruthy();
    expect(screen.getByTestId('depth-entry-status').textContent).toContain('Permitted');
    expect(screen.getByTestId('depth-to-play').hasAttribute('disabled')).toBe(false);
  });
  it('shows the backend blocking reason and disables finalization', async () => {
    board = { ...board, phase: 'FINAL_CUTS', action: 'FINALIZE', blockers: ['Cut one player'], rosterFault: 'Cut one player' };
    await open();
    expect(screen.getByRole('alert').textContent).toBe('Cut one player');
    expect(screen.getByTestId('depth-finalize').hasAttribute('disabled')).toBe(true);
  });
  it('finalizes only on confirmation, refreshes Week 1 and never simulates', async () => {
    board = { ...board, phase: 'FINAL_CUTS', action: 'FINALIZE', canFinalize: true };
    await open(); fireEvent.click(screen.getByTestId('depth-finalize'));
    expect(call.mock.calls.some((c) => c[0] === 'finalize-roster')).toBe(false);
    fireEvent.click(screen.getByTestId('depth-confirm'));
    await screen.findByTestId('depth-to-play');
    expect(call.mock.calls.some((c) => c[0] === 'sim-week')).toBe(false);
  });
  it('retains a server refusal at the finalization gate', async () => {
    fail = 'The roster changed'; board = { ...board, phase: 'FINAL_CUTS', action: 'FINALIZE', canFinalize: true };
    await open(); fireEvent.click(screen.getByTestId('depth-finalize')); fireEvent.click(screen.getByTestId('depth-confirm'));
    await screen.findByText(fail);
    expect(screen.queryByTestId('depth-to-play')).toBeNull();
  });
  it('confirms auto-order and can cancel without a write', async () => {
    await open(); fireEvent.click(screen.getByRole('button', { name: 'Auto-order all positions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(call.mock.calls.some((c) => c[0] === 'auto-depth-chart')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Auto-order all positions' }));
    fireEvent.click(screen.getByTestId('depth-confirm'));
    await waitFor(() => expect(call).toHaveBeenCalledWith('auto-depth-chart', expect.objectContaining({ expectedRevision: 'one' })));
  });
  it('renders loading while the read is pending', async () => {
    call.mockImplementation(async (route: string) => route === 'save' ? saveRead(board.phase) : new Promise(() => undefined));
    render(<DepthHarness />); await screen.findByLabelText('Loading depth chart');
    expect(screen.queryByTestId('depth-finalize')).toBeNull();
  });
  it('reports missing authoritative fields', async () => {
    board = { ...board, startingPlaces: undefined } as unknown as DepthChartOut;
    render(<DepthHarness />); await screen.findByText(/Missing data: depth-chart.startingPlaces/);
  });
  it('reports API errors and offers retry', async () => {
    call.mockImplementation(async (route: string) => {
      if (route === 'save') return saveRead(board.phase);
      throw new Error('Read unavailable');
    });
    render(<DepthHarness />); await screen.findByText('Read unavailable');
    expect(screen.getByTestId('query-retry')).toBeTruthy();
  });
  it('validates missing availability instead of assuming healthy', () => {
    const qb = board.groups[0]; if (!qb) throw new Error('fixture');
    const p = qb.order[0]; if (!p) throw new Error('fixture');
    const bad = { ...board, groups: [{ ...qb, order: [{ ...p, out: undefined }] }] } as unknown as DepthChartOut;
    expect(() => requireDepthChart(bad)).toThrow(/Missing data/);
  });
});
