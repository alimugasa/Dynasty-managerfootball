// Confirm Franchise: the last look before a decade-long decision.
//
// Its job is to show every answer the flow collected and then write exactly
// once. So the rules worth pinning are about completeness and about restraint:
// every card states what the player chose, the league card states what was
// counted rather than what a constant said, a blank save name closes the
// button, and a failure says the file is still empty rather than leaving the
// player guessing what happened to it.

import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FranchiseSummary, defaultSaveName, saveNameOf } from '../src/screens/franchiseSummary';
import { DEFAULT_SETTINGS, PRESETS } from '../supabase/functions/_shared/api/franchiseOptions';
import type { LeagueShape } from '../supabase/functions/_shared/api/reads/teamBoard';
import type { TeamProfile } from '../supabase/functions/_shared/api/reads/teamProfiles';

const IRONMEN = {
  teamId: 'CLE', abbreviation: 'CLE', city: 'Cleveland', teamName: 'Ironmen',
  fullName: 'Cleveland Ironmen',
  conferenceId: 'AC', conferenceName: 'Atlas Conference',
  divisionId: 'AC-N', divisionName: 'Atlas Conference North', divisionShort: 'North',
  primary: '#41230A', secondary: '#F26A21',
  overall: 82, offense: 81.4, defense: 82.9, specialTeams: 74.1,
  capSpace: 18_400_000, draftScore: 56, draftLabel: 'Standard',
  ownerPatience: 72, ownerMood: 'Patient', fanPressure: 'Engaged',
  archetype: 'Defensive core', difficulty: 'Playoff Push',
} as unknown as TeamProfile;

const LEAGUE: LeagueShape = {
  teams: 32, conferences: 2, divisions: 8,
  regularSeasonWeeks: 18, draftPicks: 448, season: 2026,
};

/** The save name is the caller's state, the way the draft holds it. */
function Harness(over: Partial<Parameters<typeof FranchiseSummary>[0]> = {}) {
  const [saveName, setSaveName] = useState<string | null>(null);
  return (
    <FranchiseSummary
      slot={2}
      gmName="Durk Banks"
      styleLabel="Negotiator"
      team={IRONMEN}
      settings={DEFAULT_SETTINGS}
      difficulty="NORMAL"
      league={LEAGUE}
      season={2026}
      saveName={saveName}
      onSaveName={setSaveName}
      onCreate={() => undefined}
      onBack={() => undefined}
      onChangeTeam={() => undefined}
      {...over}
    />
  );
}

const mount = (over: Partial<Parameters<typeof FranchiseSummary>[0]> = {}) => {
  const onCreate = vi.fn();
  const onBack = vi.fn();
  const onChangeTeam = vi.fn();
  render(<Harness onCreate={onCreate} onBack={onBack} onChangeTeam={onChangeTeam} {...over} />);
  return { onCreate, onBack, onChangeTeam };
};

describe('what a save file is called', () => {
  it('suggests the club', () => {
    expect(defaultSaveName(IRONMEN)).toBe('Cleveland Ironmen Franchise');
  });

  it('falls back to the nickname when the full name would not fit', () => {
    const long = { ...IRONMEN, fullName: 'A Very Long Metropolitan Area Ironmen' };
    expect(defaultSaveName(long as TeamProfile)).toBe('Ironmen Franchise');
  });

  it('suggests nothing where the club could not be read', () => {
    // There is no honest default then, and the field says so by being empty.
    expect(defaultSaveName(null)).toBeNull();
    expect(saveNameOf(null, null)).toBe('');
  });

  it('prefers what the player typed over the suggestion', () => {
    expect(saveNameOf('The Rebuild', IRONMEN)).toBe('The Rebuild');
    // Including an empty one: clearing it is a thing they did, not a thing to
    // undo for them.
    expect(saveNameOf('', IRONMEN)).toBe('');
  });
});

