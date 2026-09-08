// The league table's split and sort, and the two copies of the board list.
//
// Sorting is the one thing the client is allowed to do to the standings, so
// the rules are worth pinning: a sort reorders, it never drops a club; the
// league's own order is always one more tap away; and a split puts every club
// in exactly one group.

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  DEFAULT_SORT, LEAGUE_ORDER, SORT_FIELDS, StandingsPanel,
  groupRows, reverse, sortFor, sortRows,
} from '../src/screens/leaguePanels';
import { BOARD_KEYS, BOARD_DEPTH } from '../supabase/functions/_shared/api/reads/league';
import {
  BOARD_KEYS as RIG_BOARD_KEYS, BOARD_DEPTH as RIG_DEPTH,
} from '../scripts/playtest/leaders';
import type { LeagueGroup, TableRow } from '../supabase/functions/_shared/api/reads/league';

const club = (
  teamId: string, divisionId: string, wins: number, losses: number,
  pointsFor: number, streak: number, seed: number | null,
): TableRow => ({
  teamId, conferenceId: divisionId.slice(0, 2), divisionId,
  wins, losses, ties: 0, played: wins + losses,
  pointsFor, pointsAgainst: 400, seed, divisionWinner: seed !== null && seed <= 4, streak,
});

// Given in the league's own order: win percentage, then points difference.
const ROWS: TableRow[] = [
  club('BUF', 'AC-E', 13, 4, 520, 3, 1),
  club('PIT', 'AC-N', 11, 6, 430, -1, 3),
  club('DAL', 'NC-E', 11, 6, 410, 2, 2),
  club('CHI', 'NC-N', 4, 13, 300, -5, null),
];

const CONFERENCES: LeagueGroup[] = [
  { id: 'AC', name: 'American Conference', conferenceId: null },
  { id: 'NC', name: 'National Conference', conferenceId: null },
];
const DIVISIONS: LeagueGroup[] = [
  { id: 'AC-E', name: 'AC East', conferenceId: 'AC' },
  { id: 'AC-N', name: 'AC North', conferenceId: 'AC' },
  { id: 'NC-E', name: 'NC East', conferenceId: 'NC' },
  { id: 'NC-N', name: 'NC North', conferenceId: 'NC' },
];

describe('sorting the standings', () => {
  it('leaves the league order alone until a column is chosen', () => {
    expect(sortRows(ROWS, DEFAULT_SORT).map((r) => r.teamId)).toEqual(['BUF', 'PIT', 'DAL', 'CHI']);
  });

  it('starts a number best-first and reverses in one step', () => {
    const first = sortFor('FOR');
    expect(first).toEqual({ key: 'FOR', dir: 'desc' });
    expect(sortRows(ROWS, first).map((r) => r.teamId)).toEqual(['BUF', 'PIT', 'DAL', 'CHI']);

    const second = reverse(first);
    expect(sortRows(ROWS, second).map((r) => r.teamId)).toEqual(['CHI', 'DAL', 'PIT', 'BUF']);
    expect(reverse(second)).toEqual(first);
  });

  it('starts a name A to Z, and offers the league order as a field of its own', () => {
    const sort = sortFor('CLUB');
    expect(sort.dir).toBe('asc');
    expect(sortRows(ROWS, sort).map((r) => r.teamId)).toEqual(['BUF', 'CHI', 'DAL', 'PIT']);

    expect(sortFor(LEAGUE_ORDER)).toEqual(DEFAULT_SORT);
    // The league's own order has no direction to reverse.
    expect(reverse(DEFAULT_SORT)).toEqual(DEFAULT_SORT);
    expect(SORT_FIELDS[0]?.key).toBe(LEAGUE_ORDER);
    expect(SORT_FIELDS[0]?.fixed).toBe(true);
  });

  it('is stable: the same sort applied twice gives the same order', () => {
    // GP is 17 for all four, so only stability decides the order.
    const once = sortRows(ROWS, sortFor('PLAYED'));
    expect(sortRows(once, sortFor('PLAYED')).map((r) => r.teamId)).toEqual(once.map((r) => r.teamId));
    expect(once.map((r) => r.teamId)).toEqual(ROWS.map((r) => r.teamId));
  });

  it('sorts a streak by direction, losing runs below winning ones', () => {
    expect(sortRows(ROWS, { key: 'STREAK', dir: 'desc' }).map((r) => r.teamId))
      .toEqual(['BUF', 'DAL', 'PIT', 'CHI']);
  });

  it('puts clubs with no seed below every seeded club, never at the top', () => {
    const sorted = sortRows(ROWS, { key: 'SEED', dir: 'desc' });
    expect(sorted[sorted.length - 1]?.teamId).toBe('CHI');
  });

  it('never drops or duplicates a club, whatever the column', () => {
    for (const key of ['CLUB', 'PCT', 'PLAYED', 'FOR', 'AGAINST', 'DIFF', 'STREAK', 'SEED'] as const) {
      for (const dir of ['asc', 'desc'] as const) {
        const ids = sortRows(ROWS, { key, dir }).map((r) => r.teamId);
        expect(new Set(ids)).toEqual(new Set(ROWS.map((r) => r.teamId)));
      }
    }
  });

  it('does not mutate the rows it was given', () => {
    const before = ROWS.map((r) => r.teamId);
    sortRows(ROWS, { key: 'FOR', dir: 'asc' });
    expect(ROWS.map((r) => r.teamId)).toEqual(before);
  });
});

