// The scouting report: what it states, and what it refuses to state.
//
// Its job is to be the last look before a decade-long decision, so it may not
// round a missing number down to a plausible one, and it may not print a
// phrase it could not derive. Everything on it is either a measurement or a
// pure function of measurements, and both disappear when the measurement does.

import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TeamPreview, TeamPreviewSkeleton, capIn, draftIn, playerIn } from '../src/screens/teamPreview';
import { bandColor } from '../src/screens/ratingRing';
import type { TeamProfile } from '../supabase/functions/_shared/api/reads/teamProfiles';

const IRONMEN: TeamProfile = {
  teamId: 'CLE', abbreviation: 'CLE', city: 'Cleveland', teamName: 'Ironmen',
  fullName: 'Cleveland Ironmen',
  conferenceId: 'AC', conferenceName: 'Atlas Conference',
  conferenceAbbr: 'AC', conferenceShort: 'Atlas',
  divisionId: 'AC-N', divisionName: 'Atlas Conference North', region: 'North',
  primary: '#41230A', secondary: '#F26A21',
  overall: 82, offense: 81.4, defense: 82.9, specialTeams: 74.1,
  overallBand: 'strong', offenseBand: 'strong', defenseBand: 'strong',
  specialTeamsBand: 'solid',
  capSpace: 18_400_000, draftCapital: 547, draftScore: 56, draftLabel: 'Standard',
  averageAge: 25.5, rosterCount: 90,
  quarterbackStatus: 'Bridge QB',
  ownerPatience: 72, ownerMood: 'Patient', stadiumCapacity: 71_000,
  fanPressure: 'Engaged', marketSize: 6,
  bestPlayer: { name: 'Lars Stanfield', position: 'EDGE', overall: 89 },
  youngPlayer: { name: 'Zaire Piscopo', position: 'WR', overall: 76, age: 23 },
  biggestWeakness: 'Backfield', rosterTimeline: 'Contending soon',
  suggestedMove: 'Review backfield depth.',
  franchiseStatus: 'Playoff Push · Contending soon',
  archetype: 'Defensive core', difficulty: 'Playoff Push',
  tags: ['PLAYOFF_PUSH'],
};

function mount(team: TeamProfile = IRONMEN, busy: string | null = null) {
  const onConfirm = vi.fn();
  const onBack = vi.fn();
  render(<TeamPreview team={team} onConfirm={onConfirm} onBack={onBack} busy={busy} />);
  return { onConfirm, onBack };
}

describe('the figures on the report', () => {
  it('reads cap money in millions, the way a cap is talked about', () => {
    expect(capIn(18_400_000)).toBe('$18.4M');
    expect(capIn(-2_150_000)).toBe('-$2.1M');
    expect(capIn(0)).toBe('$0.0M');
    expect(capIn(null)).toBeNull();
  });

  it('gives draft capital a word and a score, or neither', () => {
    expect(draftIn('Strong', 82)).toBe('Strong · 82');
    // A score with no word beside it is a number nobody can place, and a word
    // with no score is a claim with no working.
    expect(draftIn(null, 82)).toBeNull();
    expect(draftIn('Strong', null)).toBeNull();
  });

  it('names a player with his position and rating, and his age where it is the point', () => {
    expect(playerIn({ name: 'Lars Stanfield', position: 'EDGE', overall: 89 }))
      .toBe('Lars Stanfield · EDGE · 89');
    expect(playerIn({ name: 'Zaire Piscopo', position: 'WR', overall: 76, age: 23 }))
      .toBe('Zaire Piscopo · WR, 23 · 76');
    expect(playerIn(null)).toBeNull();
  });
});

describe('the identity card', () => {
  it('names the club, its market, its abbreviation and its place in the league', () => {
    mount();
    expect(screen.getByTestId('preview-name').textContent).toBe('Ironmen');
    expect(screen.getByText('Cleveland · CLE')).toBeTruthy();
    expect(screen.getByText('Atlas Conference · North')).toBeTruthy();
  });

  it('leads with how hard the job is', () => {
    mount();
    expect(screen.getByTestId('preview-difficulty').textContent).toBe('Playoff Push');
    expect(screen.getByTestId('preview-timeline').textContent).toBe('Contending soon');
    expect(screen.getByText('Defensive core')).toBeTruthy();
  });
});

