// What the honours panel shows, and what it refuses to make up.
//
// Three rosters read from one list. The rules worth pinning are the ones that
// keep them apart: an all-league team is league-wide, an all-star roster
// belongs to one conference, and a season that has none of something says so
// rather than rendering an empty panel that looks like a loading state.

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HonoursPanel } from '../src/screens/honoursPanel';
import type { HonourOut } from '../supabase/functions/_shared/api/reads/recap';

const honour = (over: Partial<HonourOut> = {}): HonourOut => ({
  team: 'ALL_LEAGUE_FIRST', unit: 'LEAGUE', position: 'QB', slot: 1,
  playerId: 'p1', name: 'A Player', teamId: 'BUF', ...over,
});

const HONOURS: HonourOut[] = [
  honour({ playerId: 'l1', name: 'League First QB' }),
  honour({ team: 'ALL_LEAGUE_SECOND', playerId: 'l2', name: 'League Second QB' }),
  honour({ team: 'ALL_STAR', unit: 'AC', playerId: 'a1', name: 'American QB One', slot: 1 }),
  honour({ team: 'ALL_STAR', unit: 'AC', playerId: 'a2', name: 'American QB Two', slot: 2 }),
  honour({ team: 'ALL_STAR', unit: 'NC', playerId: 'n1', name: 'National QB One', slot: 1 }),
];

const NAMES: Readonly<Record<string, string>> = { AC: 'American Conference', NC: 'National Conference' };

function draw(honours: readonly HonourOut[] = HONOURS) {
  return render(
    <HonoursPanel
      honours={honours}
      nickname={(id) => id ?? '—'}
      conferenceName={(id) => NAMES[id] ?? id}
      open={() => undefined}
    />,
  );
}

describe('the honours panel', () => {
  it('shows all three selections', () => {
    draw();
    expect(screen.getByText('All-stars')).toBeTruthy();
    expect(screen.getByText('All-league first team')).toBeTruthy();
    expect(screen.getByText('All-league second team')).toBeTruthy();
  });

  it('keeps the all-league teams apart from each other', () => {
    draw();
    const first = screen.getByTestId('all-league-first');
    const second = screen.getByTestId('all-league-second');
    expect(first.textContent).toContain('League First QB');
    expect(first.textContent).not.toContain('League Second QB');
    expect(second.textContent).toContain('League Second QB');
  });

  it('shows one conference of all-stars at a time, named by the league', () => {
    draw();
    // The chips carry the league's names, not the ids.
    expect(screen.getByRole('tab', { name: 'American Conference' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'National Conference' })).toBeTruthy();

    const roster = screen.getByTestId('all-stars');
    expect(roster.textContent).toContain('American QB One');
    expect(roster.textContent).toContain('American QB Two');
    // The other conference's roster is behind its own chip.
    expect(roster.textContent).not.toContain('National QB One');
  });

  it('never shows an all-star on an all-league team by mistake', () => {
    draw();
    const first = screen.getByTestId('all-league-first').textContent ?? '';
    expect(first).not.toContain('American QB');
    expect(first).not.toContain('National QB');
  });

  it('says a season has no all-stars rather than drawing an empty roster', () => {
    draw(HONOURS.filter((h) => h.team !== 'ALL_STAR'));
    expect(screen.getByText('No all-stars this season')).toBeTruthy();
    expect(screen.queryByTestId('all-stars')).toBeNull();
    // The all-league teams are still there: one missing selection is not all
    // of them missing.
    expect(screen.getByTestId('all-league-first')).toBeTruthy();
  });

  it('says an older season has no second team on record rather than inventing one', () => {
    draw(HONOURS.filter((h) => h.team !== 'ALL_LEAGUE_SECOND'));
    expect(screen.getByText('No second team this season')).toBeTruthy();
    expect(screen.queryByTestId('all-league-second')).toBeNull();
  });

  it('falls back to the conference id when the league named none', () => {
    render(
      <HonoursPanel
        honours={HONOURS}
        nickname={(id) => id ?? '—'}
        open={() => undefined}
      />,
    );
    expect(screen.getByRole('tab', { name: 'AC' })).toBeTruthy();
  });

  it('drops the conference control when there is only one roster', () => {
    draw(HONOURS.filter((h) => h.unit !== 'NC'));
    expect(screen.queryByRole('tab', { name: /Conference/ })).toBeNull();
    expect(screen.getByTestId('all-stars').textContent).toContain('American QB One');
  });
});
