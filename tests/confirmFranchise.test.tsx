// The confirmation before the dynasty exists.
//
// The whole boot flow's promise is that nothing is written until this screen,
// so what is worth pinning is that the review states what the player actually
// chose -- not a default, not a placeholder -- and that the one button that
// writes is closed while it is writing.

import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FranchiseSummary } from '../src/screens/franchiseSummary';
import { DEFAULT_SETTINGS } from '../supabase/functions/_shared/api/franchiseOptions';
import type { TeamProfile } from '../supabase/functions/_shared/api/reads/teamProfiles';

const IRONMEN = {
  teamId: 'CLE', abbreviation: 'CLE', city: 'Cleveland', teamName: 'Ironmen',
  fullName: 'Cleveland Ironmen',
  conferenceId: 'AC', conferenceName: 'American Conference',
  divisionId: 'AC-N', divisionName: 'AC North', divisionShort: 'North',
  primary: '#41230A', secondary: '#F26A21',
  difficulty: 'Playoff Push',
} as unknown as TeamProfile;

function mount(over: Partial<Parameters<typeof FranchiseSummary>[0]> = {}) {
  const onCreate = vi.fn();
  const onBack = vi.fn();
  render(
    <FranchiseSummary
      slot={2}
      gmName="Durk Banks"
      styleLabel="Negotiator"
      team={IRONMEN}
      settings={DEFAULT_SETTINGS}
      difficulty="NORMAL"
      onCreate={onCreate}
      onBack={onBack}
      {...over}
    />,
  );
  return { onCreate, onBack };
}

describe('the franchise review', () => {
  it('reads back every answer the flow collected', () => {
    mount();
    const review = screen.getByTestId('settings-review').textContent ?? '';
    expect(review).toContain('Save fileFile 2');
    expect(review).toContain('General managerDurk Banks');
    expect(review).toContain('GM styleNegotiator');
    expect(review).toContain('TeamCleveland Ironmen');
  });

  it('says plainly that nothing has been written yet', () => {
    // The promise the four screens before it have been keeping.
    mount();
    expect(screen.getByText(/Nothing has been written yet/)).toBeTruthy();
  });

  it('shows the club with its colours and where it sits', () => {
    mount();
    const card = screen.getByTestId('settings-team').textContent ?? '';
    expect(card).toContain('Cleveland Ironmen');
    expect(card).toContain('American Conference · North · Playoff Push');
  });

  it('still reviews the file and the GM when the board could not be read', () => {
    // Those two came from the player, not from the server, so a failed read is
    // no reason to hide them -- and the team row says it is not there.
    mount({ team: null });
    expect(screen.queryByTestId('settings-team')).toBeNull();
    const review = screen.getByTestId('settings-review').textContent ?? '';
    expect(review).toContain('General managerDurk Banks');
    expect(review).toContain('TeamNot chosen');
  });

  it('reports an unchosen style rather than naming one', () => {
    mount({ styleLabel: null });
    expect(screen.getByTestId('settings-review').textContent).toContain('GM styleNot chosen');
  });

  it('creates on the one button that writes, and offers the way back', () => {
    const { onCreate, onBack } = mount();
    expect(screen.getByTestId('create-franchise').textContent).toBe('Create Franchise');
    fireEvent.click(screen.getByTestId('create-franchise'));
    expect(onCreate).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('back-to-preview'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('closes both buttons while the world is being cloned', () => {
    cleanup();
    mount({ busy: 'Creating…' });
    expect(screen.getByTestId('create-franchise').textContent).toBe('Creating…');
    expect(screen.getByTestId('create-franchise').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('back-to-preview').hasAttribute('disabled')).toBe(true);
  });
});
