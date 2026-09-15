// What the market screens promise, tested without a browser.
//
// Two claims worth a test. The first is that every destination the screens
// name exists -- three new cards went onto the Team tab, and a card that opens
// nothing is the exact failure the hub cards were built to avoid.
//
// The second is the one this feature can get quietly wrong: money and ratings
// that are not known must read as unknown. A dash and a zero look similar and
// mean opposite things -- "we have no figure for what he wants" against "he
// will play for nothing" -- and a manager acting on the second when the first
// is true has been misled by a screen, not by a model.

import { describe, expect, it } from 'vitest';
import { SCREENS } from '../../src/app/screens';
import { money, rating } from '../../src/screens/marketRows';

describe('where the market screens go', () => {
  it('has a screen behind every card the Team tab added', () => {
    for (const key of ['waivers', 'freeAgents', 'transactions']) {
      expect(SCREENS[key], key).toBeDefined();
      expect(SCREENS[key]?.Component, key).toBeTypeOf('function');
    }
  });

  it('opens them on top of a tab rather than as tabs of their own', () => {
    // Pushed, not rooted: Back from the wire belongs on Team, which is where
    // it was opened from.
    for (const key of ['waivers', 'freeAgents', 'transactions']) {
      expect(SCREENS[key]?.root, key).toBe(false);
      expect(SCREENS[key]?.boot, key).toBeUndefined();
    }
  });

  it('names them the way the cards do', () => {
    expect(SCREENS['waivers']?.title).toBe('Waiver Wire');
    expect(SCREENS['freeAgents']?.title).toBe('Free Agents');
    expect(SCREENS['transactions']?.title).toBe('Transactions');
  });
});

describe('money a manager reads', () => {
  it('draws a figure nobody has as a dash, never as nothing', () => {
    expect(money(null)).toBe('—');
    // And zero, which is a real figure, still reads as one.
    expect(money(0)).toBe('$0');
  });

  it('says millions in millions and thousands in thousands', () => {
    expect(money(4_200_000)).toBe('$4.2M');
    expect(money(1_000_000)).toBe('$1.0M');
    expect(money(850_000)).toBe('$850K');
    expect(money(1_500)).toBe('$2K');
  });

  it('keeps the sign on a negative, because a club can be over the cap', () => {
    // Seven of the thirty-two are, in a typical season. A screen that dropped
    // the minus would tell a club it had ten million to spend that it does not
    // have, which is the most expensive lie this component could tell.
    expect(money(-10_308_576)).toBe('-$10.3M');
    expect(money(-850_000)).toBe('-$850K');
  });

  it('draws an unscouted rating as a dash', () => {
    expect(rating(null)).toBe('—');
    expect(rating(0)).toBe('0');
    expect(rating(78)).toBe('78');
  });
});
