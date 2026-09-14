// The scouting report, and the one screen in the flow that writes anything.
//
// Its job is to be the last look before a decade-long decision, so it may not
// round a missing number down to a plausible one. The two absences it has to
// tell apart are a club whose row did not load and a fact the world does not
// model at all -- "Not recorded" and "Not modelled yet" are different
// statements and the screen makes both.

import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TeamPreview, capIn } from '../src/screens/teamPreview';
import type { TeamProfile } from '../supabase/functions/_shared/api/reads/teamProfiles';

const IRONMEN: TeamProfile = {
  teamId: 'CLE', abbreviation: 'CLE', city: 'Cleveland', teamName: 'Ironmen',
  fullName: 'Cleveland Ironmen',
  conferenceId: 'AC', conferenceName: 'American Conference',
  divisionId: 'AC-N', divisionName: 'AC North', divisionShort: 'North',
  primary: '#41230A', secondary: '#F26A21',
  overall: 82, offense: 81.4, defense: 82.9, specialTeams: 74.1,
  capSpace: 18_400_000, draftCapital: 485, averageAge: 25.5,
  quarterbackStatus: 'Established', ownerPatience: 72, stadiumCapacity: 71_000,
  fanPressure: null, archetype: 'Defensive core', difficulty: 'Playoff Push',
  tags: ['PLAYOFF_PUSH'],
};

function mount(team: TeamProfile = IRONMEN, busy: string | null = null) {
  const onConfirm = vi.fn();
  const onBack = vi.fn();
  render(<TeamPreview team={team} onConfirm={onConfirm} onBack={onBack} busy={busy} />);
  return { onConfirm, onBack };
}

describe('cap money on the report', () => {
  it('reads in millions, the way a cap is talked about', () => {
    expect(capIn(18_400_000)).toBe('$18.4M');
    expect(capIn(-2_150_000)).toBe('-$2.1M');
    expect(capIn(0)).toBe('$0.0M');
  });

  it('says nothing rather than zero where there is no cap sheet', () => {
    expect(capIn(null)).toBeNull();
  });
});

describe('the scouting report', () => {
  it('names the club, its market and its place in the league', () => {
    mount();
    expect(screen.getByText('Cleveland')).toBeTruthy();
    expect(screen.getByText('Ironmen')).toBeTruthy();
    expect(screen.getByText('American Conference · North')).toBeTruthy();
  });

  it('carries the difficulty and the shape of the roster', () => {
    mount();
    expect(screen.getByTestId('preview-difficulty').textContent).toBe('Playoff Push');
    expect(screen.getByText('Defensive core')).toBeTruthy();
  });

  it('states every measurement the board took', () => {
    mount();
    expect(screen.getByText('82')).toBeTruthy();
    expect(screen.getByText('81.4')).toBeTruthy();
    expect(screen.getByText('82.9')).toBeTruthy();
    expect(screen.getByText('25.5')).toBeTruthy();
    expect(screen.getByText('$18.4M')).toBeTruthy();
    expect(screen.getByText('Established')).toBeTruthy();
    expect(screen.getByText('485')).toBeTruthy();
    expect(screen.getByText('72 / 100')).toBeTruthy();
    expect(screen.getByText('71,000 seats')).toBeTruthy();
  });

  it('tells a missing row apart from a fact nothing models', () => {
    // Fan pressure is null on every club because no crowd is simulated yet;
    // a cap sheet that did not load is a different kind of nothing.
    mount({ ...IRONMEN, capSpace: null, stadiumCapacity: null });
    expect(screen.getByText('Not modelled yet')).toBeTruthy();
    expect(screen.getAllByText('Not recorded').length).toBeGreaterThan(0);
    expect(screen.queryByText('$0.0M')).toBeNull();
  });

  it('offers the club by name, and a way back to the board', () => {
    const { onConfirm, onBack } = mount();
    const confirm = screen.getByTestId('confirm-team');
    expect(confirm.textContent).toBe('Start with the Ironmen');
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('back-to-board'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('says what it is doing while the dynasty is being built', () => {
    cleanup();
    mount(IRONMEN, 'Creating…');
    expect(screen.getByTestId('confirm-team').textContent).toBe('Creating…');
    expect(screen.getByTestId('confirm-team').hasAttribute('disabled')).toBe(true);
    // And the way back is closed too: leaving mid-create would strand a save.
    expect(screen.getByTestId('back-to-board').hasAttribute('disabled')).toBe(true);
  });
});
