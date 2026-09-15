// The franchise being set up, before there is a franchise.
//
// The draft exists so that two screens can gather one set of answers, so what
// is worth pinning is where it survives and where it must not: walking back
// into the file you were filling keeps what you typed, picking a different
// file does not inherit it, and nothing is kept once the dynasty is made.

import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { FranchiseSetupProvider, useFranchiseSetup } from '../src/app/FranchiseSetup';
import { DEFAULT_GM_STYLE } from '../src/screens/gmStyles';

/** The whole api, exposed to the test the way a screen would use it. */
let api: ReturnType<typeof useFranchiseSetup>;

function Probe() {
  api = useFranchiseSetup();
  const { draft } = api;
  return (
    <p data-testid="draft">
      {draft === null
        ? 'none'
        : `${String(draft.slot)}|${draft.firstName}|${draft.lastName}|${draft.style}`}
    </p>
  );
}

const setup = () => render(<FranchiseSetupProvider><Probe /></FranchiseSetupProvider>);
const shown = (): string => screen.getByTestId('draft').textContent ?? '';

describe('the in-progress franchise', () => {
  it('holds nothing until a file is picked', () => {
    setup();
    expect(shown()).toBe('none');
  });

  it('opens a draft on the default style, so there is something to change', () => {
    setup();
    act(() => { api.begin(2); });
    expect(shown()).toBe(`2|||${DEFAULT_GM_STYLE}`);
  });

  it('keeps what was typed when the same file is opened again', () => {
    // Which is what makes Back out of the team list and into Create GM show
    // the name you entered rather than an empty form.
    setup();
    act(() => { api.begin(1); });
    act(() => { api.record({ firstName: 'Casey', lastName: 'Okonkwo' }); });
    act(() => { api.begin(1); });
    expect(shown()).toBe(`1|Casey|Okonkwo|${DEFAULT_GM_STYLE}`);
  });

  it('starts clean when a different file is picked', () => {
    // A name typed into file 1 and abandoned must not turn up in file 3.
    setup();
    act(() => { api.begin(1); });
    act(() => { api.record({ firstName: 'Casey', lastName: 'Okonkwo' }); });
    act(() => { api.begin(3); });
    expect(shown()).toBe(`3|||${DEFAULT_GM_STYLE}`);
  });

  it('drops an answer recorded against no draft at all', () => {
    // A screen recording outside the flow has no file to hang the answer on,
    // and inventing one would put the dynasty somewhere nobody chose.
    setup();
    act(() => { api.record({ firstName: 'Casey' }); });
    expect(shown()).toBe('none');
  });

  it('keeps nothing once the draft is cleared', () => {
    setup();
    act(() => { api.begin(1); });
    act(() => { api.record({ style: 'STRATEGIST' }); });
    expect(shown()).toBe('1|||STRATEGIST');
    act(() => { api.clear(); });
    expect(shown()).toBe('none');
  });

  it('refuses to work outside its provider rather than quietly doing nothing', () => {
    // A screen rendered outside the flow would otherwise collect answers into
    // a void and continue to the next question as if it had them.
    expect(() => render(<Probe />)).toThrow(/FranchiseSetupProvider/);
  });
});
