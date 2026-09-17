import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { CampHarness, campFixture, cutPreview, prepareCampBrowser, saveRead } from './fixtures';
import type { CampOut } from '../../supabase/functions/_shared/api/reads/camp';
import type * as ClientModule from '../../src/data/client';

const { call } = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('../../src/data/client', async (original) => ({
  ...await original<typeof ClientModule>(), api: () => ({ call }),
}));

let board: CampOut;
let phase: string;
let cutError: string | null;
let previewError: string | null;
let finalizeError: string | null;

beforeEach(() => {
  prepareCampBrowser();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  board = campFixture(); phase = board.phase;
  cutError = null; previewError = null; finalizeError = null;
  call.mockReset().mockImplementation(async (route: string) => {
    if (route === 'save') return saveRead(phase);
    if (route === 'avatars') return { rows: [] };
    if (route === 'camp') return board;
    if (route === 'preview-cut') {
      if (previewError !== null) throw new Error(previewError);
      return cutPreview();
    }
    if (route === 'cut-player') {
      if (cutError !== null) throw new Error(cutError);
      board = { ...board, rosterCount: 53, cutsRemaining: 0, rosterFault: null,
        players: board.players.filter((p) => p.playerId !== 'camp-a'),
        progress: { ...board.progress, finalizeFault: null } };
      return cutPreview();
    }
    if (route === 'advance-camp') {
      board = { ...board, phase: 'FINAL_CUTS', progress: { ...board.progress,
        phaseLabel: 'Final cuts', advanceRoute: 'finalize-roster', advanceLabel: 'Finalize the roster' } };
      phase = board.phase;
      return { phase, week: 3, summary: 'The preseason is over.', blockedBy: null, cutsRemaining: 1, game: null };
    }
    if (route === 'finalize-roster') {
      if (finalizeError !== null) return { finalized: false, phase, fault: finalizeError, rosterCount: 54, rosterLimit: 53 };
      phase = 'REGULAR_SEASON';
      return { finalized: true, phase, fault: null, rosterCount: 53, rosterLimit: 53 };
    }
    throw new Error(`Unexpected route ${route}`);
  });
});

afterEach(() => { vi.restoreAllMocks(); window.localStorage.clear(); });

async function open(): Promise<void> {
  render(<CampHarness />);
  await screen.findByTestId('camp-header');
}
function view(name: string): void { fireEvent.click(within(screen.getByRole('tablist', { name: 'Camp view' })).getByRole('tab', { name })); }
async function openCut(): Promise<void> {
  await open(); view('Cut decisions');
  fireEvent.click(screen.getByTestId('camp-cut-camp-a'));
  await screen.findByText('54 → 53');
}