describe('the review', () => {
  it('opens with the line that says what this screen is for', () => {
    mount();
    expect(screen.getByText('Review your setup before taking the office.')).toBeTruthy();
  });

  it('states the file, the GM and what is true of a manager with no career', () => {
    mount();
    const card = screen.getByTestId('card-gm').textContent ?? '';
    expect(card).toContain('Save fileFile 2');
    expect(card).toContain('General managerDurk Banks');
    expect(card).toContain('GM styleNegotiator');
    expect(card).toContain('Starting reputationUnknown');
    expect(card).toContain('Career record0-0');
  });

  it('fills the save name with the club and lets it be changed', () => {
    mount();
    const field = screen.getByTestId('save-name') as HTMLInputElement;
    expect(field.value).toBe('Cleveland Ironmen Franchise');
    fireEvent.change(field, { target: { value: 'The Rebuild' } });
    expect((screen.getByTestId('save-name') as HTMLInputElement).value).toBe('The Rebuild');
  });

  it('states every fact the scouting report gave about the club', () => {
    mount();
    const card = screen.getByTestId('card-team').textContent ?? '';
    for (const fact of [
      'Ironmen', 'Cleveland · Atlas Conference · North',
      'DifficultyPlayoff Push', 'ArchetypeDefensive core', 'Overall82',
      'Offence81.4', 'Defence82.9', 'Special teams74.1', 'Cap space$18.4M',
      'Draft capitalStandard · 56', 'Owner patiencePatient · 72', 'Fan pressureEngaged',
    ]) {
      expect(card, fact).toContain(fact);
    }
  });

  it('states the league it counted, not a league it assumed', () => {
    mount();
    const card = screen.getByTestId('card-league').textContent ?? '';
    for (const fact of [
      'Teams32 teams', 'Conferences2 conferences', 'Divisions8 divisions',
      'Regular season18-week regular season', 'PlayoffsEnabled',
      'Draft picks448 loaded', 'Salary capOn', 'Starting point2026, Week 1',
    ]) {
      expect(card, fact).toContain(fact);
    }
  });

  it('says the season length is unknown rather than promising eighteen weeks', () => {
    // A template with no schedule is a broken import, not an eighteen-week one.
    mount({ league: { ...LEAGUE, regularSeasonWeeks: null } });
    expect(screen.getByTestId('card-league').textContent).toContain('Regular seasonNot recorded');
  });

  it('reads back all nine rules', () => {
    mount({ settings: PRESETS.HARD, difficulty: 'HARD' });
    const card = screen.getByTestId('card-rules').textContent ?? '';
    expect(card).toContain('DifficultyHard');
    expect(card).toContain('Injury FrequencyHigh');
    expect(card).toContain('Scouting VisibilityPartial Ratings');
    expect(card).toContain('Commissioner ModeOff');
  });

  it('calls a franchise with the tools locked a realistic one', () => {
    mount();
    expect(screen.getByTestId('rules-verdict').textContent).toBe('Realistic franchise rules.');
  });

  it('warns in amber when the editing tools are open', () => {
    mount({ settings: { ...DEFAULT_SETTINGS, commissionerMode: 'ON' }, difficulty: 'CUSTOM' });
    const verdict = screen.getByTestId('rules-verdict').textContent ?? '';
    expect(verdict).toContain('Commissioner Tools Enabled');
    expect(verdict).toContain('This save allows editing tools.');
  });
});

describe('going on, or not', () => {
  it('refuses to create a file with no name', () => {
    mount();
    fireEvent.change(screen.getByTestId('save-name'), { target: { value: '   ' } });
    expect(screen.getByTestId('create-franchise').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('save-name-error').textContent).toBe('A save file needs a name.');
  });

  it('refuses a name longer than a save file may carry', () => {
    mount();
    fireEvent.change(screen.getByTestId('save-name'), { target: { value: 'x'.repeat(41) } });
    expect(screen.getByTestId('create-franchise').hasAttribute('disabled')).toBe(true);
  });

  it('creates once the name is good again', () => {
    const { onCreate } = mount();
    fireEvent.change(screen.getByTestId('save-name'), { target: { value: '' } });
    fireEvent.change(screen.getByTestId('save-name'), { target: { value: 'The Rebuild' } });
    fireEvent.click(screen.getByTestId('create-franchise'));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('offers a way back to the club without touching anything else', () => {
    const { onChangeTeam, onBack } = mount();
    fireEvent.click(screen.getByTestId('change-team'));
    expect(onChangeTeam).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('back-to-preview'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('while it is being built', () => {
  it('closes every control and shows what is happening', () => {
    mount({ busy: 'Creating…' });
    expect(screen.getByTestId('create-franchise').textContent).toBe('Creating…');
    for (const control of ['create-franchise', 'back-to-preview', 'change-team']) {
      expect(screen.getByTestId(control).hasAttribute('disabled'), control).toBe(true);
    }
    expect(screen.getByTestId('building').textContent).toContain('Building the league');
  });

  it('says the file is still empty when it fails', () => {
    // create-save is one transaction. Either the whole world landed or none of
    // it did, so the screen can promise there is nothing to clean up.
    cleanup();
    mount({ failed: true });
    const failure = screen.getByTestId('create-failed').textContent ?? '';
    expect(failure).toContain('file 2 is still empty');
    expect(failure).toContain('Nothing was half written');
    // And the button is live again, because trying again is the right move.
    expect(screen.getByTestId('create-franchise').hasAttribute('disabled')).toBe(false);
  });

  it('does not show a failure and a build at the same time', () => {
    mount({ failed: true, busy: 'Creating…' });
    expect(screen.queryByTestId('create-failed')).toBeNull();
    expect(screen.getByTestId('building')).toBeTruthy();
  });
});
