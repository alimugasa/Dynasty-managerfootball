// The client's copy of the phase list, held against the server's.
//
// The client cannot import the server's list -- that module reaches Postgres --
// so it keeps its own, and this is what stops the two drifting. They already
// drifted once: AWARDS and RECAP were added to the season, and a literal array
// inside the Team screen did not hear about it, so a save reopened in either
// phase offered to simulate a week of a season that was over.

import { describe, expect, it } from 'vitest';
import { OFFSEASON_PHASES, PHASE_LABEL, isOffseasonPhase } from '../src/domain/phase';
import {
  OFFSEASON_PHASES as SERVER_PHASES,
} from '../supabase/functions/_shared/api/phases';

describe('the offseason phases', () => {
  it('are the same list the server works from', () => {
    expect([...OFFSEASON_PHASES]).toEqual([...SERVER_PHASES]);
  });

  it('recognise every one of them, and nothing else', () => {
    for (const phase of SERVER_PHASES) expect(isOffseasonPhase(phase)).toBe(true);
    for (const phase of ['PRESEASON', 'REGULAR_SEASON', 'PLAYOFFS']) {
      expect(isOffseasonPhase(phase)).toBe(false);
    }
    expect(isOffseasonPhase('NOT_A_PHASE')).toBe(false);
  });

  it('include the two a season now ends on', () => {
    // The regression this file exists for.
    expect(isOffseasonPhase('AWARDS')).toBe(true);
    expect(isOffseasonPhase('RECAP')).toBe(true);
  });

  it('name every phase a save can sit in, including the ones being played', () => {
    for (const phase of [...SERVER_PHASES, 'PRESEASON', 'REGULAR_SEASON', 'PLAYOFFS']) {
      expect(PHASE_LABEL[phase], phase).toBeTruthy();
    }
  });
});
