// The way in: what a save file says about itself, and where the stack rests.
//
// The rules worth pinning are the ones about absence. A save the server could
// not tell us everything about must say so in place, because a slot screen that
// prints 0-0 over a missing table is telling the player something untrue about
// a game they are about to spend a season in.

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SlotCard, recordOf, savedAt, whenIn } from '../src/screens/slotCard';
import { HOME_SCREEN, SCREENS, isBootScreen, rootFor } from '../src/app/screens';
import { TABS } from '../src/app/TabBar';
import type { SlotRow } from '../supabase/functions/_shared/api/reads/slots';

const occupied: SlotRow = {
  slot: 2, saveId: 'a-save', teamId: 'CLE', teamName: 'Cleveland Ironmen',
  primary: '#41230A', secondary: '#F26A21', gmName: 'Casey Okonkwo',
  season: 2026, week: 4, phase: 'REGULAR_SEASON',
  wins: 3, losses: 1, ties: 0, savedAt: '2026-09-09T04:27:00.000Z',
};

const empty: SlotRow = {
  slot: 3, saveId: null, teamId: null, teamName: null, primary: null, secondary: null,
  gmName: null, season: null, week: null, phase: null,
  wins: null, losses: null, ties: null, savedAt: null,
};

describe('what a save file reports', () => {
  it('gives the record, with ties only when there are some', () => {
    expect(recordOf(occupied)).toBe('3-1');
    expect(recordOf({ ...occupied, ties: 2 })).toBe('3-1-2');
  });

  it('reports a missing record rather than calling it 0-0', () => {
    expect(recordOf({ ...occupied, wins: null, losses: null })).toBe('—');
    expect(recordOf({ ...occupied, wins: 0, losses: 0 })).toBe('0-0');
  });

  it('shows the week during the regular season and the phase outside it', () => {
    expect(whenIn(occupied)).toBe('Wk 4');
    expect(whenIn({ ...occupied, phase: 'PLAYOFFS' })).toBe('Playoffs');
    expect(whenIn({ ...occupied, phase: 'RECAP' })).toBe('Year in review');
    // A phase the labels do not know is shown as the server named it, never
    // silently blanked.
    expect(whenIn({ ...occupied, phase: 'SOMETHING_NEW' })).toBe('SOMETHING_NEW');
    expect(whenIn(empty)).toBe('—');
  });

  it('drops the year on a save from this year and keeps it otherwise', () => {
    const now = new Date('2026-09-09T00:00:00Z');
    expect(savedAt('2026-09-09T04:27:00.000Z', now)).not.toMatch(/26|2026/);
    expect(savedAt('2025-04-02T04:27:00.000Z', now)).toMatch(/25/);
    expect(savedAt(null, now)).toBe('—');
    expect(savedAt('not a date', now)).toBe('unreadable');
  });

  it('renders every fact the menu promises, and names the club', () => {
    render(<SlotCard slot={occupied} openable onOpen={() => undefined} />);
    expect(screen.getByText('Cleveland Ironmen')).toBeTruthy();
    expect(screen.getByText('Casey Okonkwo')).toBeTruthy();
    expect(screen.getByText('2026')).toBeTruthy();
    expect(screen.getByText('Wk 4')).toBeTruthy();
    expect(screen.getByText('3-1')).toBeTruthy();
    for (const label of ['Season', 'At', 'Record', 'Saved']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('says a save has no GM rather than giving it a name it never had', () => {
    render(<SlotCard slot={{ ...occupied, gmName: null }} openable onOpen={() => undefined} />);
    expect(screen.getByText('No GM recorded')).toBeTruthy();
  });

  it('is not a control when it is not the thing to tap', () => {
    const { container } = render(
      <SlotCard slot={occupied} openable={false} onOpen={() => undefined} />);
    expect(container.querySelector('button')).toBeNull();
  });
});

describe('where the stack rests', () => {
  it('registers every screen the start flow walks through', () => {
    for (const key of ['home', 'slots', 'gm', 'pickTeam']) {
      expect(SCREENS[key], `no screen for ${key}`).toBeDefined();
      expect(isBootScreen(key)).toBe(true);
    }
  });

  it('falls back to Home from the start flow, and to Team from the game', () => {
    expect(rootFor('home')).toBe(HOME_SCREEN);
    for (const key of ['slots', 'gm', 'pickTeam']) expect(rootFor(key)).toBe(HOME_SCREEN);
    // A drill-down inside the game still rests on Team, which has a dynasty
    // behind it; sending it to Home would strand the player on the menu.
    expect(rootFor('player')).toBe('team');
    expect(rootFor('offseason')).toBe('team');
  });

  it('keeps the start flow out of the bottom navigation', () => {
    for (const tab of TABS) expect(isBootScreen(tab.key)).toBe(false);
    expect(TABS.some((t) => t.key === 'home')).toBe(false);
  });

  it('resolves every screen to a root that exists and is one', () => {
    for (const key of Object.keys(SCREENS)) {
      const root = rootFor(key);
      expect(SCREENS[root]?.root, `${key} rests on ${root}`).toBe(true);
    }
  });
});
