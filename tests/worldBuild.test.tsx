// Building the franchise world: what the screen may claim, and when.
//
// This screen is the one most tempting to fake, so the tests are mostly about
// restraint. A step is only checked off once the server has reported it, the
// number under a step is the count that step actually wrote, and a failure
// names the step the server named rather than guessing from a message.

import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WorldBuild, stadiumBackdrop, stepDetail } from '../src/screens/worldBuild';
import { BUILD_STEPS, type BuildStep } from '../supabase/functions/_shared/api/buildSteps';
import type { TeamProfile } from '../supabase/functions/_shared/api/reads/teamProfiles';

const IRONMEN = {
  teamId: 'CLE', abbreviation: 'CLE', teamName: 'Ironmen', fullName: 'Cleveland Ironmen',
  primary: '#41230A', secondary: '#F26A21',
} as unknown as TeamProfile;

/** What the server reports for a clean build, with the counts it really sends. */
const REPORTED: readonly BuildStep[] = [
  { key: 'league', label: 'Creating league structure', count: 10, unit: 'conferences and divisions' },
  { key: 'teams', label: 'Creating teams', count: 32, unit: 'teams' },
  { key: 'players', label: 'Generating players', count: 3066, unit: 'players' },
  { key: 'rosters', label: 'Assigning rosters', count: 1696, unit: 'roster places' },
  { key: 'contracts', label: 'Creating contracts', count: 1696, unit: 'contracts' },
  { key: 'depth', label: 'Building depth charts', count: 1944, unit: 'depth chart places' },
  { key: 'schedule', label: 'Generating schedule', count: 272, unit: 'fixtures' },
  { key: 'picks', label: 'Setting draft picks', count: 448, unit: 'picks' },
  { key: 'news', label: 'Preparing news feed', count: null, unit: null },
  { key: 'office', label: 'Opening front office', count: null, unit: null },
];

function mount(over: Partial<Parameters<typeof WorldBuild>[0]> = {}) {
  const onRetry = vi.fn();
  const onMenu = vi.fn();
  render(
    <WorldBuild
      team={IRONMEN}
      gmName="Durk Banks"
      slot={2}
      phase="building"
      steps={[]}
      shown={0}
      failedStep={null}
      onRetry={onRetry}
      onMenu={onMenu}
      {...over}
    />,
  );
  return { onRetry, onMenu };
}

const stateOf = (label: string): string | null => {
  const id = `build-step-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  return screen.getByTestId(id).getAttribute('data-state');
};

describe('what a finished step says', () => {
  it('reports the count it wrote, grouped for reading', () => {
    expect(stepDetail(REPORTED[2])).toBe('3,066 players');
    expect(stepDetail(REPORTED[7])).toBe('448 picks');
  });

  it('says a step is ready where there is nothing to count', () => {
    // The news feed starts empty and fills as the season is played; opening the
    // office is work rather than rows. A "1" in either place would be a number
    // pretending to be a measurement.
    expect(stepDetail(REPORTED[8])).toBe('Ready');
    expect(stepDetail(REPORTED[9])).toBe('Ready');
  });

  it('says nothing about a step the server did not report', () => {
    expect(stepDetail(undefined)).toBeNull();
  });
});

describe('the screen while the world is being written', () => {
  it('names the club, the GM and the file it is building into', () => {
    mount();
    expect(screen.getByText('Cleveland Ironmen')).toBeTruthy();
    expect(screen.getByText('Durk Banks · File 2')).toBeTruthy();
  });

  it('shows all ten steps from the first frame', () => {
    mount();
    for (const def of BUILD_STEPS) expect(screen.getByText(def.label), def.key).toBeTruthy();
  });

  it('checks nothing off before the server has reported anything', () => {
    // The world is written in one transaction: there is no partial state to
    // observe, so a check mark here would be a claim with nothing behind it.
    mount();
    for (const def of BUILD_STEPS.slice(1)) expect(stateOf(def.label), def.key).toBe('pending');
    expect(stateOf('Creating league structure')).toBe('active');
  });

  it('says plainly why nothing ticks along', () => {
    mount();
    expect(screen.getByTestId('build-note').textContent)
      .toContain('The world is written in one transaction');
  });

  it('checks off exactly what has been revealed, with its count', () => {
    mount({ phase: 'reporting', steps: REPORTED, shown: 3 });
    expect(stateOf('Creating league structure')).toBe('done');
    expect(stateOf('Generating players')).toBe('done');
    expect(stateOf('Assigning rosters')).toBe('active');
    expect(stateOf('Setting draft picks')).toBe('pending');
    expect(screen.getByText('3,066 players')).toBeTruthy();
    // And nothing is claimed for a step that has not been revealed yet.
    expect(screen.queryByText('448 picks')).toBeNull();
  });

  it('finishes on the line that says what happens next', () => {
    mount({ phase: 'done', steps: REPORTED, shown: BUILD_STEPS.length });
    expect(screen.getByTestId('build-opening').textContent).toBe('Opening front office…');
    expect(screen.queryByTestId('build-failed')).toBeNull();
  });
});

describe('when a step fails', () => {
  it('names the step the server named', () => {
    mount({ phase: 'failed', steps: [], shown: 6, failedStep: 'schedule' });
    expect(screen.getByTestId('build-failed').textContent)
      .toContain('Generating schedule failed');
    expect(stateOf('Generating schedule')).toBe('failed');
  });

  it('promises the file is still empty, because the transaction says so', () => {
    mount({ phase: 'failed', steps: [], shown: 0, failedStep: 'players' });
    const card = screen.getByTestId('build-failed').textContent ?? '';
    expect(card).toContain('File 2 is still empty');
    expect(card).toContain('nothing was half built');
  });

  it('offers a retry and a way out', () => {
    const { onRetry, onMenu } = mount({ phase: 'failed', steps: [], shown: 0, failedStep: 'depth' });
    fireEvent.click(screen.getByTestId('build-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('build-menu'));
    expect(onMenu).toHaveBeenCalledTimes(1);
  });

  it('says so plainly when the failure was not a step at all', () => {
    // A request refused before the build began -- a taken slot, a rule the
    // server could not read -- names no step, and inventing one would point the
    // player at the wrong thing.
    cleanup();
    mount({ phase: 'failed', steps: [], shown: 0, failedStep: null });
    expect(screen.getByTestId('build-failed').textContent)
      .toContain('The franchise was not created');
  });

  it('drops the explanation once there is a failure card to read', () => {
    mount({ phase: 'failed', steps: [], shown: 0, failedStep: 'picks' });
    expect(screen.queryByTestId('build-note')).toBeNull();
  });
});

describe('the backdrop', () => {
  it('is built from the club’s own two colours', () => {
    const backdrop = stadiumBackdrop('#41230A', '#F26A21');
    expect(backdrop).toContain('65, 35, 10');
    expect(backdrop).toContain('242, 106, 33');
    // A grid over the floodlights, not instead of them.
    expect(backdrop).toContain('repeating-linear-gradient');
  });
});
