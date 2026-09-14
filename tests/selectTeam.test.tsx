// The scouting board: what it shows, what it hides, and what it says when a
// filter leaves nothing.
//
// The board is the one screen where the player is comparing thirty-two things,
// so the rules worth pinning are about not misleading a comparison: a club
// whose measurements did not load shows a dash rather than a zero, the label
// under a chip says what the chip actually selected, and a filter with no
// matches offers the way out rather than an empty panel.

import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SelectTeamBoard } from '../src/screens/selectTeamBoard';
import { ALL, TEAM_FILTERS, filterTeams } from '../src/screens/teamFilters';
import { TEAM_TAGS } from '../supabase/functions/_shared/api/reads/teamShape';
import type { TeamProfile } from '../supabase/functions/_shared/api/reads/teamProfiles';

const club = (over: Partial<TeamProfile>): TeamProfile => ({
  teamId: 'CLE', abbreviation: 'CLE', city: 'Cleveland', teamName: 'Ironmen',
  fullName: 'Cleveland Ironmen',
  conferenceId: 'AC', conferenceName: 'American Conference',
  divisionId: 'AC-N', divisionName: 'AC North', divisionShort: 'North',
  primary: '#41230A', secondary: '#F26A21',
  overall: 82, offense: 81.4, defense: 82.9, specialTeams: 74.1,
  capSpace: 18_400_000, draftCapital: 485, averageAge: 25.5,
  quarterbackStatus: 'Bridge QB', ownerPatience: 72, stadiumCapacity: 71_000,
  fanPressure: 'Engaged', archetype: 'Balanced', difficulty: 'Middle Class',
  tags: ['MID_TIER'],
  overallBand: 'strong', offenseBand: 'strong', defenseBand: 'strong',
  specialTeamsBand: 'solid',
  draftScore: 56, draftLabel: 'Standard', rosterCount: 90,
  ownerMood: 'Even-handed', marketSize: 6,
  bestPlayer: { name: 'Lars Stanfield', position: 'EDGE', overall: 89 },
  youngPlayer: { name: 'Zaire Piscopo', position: 'WR', overall: 76, age: 23 },
  biggestWeakness: 'Backfield', rosterTimeline: 'Contending soon',
  suggestedMove: 'Review backfield depth.',
  franchiseStatus: 'Middle Class · Contending soon',
  ...over,
});

const LEAGUE: readonly TeamProfile[] = [
  club({}),
  club({
    teamId: 'AUS', abbreviation: 'AUS', city: 'Austin', teamName: 'Stampede',
    fullName: 'Austin Stampede', conferenceId: 'NC', conferenceName: 'National Conference',
    divisionId: 'NC-S', divisionName: 'NC South', divisionShort: 'South',
    overall: 86, difficulty: 'Dynasty Ready', tags: ['CONTENDERS', 'ELITE_QB'],
    quarterbackStatus: 'Elite',
  }),
  club({
    teamId: 'SAC', abbreviation: 'SAC', city: 'Sacramento', teamName: 'Prospectors',
    fullName: 'Sacramento Prospectors', divisionId: 'AC-W', divisionName: 'AC West',
    divisionShort: 'West', overall: 74, difficulty: 'Hard Rebuild',
    tags: ['REBUILDS', 'YOUNG_ROSTER', 'HIGH_DRAFT_PICKS'],
  }),
];

/** The board is controlled -- its search and chip belong to whatever screen is
 *  showing it, so that walking to the scouting report and back does not reset
 *  them. This holds that state the way the screen does. */
function Harness({ teams, onPick, disabled }: {
  readonly teams: readonly TeamProfile[];
  readonly onPick: (teamId: string) => void;
  readonly disabled?: boolean;
}) {
  const [filter, setFilter] = useState(ALL);
  const [query, setQuery] = useState('');
  return (
    <SelectTeamBoard
      teams={teams}
      onPick={onPick}
      disabled={disabled ?? false}
      filter={filter}
      query={query}
      onFilter={setFilter}
      onQuery={setQuery}
    />
  );
}

const mount = (teams: readonly TeamProfile[] = LEAGUE) => {
  const onPick = vi.fn();
  render(<Harness teams={teams} onPick={onPick} />);
  return { onPick };
};

const shownIds = (): string[] =>
  [...screen.getByTestId('club-list').querySelectorAll('[data-testid^="team-"]')]
    .map((n) => n.getAttribute('data-testid') ?? '');

describe('the chips and the tags behind them', () => {
  it('offer exactly the tags the server hands out, plus All', () => {
    // The labels are copy on this side and the tags are statistics on the
    // other. A chip whose tag no server club carries is a chip that silently
    // matches nothing, which is the worst kind of broken filter.
    const chips = TEAM_FILTERS.map((f) => f.key).filter((k) => k !== ALL);
    expect(chips).toEqual([...TEAM_TAGS]);
  });
});

