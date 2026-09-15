// Create GM: what the screen shows, and what it refuses.
//
// Two rules carry most of this file. The preview may only state facts -- what
// you typed, and what is true of a manager who has not worked a day -- so a
// blank form must not print a name, and an unchosen file must not print File 1.
// And a form that will not go on has to say which field is holding it up: a
// dead button and no explanation is the screen keeping a secret.

import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GmForm } from '../src/screens/gmForm';
import { GmPreview, initialsOf } from '../src/screens/gmPreview';
import { DEFAULT_GM_STYLE, GM_STYLES, gmStyleLabel } from '../src/screens/gmStyles';
import { GM_STYLES as SERVER_STYLES } from '../supabase/functions/_shared/api/gmStyles';

/** The form with everything wired to spies, for the questions about behaviour
 *  rather than about a particular name. */
function mount(over: Partial<Parameters<typeof GmForm>[0]> = {}) {
  const onContinue = vi.fn();
  const onFirst = vi.fn();
  const onLast = vi.fn();
  const onStyle = vi.fn();
  render(
    <GmForm
      slot={1}
      first=""
      last=""
      style={DEFAULT_GM_STYLE}
      onFirst={onFirst}
      onLast={onLast}
      onStyle={onStyle}
      onContinue={onContinue}
      {...over}
    />,
  );
  return { onContinue, onFirst, onLast, onStyle };
}

describe('the two catalogues of GM styles', () => {
  it('name the same five keys on both sides of the wire', () => {
    // The client's list is copy and the server's is a validator. They are
    // separate files on purpose, so this is the thing that stops them drifting:
    // a key added to one and not the other is refused at create-save, which is
    // the worst possible place to find out.
    expect(GM_STYLES.map((s) => s.key)).toEqual([...SERVER_STYLES]);
  });

  it('reads back a stored key as its label, and an unknown one as nothing', () => {
    expect(gmStyleLabel('NEGOTIATOR')).toBe('Negotiator');
    expect(gmStyleLabel(null)).toBeNull();
    // A save written by a later build. Printing the raw key would put
    // GRIDIRON_SAGE on a screen; reporting nothing lets the caller say
    // "not recorded", which is the truth.
    expect(gmStyleLabel('GRIDIRON_SAGE')).toBeNull();
  });
});

describe('the GM preview', () => {
  it('says the name is not entered yet rather than showing an empty card', () => {
    render(<GmPreview first="" last="" style={DEFAULT_GM_STYLE} slot={1} />);
    expect(screen.getByText('GM Preview')).toBeTruthy();
    expect(screen.getByText('Name not entered yet')).toBeTruthy();
    // Nothing is claimed about a manager who does not exist yet.
    expect(screen.queryByText('General Manager')).toBeNull();
    expect(screen.queryByText('0-0')).toBeNull();
  });

  it('states the whole profile once there is a name', () => {
    render(<GmPreview first="Casey" last="Okonkwo" style="NEGOTIATOR" slot={2} />);
    expect(screen.getByText('Casey Okonkwo')).toBeTruthy();
    expect(screen.getByText('General Manager')).toBeTruthy();
    expect(screen.getByText('Unknown')).toBeTruthy();
    expect(screen.getByText('0-0')).toBeTruthy();
    expect(screen.getByText('Not started')).toBeTruthy();
    expect(screen.getByText('Negotiator')).toBeTruthy();
    expect(screen.getByText('File 2')).toBeTruthy();
  });

  it('reports an unchosen file rather than printing File 1', () => {
    render(<GmPreview first="Casey" last="Okonkwo" style={DEFAULT_GM_STYLE} slot={null} />);
    expect(screen.getByText('Not chosen')).toBeTruthy();
  });

  it('makes a monogram only when both names are there', () => {
    expect(initialsOf('Casey', 'Okonkwo')).toBe('CO');
    expect(initialsOf('casey', 'okonkwo')).toBe('CO');
    // Half a name is half an answer, and half a monogram would look like one.
    expect(initialsOf('Casey', '')).toBeNull();
    expect(initialsOf('   ', 'Okonkwo')).toBeNull();
  });
});

describe('going on from Create GM', () => {
  it('updates the preview from what is typed', () => {
    mount({ first: 'Casey', last: 'Okonkwo' });
    expect(screen.getByTestId('gm-preview').textContent).toContain('Casey Okonkwo');
  });

  it('holds the Continue button until both names are filled', () => {
    mount({ first: 'Casey' });
    expect(screen.getByTestId('gm-continue').hasAttribute('disabled')).toBe(true);

    cleanup();
    mount({ first: 'Casey', last: 'Okonkwo' });
    expect(screen.getByTestId('gm-continue').hasAttribute('disabled')).toBe(false);
  });

  it('names the field that is missing when the tap is refused', () => {
    mount({ first: 'Casey' });
    // Nothing is wrong until the player says they are done.
    expect(screen.queryByTestId('gm-last-error')).toBeNull();

    fireEvent.pointerDown(screen.getByTestId('gm-continue-blocked'));
    expect(screen.getByTestId('gm-last-error').textContent).toBe('Enter a last name.');
    // And only that field: the first name is filled in and is not the problem.
    expect(screen.queryByTestId('gm-first-error')).toBeNull();
  });

  it('complains about both fields when both are empty', () => {
    mount();
    fireEvent.pointerDown(screen.getByTestId('gm-continue-blocked'));
    expect(screen.getByTestId('gm-first-error').textContent).toBe('Enter a first name.');
    expect(screen.getByTestId('gm-last-error').textContent).toBe('Enter a last name.');
  });

  it('answers the keyboard the same way it answers the button', () => {
    // Submitting is how a form is finished on a phone, and it fires whether or
    // not the button below is takeable.
    const { onContinue } = mount({ first: 'Casey' });
    fireEvent.submit(screen.getByTestId('gm-first').closest('form') as HTMLFormElement);
    expect(onContinue).not.toHaveBeenCalled();
    expect(screen.getByTestId('gm-last-error')).toBeTruthy();
  });

  it('goes on once both names are there, and stops complaining', () => {
    const { onContinue } = mount({ first: 'Casey', last: 'Okonkwo' });
    fireEvent.click(screen.getByTestId('gm-continue'));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('gm-first-error')).toBeNull();
  });
});

describe('the GM style picker', () => {
  it('offers all five with a line of explanation each', () => {
    mount();
    for (const style of GM_STYLES) {
      expect(screen.getByTestId(`gm-style-${style.key.toLowerCase()}`), style.key).toBeTruthy();
      expect(screen.getByText(style.detail), style.detail).toBeTruthy();
    }
  });

  it('opens on the default with that one marked chosen', () => {
    mount();
    const architect = screen.getByTestId('gm-style-architect');
    expect(DEFAULT_GM_STYLE).toBe('ARCHITECT');
    expect(architect.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('gm-style-strategist').getAttribute('aria-checked')).toBe('false');
  });

  it('reports the choice rather than keeping it', () => {
    const { onStyle } = mount();
    fireEvent.click(screen.getByTestId('gm-style-negotiator'));
    expect(onStyle).toHaveBeenCalledWith('NEGOTIATOR');
  });

  it('says the simulation does not read it yet', () => {
    // The alternative is a player picking Negotiator and spending a season
    // wondering why nothing negotiates differently.
    mount();
    expect(screen.getByText(/No effect on the simulation yet/)).toBeTruthy();
  });
});
