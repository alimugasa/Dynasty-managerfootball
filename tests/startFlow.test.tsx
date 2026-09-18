// The way in: what a save file says about itself, and where the stack rests.
//
// The rules worth pinning are the ones about absence. A save the server could
// not tell us everything about must say so in place, because a slot screen that
// prints 0-0 over a missing table is telling the player something untrue about
// a game they are about to spend a season in.

import { describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SlotCard, capOf, recordOf, savedAt, whenIn } from '../src/screens/slotCard';
import { HOME_SCREEN, SCREENS, isBootScreen, rootFor } from '../src/app/screens';
import { TABS } from '../src/app/TabBar';
import type { SlotRow } from '../supabase/functions/_shared/api/reads/slots';

const occupied: SlotRow = {
  slot: 2, saveId: 'a-save', name: 'Casey Okonkwo',
  teamId: 'CLE', teamName: 'Cleveland Ironmen',
  primary: '#41230A', secondary: '#F26A21', gmName: 'Casey Okonkwo',
  season: 2026, week: 4, phase: 'REGULAR_SEASON',
  wins: 3, losses: 1, ties: 0,
  capSpace: 18_400_000, titles: 0, savedAt: '2026-09-09T04:27:00.000Z',
};

const empty: SlotRow = {
  slot: 3, saveId: null, name: null, teamId: null, teamName: null, primary: null, secondary: null,
  gmName: null, season: null, week: null, phase: null,
  wins: null, losses: null, ties: null, capSpace: null, titles: 0, savedAt: null,
};

describe('cap space on a save-file card', () => {
  it('reads in millions, the way a cap is talked about', () => {
    expect(capOf({ ...occupied, capSpace: 18_400_000 })).toBe('$18.4M');
  });

  it('signs an overspent cap rather than hiding it', () => {
    expect(capOf({ ...occupied, capSpace: -2_150_000 })).toBe('-$2.1M');
  });

  it('reports a season with no cap sheet as unknown, not as no space', () => {
    // Zero space and no sheet are opposite facts: one says the cap is full to
    // the dollar, the other says nobody has written it yet.
    expect(capOf({ ...occupied, capSpace: null })).toBe('—');
    expect(capOf({ ...occupied, capSpace: 0 })).toBe('$0.0M');
  });
});

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
    expect(whenIn(occupied)).toBe('2026 · Week 4');
    expect(whenIn({ ...occupied, phase: 'PLAYOFFS' })).toBe('2026 · Playoffs');
    expect(whenIn({ ...occupied, phase: 'RECAP' })).toBe('2026 · Year in review');
    // A phase the labels do not know is shown as the server named it, never
    // silently blanked.
    expect(whenIn({ ...occupied, phase: 'SOMETHING_NEW' })).toBe('2026 · SOMETHING_NEW');
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
    expect(screen.getByText('2026 · Week 4')).toBeTruthy();
    expect(screen.getByText('3-1')).toBeTruthy();
    expect(screen.getByText('$18.4M')).toBeTruthy();
    for (const label of ['Season', 'Record', 'Cap', 'Titles']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('prints the file name only once it says something the card does not', () => {
    // It is created as the GM's name, which is already on the card. Printing
    // it unrenamed would say the same thing twice; renamed, it is the whole
    // point of having renamed it.
    render(<SlotCard slot={occupied} openable onOpen={() => undefined} />);
    expect(screen.queryAllByText('Casey Okonkwo')).toHaveLength(1);

    cleanup();
    render(
      <SlotCard
        slot={{ ...occupied, name: 'The Rebuild' }}
        openable
        onOpen={() => undefined}
      />,
    );
    expect(screen.getByText('The Rebuild')).toBeTruthy();
  });

  it('offers rename and delete only where a caller handles them', () => {
    render(<SlotCard slot={occupied} openable onOpen={() => undefined} />);
    expect(screen.queryByTestId('slot-menu-2')).toBeNull();

    cleanup();
    render(
      <SlotCard
        slot={occupied}
        openable
        onOpen={() => undefined}
        onRename={() => undefined}
        onDelete={() => undefined}
      />,
    );
    expect(screen.getByTestId('slot-menu-2')).toBeTruthy();
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
    for (const key of ['home', 'slots', 'gm', 'pickTeam', 'teamPreview', 'franchiseSettings', 'confirmFranchise', 'worldGen']) {
      expect(SCREENS[key], `no screen for ${key}`).toBeDefined();
      expect(isBootScreen(key)).toBe(true);
    }
  });

  it('falls back to Home from the start flow, and to Team from the game', () => {
    expect(rootFor('home')).toBe(HOME_SCREEN);
    for (const key of ['slots', 'gm', 'pickTeam', 'teamPreview', 'franchiseSettings', 'confirmFranchise', 'worldGen']) {
      expect(rootFor(key)).toBe(HOME_SCREEN);
    }
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
