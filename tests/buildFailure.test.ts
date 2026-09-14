// A failed build step, from where it is thrown to where it is read.
//
// The world screen can only name the step that failed if the name survives
// three hops: the handler wrapping the phase, the dispatcher turning it into an
// HTTP failure, and the client turning that back into an error. Each hop is a
// place the name could quietly be dropped, leaving the card saying "the
// franchise was not created" over a failure it could have been specific about.

import { describe, expect, it } from 'vitest';
import { BUILD_STEPS, BuildStepError, runStep, step } from '../supabase/functions/_shared/api/buildSteps';
import { ApiError } from '../supabase/functions/_shared/api/context';
import { ApiRequestError } from '../src/data/client';

describe('a step that fails', () => {
  it('names itself, and says which one in its message', async () => {
    const thrown = await runStep('schedule', () => Promise.reject(new Error('deadlock')))
      .catch((e: unknown) => e as BuildStepError);
    expect(thrown).toBeInstanceOf(BuildStepError);
    expect(thrown.step).toBe('schedule');
    expect(thrown.stepLabel).toBe('Generating schedule');
    expect(thrown.message).toContain('Generating schedule failed');
    // The cause is kept: "deadlock" is the thing an engineer needs.
    expect(thrown.message).toContain('deadlock');
  });

  it('keeps the innermost name when steps are nested', async () => {
    // The outer step is where we were; the inner one is what actually broke,
    // and that is the useful half.
    const thrown = await runStep('office', () => runStep('depth', () => Promise.reject(new Error('x'))))
      .catch((e: unknown) => e as BuildStepError);
    expect(thrown.step).toBe('depth');
  });

  it('passes a success straight through', async () => {
    expect(await runStep('teams', () => Promise.resolve(32))).toBe(32);
  });
});

describe('the name crossing the wire', () => {
  it('survives the dispatcher', () => {
    // What dispatch() does with a BuildStepError: a 500 that still knows which
    // step it was in.
    const built = new BuildStepError('players', new Error('out of memory'));
    const api = new ApiError(500, 'build_failed', built.message, built.step);
    expect(api.step).toBe('players');
    expect(api.status).toBe(500);
  });

  it('survives the client', () => {
    const failure = new ApiRequestError(500, 'build_failed', 'Generating players failed', 'players');
    expect(failure.step).toBe('players');
  });

  it('is absent on a failure that was never a step', () => {
    // A taken slot is refused before the build begins. The card says the
    // franchise was not created rather than pointing at an innocent step.
    const refused = new ApiRequestError(400, 'bad_request', 'save file 1 is already in use');
    expect(refused.step).toBeUndefined();
  });
});

describe('the step list itself', () => {
  it('names every step the screen renders', () => {
    expect(BUILD_STEPS.map((s) => s.key)).toEqual([
      'league', 'teams', 'players', 'rosters', 'contracts',
      'depth', 'schedule', 'picks', 'news', 'office',
    ]);
  });

  it('labels a reported step from that one list, so the two cannot drift', () => {
    expect(step('picks', 448, 'picks').label).toBe('Setting draft picks');
    expect(step('news', null, null)).toEqual({
      key: 'news', label: 'Preparing news feed', count: null, unit: null,
    });
  });
});
