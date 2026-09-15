// Franchise Settings: the difficulty, the eight rows, and the one tap that
// takes two.
//
// The rules worth pinning are about what a control is allowed to claim. A
// preset is a statement about all eight rows, so the rows stay visible under
// it rather than hidden. Commissioner Mode rewrites a save, so it asks first
// and cancelling leaves it off. And the screen says once, plainly, that the
// simulation does not read any of this yet -- eight controls promising
// specific behaviour are worse than none if nothing behind them is true.

import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FranchiseSettingsBody } from '../src/screens/franchiseSettings';
import { SETTINGS } from '../src/screens/settingsCatalogue';
import {
  PRESETS, difficultyOf, type Difficulty, type FranchiseSettings, type SettingKey,
} from '../supabase/functions/_shared/api/franchiseOptions';
import type { TeamProfile } from '../supabase/functions/_shared/api/reads/teamProfiles';

const IRONMEN = {
  teamId: 'CLE', abbreviation: 'CLE', teamName: 'Ironmen', fullName: 'Cleveland Ironmen',
  primary: '#41230A', secondary: '#F26A21',
} as unknown as TeamProfile;

/** The screen's state lives on the setup draft, so the harness holds it the way
 *  FranchiseSettingsScreen does -- including the modal, which is the screen's
 *  and not the body's. */
function Harness({ onAsk }: { readonly onAsk?: () => void }) {
  const [difficulty, setDifficulty] = useState<Difficulty>('NORMAL');
  const [settings, setSettings] = useState<FranchiseSettings>(PRESETS.NORMAL);
  return (
    <FranchiseSettingsBody
      gmName="Durk Banks"
      team={IRONMEN}
      season={2026}
      settings={settings}
      difficulty={difficulty}
      onDifficulty={(next) => {
        setDifficulty(next);
        if (next !== 'CUSTOM') setSettings(PRESETS[next]);
      }}
      onSetting={(key: SettingKey, value) => {
        if (key === 'commissionerMode' && value === 'ON') { onAsk?.(); return; }
        const next = { ...settings, [key]: value } as FranchiseSettings;
        setSettings(next);
        setDifficulty(difficultyOf(next));
      }}
    />
  );
}

const taken = (testId: string): string | null => {
  const group = screen.getByTestId(testId);
  const on = [...group.querySelectorAll('[role="radio"]')]
    .find((n) => n.getAttribute('aria-checked') === 'true');
  return on?.textContent ?? null;
};

describe('where you are in the flow', () => {
  it('reminds you of the GM, the club, the difficulty and the season', () => {
    render(<Harness />);
    const card = screen.getByTestId('setup-summary').textContent ?? '';
    expect(card).toContain('Cleveland Ironmen');
    expect(card).toContain('Durk Banks');
    expect(card).toContain('Normal');
    expect(card).toContain('Opens 2026');
  });

  it('reports an unread season rather than naming a year', () => {
    cleanup();
    render(
      <FranchiseSettingsBody
        gmName="Durk Banks" team={IRONMEN} season={null}
        settings={PRESETS.NORMAL} difficulty="NORMAL"
        onDifficulty={() => undefined} onSetting={() => undefined}
      />,
    );
    expect(screen.getByTestId('setup-summary').textContent).toContain('Season not read');
  });
});

describe('the difficulty card', () => {
  it('opens on Normal and explains the one that is chosen', () => {
    render(<Harness />);
    expect(taken('difficulty')).toBe('Normal');
    expect(screen.getByTestId('difficulty-detail').textContent)
      .toContain('intended balanced experience');
  });

  it('sets all eight rows when a preset is chosen', () => {
    // A preset is a statement about all eight, not a label over them.
    render(<Harness />);
    fireEvent.click(screen.getByTestId('difficulty-hard'));
    expect(taken('setting-injuryFrequency-control')).toBe('High');
    expect(taken('setting-tradeDifficulty-control')).toBe('Hard');
    expect(taken('setting-playerDevelopment-control')).toBe('Slow');
    expect(taken('setting-scoutingVisibility-control')).toBe('Partial Ratings');
  });

  it('explains each difficulty in the words the player needs', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('difficulty-easy'));
    const easy = screen.getByTestId('difficulty-detail').textContent ?? '';
    for (const promise of ['Owner pressure is softer', 'injuries are lighter', 'trades come easier']) {
      expect(easy, promise).toContain(promise);
    }
    fireEvent.click(screen.getByTestId('difficulty-hard'));
    expect(screen.getByTestId('difficulty-detail').textContent).toContain('more demanding');
  });
});