describe('splitting the standings', () => {
  it('shows one table for the whole league', () => {
    const groups = groupRows(ROWS, 'LEAGUE', CONFERENCES, DIVISIONS);
    expect(groups.length).toBe(1);
    expect(groups[0]?.rows.length).toBe(4);
  });

  it('uses the league\'s own names for its conferences and divisions', () => {
    expect(groupRows(ROWS, 'CONFERENCE', CONFERENCES, DIVISIONS).map((g) => g.name))
      .toEqual(['American Conference', 'National Conference']);
    expect(groupRows(ROWS, 'DIVISION', CONFERENCES, DIVISIONS).map((g) => g.name))
      .toEqual(['AC East', 'AC North', 'NC East', 'NC North']);
  });

  it('puts every club in exactly one group, under every split', () => {
    for (const split of ['LEAGUE', 'CONFERENCE', 'DIVISION'] as const) {
      const seen = groupRows(ROWS, split, CONFERENCES, DIVISIONS).flatMap((g) => g.rows.map((r) => r.teamId));
      expect(seen.sort()).toEqual(['BUF', 'CHI', 'DAL', 'PIT']);
    }
  });

  it('shows a club whose division the league did not name rather than hiding it', () => {
    const stray = club('XXX', 'AC-Z', 8, 9, 350, 1, null);
    const groups = groupRows([...ROWS, stray], 'DIVISION', CONFERENCES, DIVISIONS);
    expect(groups.some((g) => g.rows.some((r) => r.teamId === 'XXX'))).toBe(true);
  });
});

describe('the standings panel', () => {
  it('renders one table per group and marks the manager\'s club', () => {
    render(
      <StandingsPanel
        rows={ROWS}
        conferences={CONFERENCES}
        divisions={DIVISIONS}
        split="CONFERENCE"
        sort={DEFAULT_SORT}
        onSort={() => undefined}
        userTeamId="BUF"
        nameOf={(id) => id}
      />,
    );
    expect(screen.getAllByTestId('standings-body').length).toBe(2);
    expect(screen.getByText('American Conference')).toBeTruthy();
    // Sorting is the explicit control, not the column heads: the heads carry no
    // button at all, which is the point of docs/PROMPT-BOOK.md prompt 0061.
    expect(screen.getAllByRole('columnheader').length).toBe(16);
    expect(screen.getByRole('tab', { name: 'League order' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'League order' }).getAttribute('aria-selected')).toBe('true');
    for (const head of screen.getAllByRole('columnheader')) {
      expect(head.querySelector('button')).toBeNull();
    }
  });
});

describe('the board list', () => {
  it('is the same list in the product and in the play-test rig', () => {
    expect(RIG_BOARD_KEYS).toEqual(BOARD_KEYS);
    expect(RIG_DEPTH).toBe(BOARD_DEPTH);
  });

  it('covers all three sides of the ball', () => {
    expect(BOARD_KEYS.length).toBe(12);
  });
});