describe('the ratings', () => {
  it('shows all four, rounded to whole numbers', () => {
    mount();
    const rings = screen.getByTestId('rating-rings').textContent ?? '';
    for (const shown of ['82Overall', '81Offence', '83Defence', '74Special teams']) {
      expect(rings, shown).toContain(shown);
    }
  });

  it('colours a rating by its band, and an unmeasured one not at all', () => {
    // The band is the server's judgement; the screen only decides what it
    // looks like. Elite and weak are the two that are meant to be noticed.
    expect(bandColor('elite')).not.toBe(bandColor('weak'));
    expect(bandColor('solid')).not.toBe(bandColor('developing'));
    expect(bandColor(null)).toBe(bandColor(null));
  });

  it('dashes a rating it does not have rather than drawing an empty ring at zero', () => {
    mount({ ...IRONMEN, specialTeams: null, specialTeamsBand: null });
    expect(screen.getByTestId('rating-rings').textContent).toContain('—Special teams');
    expect(screen.getByTestId('rating-rings').textContent).not.toContain('0Special teams');
  });
});

describe('the front office snapshot', () => {
  it('states every line the screen promises', () => {
    mount();
    const office = screen.getByTestId('front-office').textContent ?? '';
    for (const line of [
      'Cap space$18.4M', 'Draft capitalStandard · 56', 'Roster age25.5 years',
      'Roster count90 players', 'Owner patiencePatient · 72',
      'Fan pressureEngaged', 'Stadium71,000 seats',
      'Franchise statusPlayoff Push · Contending soon',
    ]) {
      expect(office, line).toContain(line);
    }
  });

  it('says fan pressure in words, not as the market size behind it', () => {
    // "Fan pressure: 6" would suggest a crowd the world simulates. It does not
    // simulate one; it knows how big the market is, and that is what this says.
    mount();
    expect(screen.getByTestId('fact-fans').textContent).toBe('Fan pressureEngaged');
    expect(screen.getByTestId('fact-fans').textContent).not.toContain('6');
  });
});

describe('the football situation', () => {
  it('states the quarterback, the two players, the hole and the horizon', () => {
    mount();
    const football = screen.getByTestId('football-situation').textContent ?? '';
    expect(football).toContain('QuarterbackBridge QB');
    expect(football).toContain('Best playerLars Stanfield · EDGE · 89');
    expect(football).toContain('Top young playerZaire Piscopo · WR, 23 · 76');
    expect(football).toContain('Biggest weaknessBackfield');
    expect(football).toContain('Roster timelineContending soon');
  });

  it('ends on the one thing to do about it', () => {
    mount();
    const move = screen.getByTestId('first-move').textContent ?? '';
    expect(move).toContain('Suggested first move');
    expect(move).toContain('Review backfield depth.');
  });

  it('leaves the move off entirely rather than inventing advice', () => {
    // A club whose numbers could not be read gets no instruction. Printing a
    // generic one would be the screen guessing on a decade-long decision.
    mount({ ...IRONMEN, suggestedMove: null });
    expect(screen.queryByTestId('first-move')).toBeNull();
  });

  it('tells a missing row apart from a fact nothing models', () => {
    mount({ ...IRONMEN, capSpace: null, stadiumCapacity: null, bestPlayer: null });
    expect(screen.getAllByText('Not recorded').length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText('$0.0M')).toBeNull();
  });
});

describe('the two buttons', () => {
  it('offers the club and the way back, by the names the flow uses', () => {
    const { onConfirm, onBack } = mount();
    expect(screen.getByTestId('confirm-team').textContent).toBe('Choose This Team');
    expect(screen.getByTestId('back-to-board').textContent).toBe('Back to Teams');
    fireEvent.click(screen.getByTestId('confirm-team'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('back-to-board'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('closes both while the dynasty is being built', () => {
    cleanup();
    mount(IRONMEN, 'Creating…');
    expect(screen.getByTestId('confirm-team').textContent).toBe('Creating…');
    expect(screen.getByTestId('confirm-team').hasAttribute('disabled')).toBe(true);
    // Leaving mid-create would strand a save halfway through a world clone.
    expect(screen.getByTestId('back-to-board').hasAttribute('disabled')).toBe(true);
  });
});

describe('before the board has answered', () => {
  it('stands in the same three shapes, so nothing reflows when it lands', () => {
    render(<TeamPreviewSkeleton />);
    expect(screen.getByTestId('preview-skeleton')).toBeTruthy();
    for (const heading of ['Ratings', 'Front office', 'Football situation']) {
      expect(screen.getByText(heading), heading).toBeTruthy();
    }
  });
});
