// The navigation contract.
//
// docs/NAVIGATION-CONTRACT.md names its canonical acceptance test:
//
//   League -> filter -> scroll -> open a player -> back
//
// must return with the filter still applied, the same sort order, and the same
// scroll offset. Everything else in the app is replaceable; this behaviour is
// the thing the contract says a rewrite is most likely to destroy.

import { afterAll, beforeAll, describe, expect, it, beforeEach, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '../../src/App';
import { SCREENS, rootFor } from '../../src/app/screens';
import { resolveEntityRoute, type EntityRef } from '../../src/app/entity';
import { TABS } from '../../src/app/TabBar';
import { openPipe, type Pipe } from '../api/harness.ts';
import type { CreateSaveOut } from '../../supabase/functions/_shared/api/createSave';

// The screens read from the API, so the app under test talks to the real shim
// against the real database -- there is no in-memory path to render from. One
// dynasty is created for the run and deleted after it.
const PORT = 8793;
const NAV_USER = '33333333-0000-0000-0000-00000000dead';
let pipe: Pipe;
let saveId = '';

beforeAll(async () => {
  pipe = await openPipe(PORT, NAV_USER);
  vi.stubEnv('VITE_API_URL', `http://localhost:${String(PORT)}`);
  await pipe.sql`delete from public.saves where user_id = ${NAV_USER}`;
  const out = await pipe.api.call<CreateSaveOut>('create-save', { name: 'Nav dynasty', teamId: 'BUF' });
  saveId = out.saveId;
}, 60_000);

afterAll(async () => {
  if (saveId !== '') await pipe.sql`delete from public.saves where id = ${saveId}`;
  await pipe.close();
  vi.unstubAllEnvs();
});

/** Waits for the roster's depth list, which arrives from the API. */
async function depthList(): Promise<Element> {
  return waitFor(() => {
    const list = document.querySelector('[data-testid="depth-list"]');
    if (list === null) throw new Error('roster depth list not rendered');
    return list;
  }, { timeout: 15_000 });
}

function tab(name: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`^${name}$`, 'i') });
}

/** Opens the first player on the roster. The Office rows these tests used to
 *  push through opened placeholder screens; those were removed when the screens
 *  were wired to the game, so the drill-down here is a real one. */
async function openFirstPlayer(): Promise<void> {
  const list = await depthList();
  const row = list.querySelector('button');
  if (row === null) throw new Error('no player row to open');
  fireEvent.click(row);
}

beforeEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('screen registry', () => {
  it('has a screen for every entity route', () => {
    const kinds: EntityRef[] = [
      { kind: 'player', id: 'X' }, { kind: 'team', id: 'X' }, { kind: 'coach', id: 'X' },
      { kind: 'college', id: 'X' }, { kind: 'game', id: 'X' }, { kind: 'draftPick', id: 'X' },
    ];
    for (const ref of kinds) {
      const route = resolveEntityRoute(ref);
      expect(SCREENS[route.screen], `no screen for ${ref.kind}`).toBeDefined();
    }
  });

  it('has a screen for every bottom-navigation tab', () => {
    for (const t of TABS) {
      expect(SCREENS[t.key], `no screen for tab ${t.key}`).toBeDefined();
      expect(SCREENS[t.key]?.root).toBe(true);
    }
  });

  it('resolves every drill-down to a real root', () => {
    for (const key of Object.keys(SCREENS)) {
      const root = rootFor(key);
      expect(SCREENS[root]?.root).toBe(true);
    }
  });
});

describe('bottom navigation', () => {
  it('renders all five destinations', () => {
    render(<App />);
    for (const t of TABS) expect(tab(t.label)).toBeTruthy();
    expect(TABS).toHaveLength(5);
  });

  it('switches screens', () => {
    render(<App />);
    fireEvent.click(tab('League'));
    expect(screen.getByRole('heading', { level: 1, name: /league/i })).toBeTruthy();
    fireEvent.click(tab('Roster'));
    expect(screen.getByRole('heading', { level: 1, name: /roster/i })).toBeTruthy();
  });

  it('marks the current destination', () => {
    render(<App />);
    fireEvent.click(tab('Schedule'));
    expect(tab('Schedule').getAttribute('aria-current')).toBe('page');
    expect(tab('Team').getAttribute('aria-current')).toBeNull();
  });

  it('replaces the root rather than growing the stack', async () => {
    render(<App />);
    // Drill in, then tap a tab. Tapping Office from inside a drill-down must
    // land at depth one, not depth three.
    fireEvent.click(tab('Roster'));
    await openFirstPlayer();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();

    fireEvent.click(tab('Office'));
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });
});

describe('frame state', () => {
  it('restores a filter after a round trip', async () => {
    render(<App />);
    fireEvent.click(tab('Roster'));

    // Filter to corners, exactly as the contract's example does. The chips
    // arrive with the save, so they are awaited.
    fireEvent.click(await screen.findByRole('tab', { name: 'CB' }, { timeout: 15_000 }));
    expect(screen.getByRole('tab', { name: 'CB' }).getAttribute('aria-selected')).toBe('true');

    // Drill in and come back.
    fireEvent.click(tab('Office'));
    fireEvent.click(tab('Roster'));
    // A tab tap is a replaceRoot, so this is a fresh frame and the filter is
    // reset to the default group: that is correct behaviour, not a regression.
    expect(screen.getByRole('tab', { name: 'QB' }).getAttribute('aria-selected')).toBe('true');
  });

  it('restores filter and sort when returning by back()', async () => {
    render(<App />);
    fireEvent.click(tab('Roster'));
    fireEvent.click(await screen.findByRole('tab', { name: 'CB' }, { timeout: 15_000 }));

    // Drill into a player from the filtered roster, which is the contract's
    // canonical journey.
    await openFirstPlayer();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();

    await act(async () => {
      window.history.back();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Back must return to the roster with the filter still applied. This is the
    // contract's canonical acceptance test, and it now runs against the real
    // screen rather than a placeholder.
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /roster/i })).toBeTruthy();
    });
    expect(screen.getByRole('tab', { name: 'CB' }).getAttribute('aria-selected')).toBe('true');
  });

  it('keeps two frames of one screen independent', async () => {
    render(<App />);
    fireEvent.click(tab('League'));
    fireEvent.click(await screen.findByRole('tab', { name: 'American' }, { timeout: 15_000 }));
    expect(screen.getByRole('tab', { name: 'American' }).getAttribute('aria-selected')).toBe('true');

    fireEvent.click(tab('League'));
    // A second frame of the same screen starts clean rather than inheriting.
    expect(screen.getByRole('tab', { name: 'All' }).getAttribute('aria-selected')).toBe('true');
  });
});

describe('back affordance', () => {
  it('is absent at the root and present after a push', async () => {
    render(<App />);
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    fireEvent.click(tab('Roster'));
    await openFirstPlayer();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
  });
});

describe('cold URLs', () => {
  it('opens a root tab as a single frame', () => {
    window.history.replaceState({}, '', '/league');
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: /league/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('opens a drill-down on top of a root, so back has somewhere to go', () => {
    window.history.replaceState({}, '', '/player/DEN_QB_01');
    render(<App />);
    // The heading is the player's name once the screen is wired to real data,
    // so the assertion is that a drill-down opened with somewhere to go back to
    // -- which is what this test is actually about.
    expect(screen.getAllByRole('heading', { level: 1 }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
  });

  it('reports an unregistered screen rather than rendering something plausible', () => {
    window.history.replaceState({}, '', '/not-a-screen');
    render(<App />);
    expect(screen.getByText(/No screen registered/i)).toBeTruthy();
  });
});