describe('camp overview and player comparisons', () => {
  it('renders authoritative counts, phase, deadline and preseason results', async () => {
    await open();
    expect(screen.getByTestId('camp-header').textContent).toContain('54 / 90');
    expect(screen.getByText('Finalize the roster before regular-season week 1. Next phase: Preseason.')).toBeTruthy();
    expect(screen.getByText('Next: Cleveland Ironmen · Week 2')).toBeTruthy();
    expect(screen.getByText('W · 24–17 · View game')).toBeTruthy();
    expect(screen.getByText('Record: 1–0–0')).toBeTruthy();
  });

  it('selects the real position group and compares its server-selected battle', async () => {
    await open(); fireEvent.click(screen.getByRole('button', { name: 'Compare QB' }));
    const battles = screen.getByTestId('camp-battles');
    expect(battles.textContent).toContain('Starting place 1');
    expect(within(battles).getByRole('img', { name: 'Ability 72' })).toBeTruthy();
    expect(within(battles).getByRole('img', { name: 'Preseason grade 82.0' })).toBeTruthy();
    expect(screen.getByTestId('camp-player-list').textContent).not.toContain('Tavi Soren');
  });

  it('uses evaluation categories and separates unseen from a zero grade', async () => {
    board = { ...board, players: board.players.map((p) => p.playerId === 'camp-b' ? { ...p, preseasonGrade: 0 } : p) };
    await open(); view('Cut decisions');
    const rows = screen.getByTestId('camp-player-list');
    expect(within(rows).getByRole('img', { name: 'Preseason grade 0.0' })).toBeTruthy();
    expect(within(rows).getByRole('img', { name: 'Preseason grade unavailable' })).toBeTruthy();
    expect(within(rows).getByText('Not seen in preseason')).toBeTruthy();
    expect(within(rows).getByText('Rising')).toBeTruthy();
  });

  it('sorts and filters through explicit controls', async () => {
    await open(); view('Cut decisions');
    const sorting = screen.getByRole('tablist', { name: 'Sort camp players' });
    fireEvent.click(within(sorting).getByRole('tab', { name: 'Age' }));
    expect(screen.getByTestId('camp-player-list').firstElementChild?.textContent).toContain('Rowan Vale');
    fireEvent.click(screen.getByRole('button', { name: 'Sorted high to low' }));
    expect(screen.getByTestId('camp-player-list').lastElementChild?.textContent).toContain('Rowan Vale');
    fireEvent.click(within(screen.getByRole('tablist', { name: 'Camp filter' })).getByRole('tab', { name: 'Risers' }));
    expect(screen.getByTestId('camp-player-list').children).toHaveLength(1);
    expect(screen.getByTestId('camp-player-list').textContent).toContain('Kellan Mercer');
  });

  it('routes player names through the existing player destination', async () => {
    await open(); view('Cut decisions');
    const row = screen.getByTestId('camp-player-camp-a');
    fireEvent.click(within(row).getByRole('button', { name: /Kellan Mercer/ }));
    expect(screen.getByTestId('camp-location').textContent).toBe('player:camp-a');
  });

  it('shows empty selected position and missing fixture states', async () => {
    board = { ...board, fixtures: [], nextOpponentName: null, nextOpponentId: null, nextPreseasonWeek: null };
    await open(); expect(screen.getByText('No preseason fixtures yet')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Compare LS' }));
    expect(screen.getByText('No players match')).toBeTruthy();
    expect(screen.getByText('No close battles in this group')).toBeTruthy();
  });

  it('labels opening estimates and availability-only grades', async () => {
    board = { ...board, players: board.players.map((p) => ({ ...p, practiceSource: 'INITIAL_ESTIMATE', preseasonBasis: 'AVAILABILITY' })) };
    await open(); view('Cut decisions');
    expect(screen.getAllByText(/Opening staff estimate/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Availability-based grade/).length).toBeGreaterThan(0);
  });
});

describe('cut confirmation and refresh', () => {
  it('previews the real terms and cancelling makes no cut', async () => {
    await openCut();
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('Age 24');
    expect(dialog.textContent).toContain('$400K');
    expect(dialog.textContent).toContain('$1.6M');
    expect(dialog.textContent).toContain('enter waivers');
    expect(dialog.textContent).toContain('no replacement signings or waiver claims');
    expect(dialog.textContent).toContain('Final roster target');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(call.mock.calls.some(([route]) => route === 'cut-player')).toBe(false);
  });

  it('requires confirmation then refreshes roster count and player list', async () => {
    await openCut();
    fireEvent.click(screen.getByTestId('camp-confirm-cut'));
    await waitFor(() => expect(screen.queryByTestId('camp-cut-dialog')).toBeNull());
    await waitFor(() => expect(screen.getByTestId('camp-header').textContent).toContain('53 / 90'));
    expect(screen.queryByTestId('camp-player-camp-a')).toBeNull();
    expect(call).toHaveBeenCalledWith('cut-player', { saveId: 'camp-save', playerId: 'camp-a' });
    expect(call.mock.calls.filter(([route]) => route === 'camp').length).toBeGreaterThan(1);
  });

  it('keeps the roster and confirmation visible after a failed cut', async () => {
    cutError = 'The roster changed. Review this decision again.';
    await openCut(); fireEvent.click(screen.getByTestId('camp-confirm-cut'));
    await screen.findByText(cutError);
    await waitFor(() => expect(screen.getByTestId('camp-header').textContent).toContain('54 / 90'));
    expect(screen.getByTestId('camp-cut-dialog')).toBeTruthy();
  });

  it('cannot confirm when authoritative cut terms are missing', async () => {
    previewError = 'Contract information unavailable.';
    await open(); view('Cut decisions'); fireEvent.click(screen.getByTestId('camp-cut-camp-a'));
    await screen.findByText(previewError);
    expect((screen.getByTestId('camp-confirm-cut') as HTMLButtonElement).disabled).toBe(true);
  });

  it('rejects an incomplete cut preview instead of displaying an invented charge', async () => {
    const previous = call.getMockImplementation();
    call.mockImplementation((route, input) => route === 'preview-cut'
      ? Promise.resolve({ ...cutPreview(), deadMoney: undefined }) : previous?.(route, input));
    await open(); view('Cut decisions'); fireEvent.click(screen.getByTestId('camp-cut-camp-a'));
    await screen.findByText('Missing data: preview-cut.deadMoney (requested by camp)');
    expect((screen.getByTestId('camp-confirm-cut') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('review and advancement', () => {
  it('shows final count, distributions, injuries and the server blocking reason', async () => {
    await open(); view('Final roster review');
    expect(screen.getByTestId('camp-review').textContent).toContain('54 players · target 53');
    expect(screen.getByText('No long snapper on the roster.')).toBeTruthy();
    expect(screen.getByTestId('camp-review').textContent).toContain('Tavi Soren');
    expect(screen.getByTestId('camp-advance-blocked').textContent).toBe(board.progress.finalizeFault);
    expect((screen.getByTestId('camp-finalize') as HTMLButtonElement).disabled).toBe(true);
  });

  it('advances with the existing route and lands in final review', async () => {
    await open(); fireEvent.click(screen.getByTestId('camp-advance'));
    await screen.findByTestId('camp-review');
    expect(call).toHaveBeenCalledWith('advance-camp', { saveId: 'camp-save' });
    expect(screen.queryByTestId('sim-week')).toBeNull();
  });

  it('confirms early finalization explicitly and follows the backend result', async () => {
    board = { ...board, rosterCount: 53, rosterFault: null, progress: { ...board.progress, finalizeFault: null } };
    await open(); view('Final roster review'); fireEvent.click(screen.getByTestId('camp-finalize'));
    expect(screen.getByRole('dialog').textContent).toContain('skips any remaining preseason games');
    fireEvent.click(screen.getByTestId('camp-confirm-finalize'));
    await waitFor(() => expect(screen.getByTestId('camp-location').textContent).toBe('play:'));
    expect(call).toHaveBeenCalledWith('finalize-roster', { saveId: 'camp-save' });
  });

  it('honors a backend refusal even if the displayed count was legal', async () => {
    board = { ...board, rosterCount: 53, rosterFault: null, progress: { ...board.progress, finalizeFault: null } };
    finalizeError = 'Another player joined. The roster is now 54.';
    await open(); view('Final roster review'); fireEvent.click(screen.getByTestId('camp-finalize'));
    fireEvent.click(screen.getByTestId('camp-confirm-finalize'));
    await screen.findByText(finalizeError);
    expect(screen.getByTestId('camp-location').textContent).toBe('camp:');
  });
});

describe('unavailable camp information', () => {
  it('shows a loading state while camp is being read', async () => {
    const previous = call.getMockImplementation();
    call.mockImplementation((route, input) => route === 'camp' ? new Promise(() => undefined) : previous?.(route, input));
    render(<CampHarness />);
    expect(await screen.findByLabelText('Loading training camp')).toBeTruthy();
  });

  it('shows API failure and retries without invented data', async () => {
    const previous = call.getMockImplementation(); let failed = false;
    call.mockImplementation((route, input) => {
      if (route === 'camp' && !failed) { failed = true; return Promise.reject(new Error('Camp read unavailable')); }
      return previous?.(route, input);
    });
    render(<CampHarness />); await screen.findByText('Camp read unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByTestId('camp-header');
  });

  it('uses MissingData for an incomplete required camp read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    board = { ...board, groups: undefined } as unknown as CampOut;
    render(<CampHarness />);
    expect(await screen.findByText('Missing data: camp.groups (requested by camp)')).toBeTruthy();
    expect(screen.queryByTestId('camp-finalize')).toBeNull();
  });

  it('reports missing money and outlook rather than zero', async () => {
    board = { ...board, players: board.players.map((p) => ({ ...p, capHit: null, deadMoney: null, probability: null, status: null, statusLabel: null })) };
    await open(); view('Cut decisions');
    const row = screen.getByTestId('camp-player-camp-a');
    expect(within(row).getByText('Outlook unavailable')).toBeTruthy();
    expect(within(row).getAllByText('Unavailable').length).toBeGreaterThan(1);
    expect(row.textContent).not.toContain('$0');
  });
});
