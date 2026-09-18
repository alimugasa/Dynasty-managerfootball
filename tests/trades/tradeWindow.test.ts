// The deadline.
//
// A date that is only a rule is a date nobody feels. These test both halves:
// that trading actually shuts, and that a manager can see it coming in time
// to do something about it.

import { describe, expect, it } from 'vitest';
import {
  deadlineNotice, deadlineUrgency, defaultDeadlineWeek, tradeWindow,
} from '../../supabase/functions/_shared/api/tradeWindow';

const WEEKS = 18;
const open = (week: number, deadline: number | null = null) =>
  tradeWindow('REGULAR_SEASON', week, WEEKS, deadline);

describe('when trading is open', () => {
  it('opens with the season and shuts after the deadline', () => {
    const deadline = defaultDeadlineWeek(WEEKS);
    expect(open(1).open).toBe(true);
    expect(open(deadline).open).toBe(true);
    expect(open(deadline + 1).open).toBe(false);
    expect(open(deadline + 1).closedBecause).toContain('deadline passed');
  });

  it('puts the deadline about two thirds of the way through, whatever the season\'s length', () => {
    for (const weeks of [14, 17, 18, 22]) {
      const d = defaultDeadlineWeek(weeks);
      expect(d).toBeGreaterThan(weeks * 0.5);
      expect(d).toBeLessThan(weeks * 0.75);
    }
  });

  it('honours a deadline the franchise set instead of the league default', () => {
    expect(open(9, 8).open).toBe(false);
    expect(open(8, 8).open).toBe(true);
    expect(open(8, 8).isDeadlineWeek).toBe(true);
  });

  it('is shut in every phase that is not the regular season', () => {
    for (const phase of ['PLAYOFFS', 'OFFSEASON', 'TRAINING_CAMP', 'PRESEASON', 'DRAFT']) {
      const w = tradeWindow(phase, 5, WEEKS, null);
      expect(w.open, phase).toBe(false);
      // And says which kind of shut it is: the postseason and the winter are
      // not the same answer, and the offseason has its own trade route.
      expect(w.closedBecause, phase).toBeTruthy();
    }
    expect(tradeWindow('PLAYOFFS', 20, WEEKS, null).closedBecause).toContain('postseason');
  });
});

describe('seeing it coming', () => {
  it('says nothing in September and gets louder as it closes', () => {
    const d = defaultDeadlineWeek(WEEKS);
    // A countdown that runs all season is wallpaper and stops being read long
    // before it starts mattering.
    expect(deadlineNotice(open(1))).toBeNull();
    expect(deadlineNotice(open(d - 3))).toContain('3 weeks');
    expect(deadlineNotice(open(d - 1))).toBe('Trade deadline: next week');
    expect(deadlineNotice(open(d))).toBe('Trade deadline: today');
  });

  it('keeps saying why once it has gone', () => {
    const d = defaultDeadlineWeek(WEEKS);
    expect(deadlineNotice(open(d + 2))).toContain('deadline passed');
  });

  it('rates the urgency so a screen can colour it', () => {
    const d = defaultDeadlineWeek(WEEKS);
    expect(deadlineUrgency(open(1))).toBe('none');
    expect(deadlineUrgency(open(d - 1))).toBe('soon');
    expect(deadlineUrgency(open(d))).toBe('now');
    expect(deadlineUrgency(open(d + 1))).toBe('shut');
  });
});
