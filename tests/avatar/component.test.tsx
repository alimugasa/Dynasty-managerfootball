// The component, in a DOM.
//
// The cases worth a render rather than a unit test are the failure ones: this
// is the layer that has to keep a broken face off the screen, and every path
// through it that matters ends in the initials fallback.
//
// jsdom has no IntersectionObserver, which is the case the component treats as
// "draw immediately" -- so these render eagerly without anybody asking, and
// that is itself one of the things being checked.

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AvatarFallback, PlayerAvatar, initials } from '../../src/avatar/PlayerAvatar';
import { PlayerFace } from '../../src/avatar/PlayerFace';
import { cachedProfile, avatarCacheSize, clearAvatarCache } from '../../src/avatar/cache';
import type { AvatarFacts, AvatarMap } from '../../src/hooks/useAvatars';

const SEED = 'a1b2c3d4e5f60718a1b2c3d4e5f60718';

describe('PlayerAvatar', () => {
  it('renders the player under his own name when it has a seed', () => {
    // The shipped renderer paints to a canvas, and jsdom has none -- so here
    // it correctly returns null and the fallback takes over. That is the
    // contract being checked: whatever the renderer does, the row ends up
    // carrying this player's name and never a hole. The portraits themselves
    // are checked by looking at them in the lab.
    render(<PlayerAvatar seed={SEED} name="Marcus Okonkwo" position="WR" age={26} />);
    expect(screen.getByLabelText('Marcus Okonkwo')).toBeTruthy();
  });

  it('falls back to initials where the renderer cannot draw', () => {
    // No 2D context is a supported answer, not a failure to handle: a browser
    // that refuses one, and every component test in this suite, get initials.
    render(<PlayerAvatar seed={SEED} name="Marcus Okonkwo" position="WR" age={26} />);
    expect(screen.getByText('MO')).toBeTruthy();
  });

  it('falls back to initials when the row has no seed', () => {
    // Not a hypothetical: a seed is null on any row this build has not
    // backfilled, and the request is explicit that the UI never shows a broken
    // image.
    render(<PlayerAvatar seed={null} name="Dele Fonseca" position="CB" age={24} />);
    expect(screen.getByText('DF')).toBeTruthy();
  });

  it('falls back to a silhouette when there is no name either', () => {
    const { container } = render(<AvatarFallback name="" />);
    expect(container.querySelector('svg')).not.toBeNull();
    expect(screen.getByLabelText('Player')).toBeTruthy();
  });

  it('renders the same markup for the same player twice', () => {
    const one = render(<PlayerAvatar seed={SEED} name="A B" position="QB" age={30} />);
    const first = one.container.innerHTML;
    one.unmount();
    const two = render(<PlayerAvatar seed={SEED} name="A B" position="QB" age={30} />);
    expect(two.container.innerHTML).toBe(first);
  });
});

describe('PlayerFace', () => {
  const map = (facts: AvatarFacts): AvatarMap => ({ get: () => facts, loading: false });

  it('renders the player it was handed facts for', () => {
    render(
      <PlayerFace
        avatars={map({ seed: SEED, position: 'LB', age: 27, heritage: null })}
        playerId="P1"
        name="Tobias Vance"
      />,
    );
    expect(screen.getByLabelText('Tobias Vance')).toBeTruthy();
  });

  it('falls back while the lookup is still empty', () => {
    // The face read is a second call, so a list renders before it lands. That
    // window shows initials rather than a hole.
    render(
      <PlayerFace
        avatars={{ get: () => null, loading: true }}
        playerId="P1"
        name="Tobias Vance"
      />,
    );
    expect(screen.getByText('TV')).toBeTruthy();
  });
});

describe('the profile cache', () => {
  it('generates a player once and hands back the same object', () => {
    clearAvatarCache();
    const a = cachedProfile(SEED, 'TE', 25, null);
    const b = cachedProfile(SEED, 'TE', 25, null);
    expect(b).toBe(a);
    expect(avatarCacheSize()).toBe(1);
  });

  it('redraws when something that changes the person changes', () => {
    clearAvatarCache();
    const young = cachedProfile(SEED, 'TE', 25, null);
    const older = cachedProfile(SEED, 'TE', 33, null);
    expect(older).not.toBe(young);
    // Same man, older: the identity half is untouched.
    expect(older.identity).toEqual(young.identity);
  });

  it('never caches an edited face', () => {
    clearAvatarCache();
    const edited = cachedProfile(SEED, 'TE', 25, null, { appearance: { hairstyle: 'bald' } });
    expect(edited.appearance.hairstyle).toBe('bald');
    expect(avatarCacheSize()).toBe(0);
  });
});

describe('initials', () => {
  it('takes the first and the last, and invents nothing', () => {
    expect(initials('Marcus Okonkwo')).toBe('MO');
    expect(initials('Dre')).toBe('D');
    expect(initials('')).toBe('');
  });
});
