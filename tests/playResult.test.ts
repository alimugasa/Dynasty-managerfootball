// What the result modal calls the game that was just played.
//
// The label is the one thing a bare score does not say: beating a club rated
// three points better than yours is an upset at any margin, and losing to one
// three points worse is a defeat worth a different word. Every branch reads
// two numbers the save holds and nothing else.

import { describe, expect, it } from 'vitest';
import { resultLabel, warningsFor } from '../src/screens/playResult';
import type { DashboardOut } from '../supabase/functions/_shared/api/reads/dashboard';

describe('what kind of result it was', () => {
  it('calls a win over a better club an upset, at any margin', () => {
    expect(resultLabel(20, 17, 74, 84)).toBe('Upset win');
    expect(resultLabel(45, 3, 74, 84)).toBe('Upset win');
  });

  it('calls a defeat by a better club an upset the other way', () => {
    expect(resultLabel(17, 20, 84, 74)).toBe('Upset defeat');
  });

  it('reads the margin when the clubs are level', () => {
    expect(resultLabel(38, 10, 78, 78)).toBe('Comfortable win');
    expect(resultLabel(24, 21, 78, 78)).toBe('Won it late');
    expect(resultLabel(27, 20, 78, 78)).toBe('Win');
    expect(resultLabel(10, 38, 78, 78)).toBe('Heavy defeat');
    expect(resultLabel(21, 24, 78, 78)).toBe('Lost a close one');
    expect(resultLabel(20, 27, 78, 78)).toBe('Defeat');
  });

  it('names a tie a tie, whoever was favoured', () => {
    expect(resultLabel(17, 17, 88, 60)).toBe('Tied');
  });

  it('falls back to the margin when a club was not rated', () => {
    // An unrated club cannot make a result an upset, because nobody knows
    // which way the upset would have run.
    expect(resultLabel(24, 21, null, 84)).toBe('Won it late');
    expect(resultLabel(24, 21, 84, null)).toBe('Won it late');
  });
});

const dash = (over: Partial<DashboardOut>): DashboardOut => ({
  shape: { rosterCount: 53, depthGroups: 13, depthStarters: 13, positionGroups: 13, fixtures: 272, played: 0 },
  injuredStarters: 0,
  ...over,
} as DashboardOut);

describe('what stops a manager before a sim', () => {
  it('says nothing when the roster is in order', () => {
    // A dialog every week is a dialog nobody reads by October.
    expect(warningsFor(dash({}))).toEqual([]);
  });

  it('warns about a group with nobody named first', () => {
    const out = warningsFor(dash({
      shape: { rosterCount: 53, depthGroups: 13, depthStarters: 11, positionGroups: 13, fixtures: 272, played: 0 },
    }));
    expect(out).toHaveLength(1);
    expect(out[0]?.text).toContain('2 position groups have');
  });

  it('warns about starters who are out, and counts one of them singularly', () => {
    expect(warningsFor(dash({ injuredStarters: 1 }))[0]?.text).toContain('1 starter is out');
    expect(warningsFor(dash({ injuredStarters: 3 }))[0]?.text).toContain('3 starters are out');
  });

  it('raises both when both are true', () => {
    const out = warningsFor(dash({
      shape: { rosterCount: 53, depthGroups: 13, depthStarters: 12, positionGroups: 13, fixtures: 272, played: 0 },
      injuredStarters: 2,
    }));
    expect(out.map((w) => w.key)).toEqual(['depth', 'injured']);
  });
});