describe('searching the board', () => {
  it('matches on city, nickname, abbreviation, conference and division', () => {
    for (const [query, expected] of [
      ['cleveland', 'CLE'], ['stampede', 'AUS'], ['sac', 'SAC'],
      ['national', 'AUS'], ['west', 'SAC'], ['AC-N', 'CLE'],
    ] as const) {
      const hit = filterTeams(LEAGUE, ALL, query);
      expect(hit.map((t) => t.teamId), query).toEqual([expected]);
    }
  });

  it('takes every word separately, so a half-remembered name still lands', () => {
    expect(filterTeams(LEAGUE, ALL, 'cleveland iron').map((t) => t.teamId)).toEqual(['CLE']);
    // Words from two different fields, in the wrong order.
    expect(filterTeams(LEAGUE, ALL, 'iron north').map((t) => t.teamId)).toEqual(['CLE']);
  });

  it('combines the chip and the query rather than letting either win', () => {
    expect(filterTeams(LEAGUE, 'CONTENDERS', 'cleveland')).toEqual([]);
    expect(filterTeams(LEAGUE, 'CONTENDERS', 'austin').map((t) => t.teamId)).toEqual(['AUS']);
  });
});

describe('the board on screen', () => {
  it('names the league placing in words rather than in ids', () => {
    mount();
    // "AC · AC-N" is two identifiers where a label should be.
    expect(screen.getByText('American Conference · North')).toBeTruthy();
    expect(screen.queryByText(/AC · AC-N/)).toBeNull();
  });

  it('shows the market over the name, and the rating beside it', () => {
    mount();
    expect(screen.getByText('Cleveland')).toBeTruthy();
    expect(screen.getByText('Ironmen')).toBeTruthy();
    expect(screen.getByText('86')).toBeTruthy();
  });

  it('dashes a club it has no rating for rather than calling it zero', () => {
    mount([club({ overall: null, difficulty: null })]);
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('filters the list as a chip is tapped', () => {
    mount();
    expect(shownIds()).toHaveLength(3);
    fireEvent.click(screen.getByRole('tab', { name: 'Contenders' }));
    expect(shownIds()).toEqual(['team-AUS']);
  });

  it('filters the list as the search is typed', () => {
    mount();
    fireEvent.change(screen.getByTestId('board-search'), { target: { value: 'prospect' } });
    expect(shownIds()).toEqual(['team-SAC']);
  });

  it('says what the chip selected and how many it left', () => {
    mount();
    expect(screen.getByTestId('filter-detail').textContent).toContain('3 of 3');
    fireEvent.click(screen.getByRole('tab', { name: 'Elite QB' }));
    const detail = screen.getByTestId('filter-detail').textContent ?? '';
    expect(detail).toContain('rated 88 or better');
    expect(detail).toContain('1 of 3');
  });

  it('offers a way out when nothing matches', () => {
    mount();
    fireEvent.change(screen.getByTestId('board-search'), { target: { value: 'nowhere' } });
    expect(screen.getByTestId('no-teams').textContent).toContain('No teams match this filter');
    expect(screen.queryByTestId('club-list')).toBeNull();

    fireEvent.click(screen.getByTestId('clear-filters'));
    expect(shownIds()).toHaveLength(3);
  });

  it('clears the chip as well as the query', () => {
    mount();
    fireEvent.click(screen.getByRole('tab', { name: 'Rebuilds' }));
    fireEvent.change(screen.getByTestId('board-search'), { target: { value: 'zzz' } });
    fireEvent.click(screen.getByTestId('clear-filters'));
    expect(shownIds()).toHaveLength(3);
    expect((screen.getByTestId('board-search') as HTMLInputElement).value).toBe('');
  });

  it('reports the club that was tapped, and creates nothing', () => {
    const { onPick } = mount();
    fireEvent.click(screen.getByTestId('team-AUS'));
    expect(onPick).toHaveBeenCalledWith('AUS');
  });

  it('hands its search and chip to the caller, not to itself', () => {
    // The board is controlled so the state survives a walk to the scouting
    // report and back. Held inside the component it would die the moment the
    // player tapped a club, and Back would land on a reset board.
    const onFilter = vi.fn();
    const onQuery = vi.fn();
    render(
      <SelectTeamBoard
        teams={LEAGUE}
        onPick={() => undefined}
        filter="CONTENDERS"
        query=""
        onFilter={onFilter}
        onQuery={onQuery}
      />,
    );
    // Rendered from the props it was given, not from anything it decided.
    expect(shownIds()).toEqual(['team-AUS']);
    fireEvent.change(screen.getByTestId('board-search'), { target: { value: 'x' } });
    expect(onQuery).toHaveBeenCalledWith('x');
    fireEvent.click(screen.getByRole('tab', { name: 'Rebuilds' }));
    expect(onFilter).toHaveBeenCalledWith('REBUILDS');
  });

  it('ignores taps while a dynasty is already being created', () => {
    cleanup();
    const onPick = vi.fn();
    render(<Harness teams={LEAGUE} onPick={onPick} disabled />);
    fireEvent.click(screen.getByTestId('team-AUS'));
    expect(onPick).not.toHaveBeenCalled();
  });
});