describe('the eight rules', () => {
  it('shows every one, with a title and an explanation', () => {
    render(<Harness />);
    for (const def of SETTINGS) {
      const row = screen.getByTestId(`setting-${def.key}`);
      expect(row.textContent, def.key).toContain(def.title);
      expect(row.textContent, def.key).toContain(def.detail.slice(0, 30));
    }
  });

  it('locks the rows under a preset, and shows them anyway', () => {
    // Hidden, a player choosing Hard would have to take the word for what Hard
    // did. Locked, they can read all eight.
    render(<Harness />);
    const control = screen.getByTestId('setting-injuryFrequency-control');
    expect(control.querySelector('[role="radio"]')?.hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('rules-note').textContent).toContain('Choose Custom to change them');
  });

  it('unlocks them under Custom', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('difficulty-custom'));
    const control = screen.getByTestId('setting-injuryFrequency-control');
    expect(control.querySelector('[role="radio"]')?.hasAttribute('disabled')).toBe(false);
    expect(screen.getByTestId('rules-note').textContent).toContain('Set each rule yourself');
  });

  it('records a row the player changes, and renames the difficulty for it', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('difficulty-custom'));
    fireEvent.click(screen.getByTestId('setting-injuryFrequency-control-high'));
    expect(taken('setting-injuryFrequency-control')).toBe('High');
    expect(taken('difficulty')).toBe('Custom');
  });

  it('goes back to a preset name when the rows happen to match one again', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('difficulty-custom'));
    fireEvent.click(screen.getByTestId('setting-injuryFrequency-control-high'));
    expect(taken('difficulty')).toBe('Custom');
    fireEvent.click(screen.getByTestId('setting-injuryFrequency-control-normal'));
    expect(taken('difficulty')).toBe('Normal');
  });

  it('explains what scouting visibility hides', () => {
    render(<Harness />);
    expect(screen.getByTestId('setting-scoutingVisibility').textContent)
      .toContain('Partial Ratings hides some prospect and player certainty');
  });

  it('says once that the simulation does not read any of it yet', () => {
    // Once, at the foot -- not eight apologies. Eight controls promising
    // specific behaviour are worse than none if nothing behind them is true.
    render(<Harness />);
    expect(screen.getByTestId('rules-honesty').textContent)
      .toContain('The simulation does not read these yet');
  });
});

describe('commissioner mode', () => {
  it('asks before it turns on rather than switching under the tap', () => {
    const onAsk = vi.fn();
    render(<Harness onAsk={onAsk} />);
    fireEvent.click(screen.getByTestId('difficulty-custom'));
    fireEvent.click(screen.getByTestId('setting-commissionerMode-control-on'));
    expect(onAsk).toHaveBeenCalledTimes(1);
    // And it stays off until the asking is answered.
    expect(taken('setting-commissionerMode-control')).toBe('Off');
    expect(screen.queryByTestId('commissioner-badge')).toBeNull();
  });

  it('explains what the editing tools reach', () => {
    render(<Harness />);
    expect(screen.getByTestId('setting-commissionerMode').textContent)
      .toContain('ratings, rosters, teams and saves');
  });

  it('badges the summary once it is on', () => {
    cleanup();
    render(
      <FranchiseSettingsBody
        gmName="Durk Banks" team={IRONMEN} season={2026}
        settings={{ ...PRESETS.NORMAL, commissionerMode: 'ON' }} difficulty="CUSTOM"
        onDifficulty={() => undefined} onSetting={() => undefined}
      />,
    );
    expect(screen.getByTestId('commissioner-badge').textContent)
      .toBe('Commissioner Tools Enabled');
  });
});
