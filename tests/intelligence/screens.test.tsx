import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { IntelligenceHarness, intelligenceFixture, prepare } from './fixtures';
import { saveRead } from '../camp/fixtures';
import type * as Client from '../../src/data/client';
import { requireIntelligence } from '../../src/data/leagueIntelligence';
import type { LeagueIntelligenceOut } from '../../supabase/functions/_shared/api/reads/leagueIntelligence';
const { call } = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('../../src/data/client', async (original) => ({ ...await original<typeof Client>(), api: () => ({ call }) }));
let board: LeagueIntelligenceOut;
beforeEach(() => {
  prepare(); board = intelligenceFixture();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  call.mockReset().mockImplementation(async (route: string) => {
    if (route === 'save') return saveRead(board.calendar.phase);
    if (route === 'league-intelligence') return board;
    throw new Error(route);
  });
});
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
describe('League intelligence screens', () => {
  it('opens the user conference, identifies the franchise and switches conferences', async () => {
    render(<IntelligenceHarness mode="picture" />);
    const own = await screen.findByTestId('picture-team-BUF');
    expect(own.textContent).toContain('YOUR FRANCHISE');
    expect(own.textContent).toContain('2 games behind');
    expect(screen.queryByTestId('picture-team-CLE')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Alpha Conference' }));
    expect(screen.getByTestId('picture-team-CLE').textContent).toContain('Seed 1');
    expect(screen.getByTestId('picture-team-CLE').textContent).toContain('DIVISION LEADER');
  });
  it('routes picture teams using entity navigation', async () => {
    render(<IntelligenceHarness mode="picture" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Buffalo Stampede' }));
    expect(screen.getByTestId('location').textContent).toBe('team:BUF');
  });
  it('explains the pre-activation threshold without showing candidates', async () => {
    board = { ...board, races: null, calendar: { ...board.calendar, throughWeek: 2, awardsActive: false } };
    render(<IntelligenceHarness mode="races" />);
    await screen.findByText('Available after completed week 6.');
    expect(screen.queryByTestId('award-candidates')).toBeNull();
  });
  it('closes projections in the postseason and links the actual bracket', async () => {
    board = { ...board, picture: null, races: null, calendar: { ...board.calendar, phase: 'PLAYOFFS', awardsActive: false, pictureActive: false } };
    render(<IntelligenceHarness mode="picture" />);
    await screen.findByText('Regular-season race closed');
    fireEvent.click(screen.getByRole('button', { name: 'View actual postseason' }));
    expect(screen.getByTestId('location').textContent).toBe('playoffs:');
  });
  it('renders five candidates, real evidence, movement and award switching', async () => {
    render(<IntelligenceHarness mode="races" />);
    const candidates = await screen.findByTestId('award-candidates');
    expect(within(candidates).getAllByText(/2300 pass yd/)).toHaveLength(5);
    expect(candidates.textContent).toContain('UP 2');
    fireEvent.change(screen.getByRole('combobox', { name: 'Award race' }), { target: { value: 'NEWCOMER_OFFENSE' } });
    expect(screen.getByRole('heading', { name: 'Newcomer watch · offense' })).toBeTruthy();
    expect(screen.getByRole('combobox').style.minHeight).toBe('44px');
  });
  it('routes candidates and their teams to existing entity screens', async () => {
    render(<IntelligenceHarness mode="races" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ari Vale' }));
    expect(screen.getByTestId('location').textContent).toBe('player:ari');
    fireEvent.click(screen.getAllByRole('button', { name: 'BUF' })[0]!);
    expect(screen.getByTestId('location').textContent).toBe('team:BUF');
  });
  it('renders authoritative ranks and changes metrics using an explicit selector', async () => {
    render(<IntelligenceHarness mode="rankings" />);
    await screen.findByTestId('ranking-rows');
    expect(screen.getByTestId('rank-team-BUF').textContent).toContain('#1');
    fireEvent.change(screen.getByRole('combobox', { name: 'Ranking metric' }), { target: { value: 'defense' } });
    expect(screen.getByTestId('rank-team-CLE').textContent).toContain('#1');
    expect(screen.getByTestId('rank-team-CLE').textContent).toContain('312.5 yards allowed/game');
    fireEvent.click(screen.getByRole('button', { name: 'Cleveland Ironmen' }));
    expect(screen.getByTestId('location').textContent).toBe('team:CLE');
  });
  it('keeps a missing game history unranked', async () => {
    board = { ...board, rankings: board.rankings.map((b) => ({ ...b, rows: b.rows.map((r) => ({ ...r, games: 0, rank: null, value: null })) })) };
    render(<IntelligenceHarness mode="rankings" />);
    expect((await screen.findByTestId('rank-team-BUF')).textContent).toContain('Unranked');
    expect(screen.getAllByText(/No games recorded/)).toHaveLength(2);
  });
  it('shows loading while the authoritative read is pending', async () => {
    call.mockImplementation(async (route: string) => route === 'save' ? saveRead('REGULAR_SEASON') : new Promise(() => undefined));
    render(<IntelligenceHarness mode="picture" />);
    await screen.findByLabelText('Loading Playoff Picture');
  });
  it('reports malformed authoritative rows', async () => {
    board = { ...board, races: [{ code: 'PLAYER_OF_THE_YEAR', name: 'Player of the Year', candidates: [{ index: undefined }] }] } as unknown as LeagueIntelligenceOut;
    render(<IntelligenceHarness mode="races" />);
    await screen.findByText(/Missing data: league-intelligence/);
  });
  it('reports API failures with retry', async () => {
    call.mockImplementation(async (route: string) => {
      if (route === 'save') return saveRead('REGULAR_SEASON');
      throw new Error('League unavailable');
    });
    render(<IntelligenceHarness mode="rankings" />);
    await screen.findByText('League unavailable');
    expect(screen.getByTestId('query-retry')).toBeTruthy();
  });
  it('rejects unavailable active races instead of silently showing an empty list', () => {
    expect(() => requireIntelligence({ ...board, races: null })).toThrow(/Missing data/);
    expect(() => requireIntelligence({ ...board, picture: undefined } as unknown as LeagueIntelligenceOut)).toThrow(/Missing data/);
  });
});
