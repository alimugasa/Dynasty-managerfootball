// The rules a franchise is played under, and what the server will accept.
//
// The settings are the first thing in this product the client sends as a
// document rather than a scalar, so the tests are mostly about refusal: a
// partial document, an unknown value and an unknown key each mean something
// has drifted, and storing any of them would hide the drift behind a save that
// looks fine until somebody notices a setting is gone.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DIFFICULTY, DEFAULT_SETTINGS, DIFFICULTIES, FRANCHISE_OPTIONS, PRESETS,
  SETTING_KEYS, difficultyOf, matchesPreset, parseSettings,
} from '../supabase/functions/_shared/api/franchiseOptions';
import { DIFFICULTY_CARDS, SETTINGS, optionLabel } from '../src/screens/settingsCatalogue';

describe('the two catalogues', () => {
  it('name the same eight settings on both sides of the wire', () => {
    // The client's list is copy and the server's is a validator. A setting
    // added to one and not the other is refused at create-save, which is the
    // worst possible place to find out.
    expect(SETTINGS.map((s) => s.key)).toEqual([...SETTING_KEYS]);
  });

  it('offer the same values, in the same order, for every setting', () => {
    for (const def of SETTINGS) {
      expect(def.options.map((o) => o.value), def.key)
        .toEqual([...FRANCHISE_OPTIONS[def.key]]);
    }
  });

  it('name the four difficulties', () => {
    expect(DIFFICULTY_CARDS.map((d) => d.key)).toEqual([...DIFFICULTIES]);
  });

  it('gives every option a label, and says nothing about one it cannot name', () => {
    for (const def of SETTINGS) {
      for (const option of def.options) {
        expect(optionLabel(def.key, option.value), `${def.key}/${option.value}`)
          .toBe(option.label);
      }
    }
    // A save written by a later build. Printing the raw key would put
    // CATASTROPHIC on a screen; reporting nothing lets the caller say so.
    expect(optionLabel('injuryFrequency', 'CATASTROPHIC')).toBeNull();
  });
});

describe('the three presets', () => {
  it('set every one of the eight, so a preset is a whole statement', () => {
    for (const preset of ['EASY', 'NORMAL', 'HARD'] as const) {
      for (const key of SETTING_KEYS) {
        expect(PRESETS[preset][key], `${preset}.${key}`).toBeDefined();
      }
    }
  });

  it('differ from one another, so no set of rows matches two of them', () => {
    // difficultyOf checks in order and returns the first match. If two presets
    // were identical it would name one of them arbitrarily, and a player who
    // chose Hard would be told they were on Easy.
    expect(matchesPreset(PRESETS.EASY, 'NORMAL')).toBe(false);
    expect(matchesPreset(PRESETS.HARD, 'NORMAL')).toBe(false);
    expect(matchesPreset(PRESETS.EASY, 'HARD')).toBe(false);
  });

  it('leave the editing tools off, whichever one is chosen', () => {
    // Commissioner mode is not a difficulty. Nothing but the player asks for it.
    for (const preset of ['EASY', 'NORMAL', 'HARD'] as const) {
      expect(PRESETS[preset].commissionerMode, preset).toBe('OFF');
    }
  });

  it('opens on Normal', () => {
    expect(DEFAULT_DIFFICULTY).toBe('NORMAL');
    expect(DEFAULT_SETTINGS).toEqual(PRESETS.NORMAL);
  });
});

describe('naming a set of rows', () => {
  it('calls rows that match a preset by that preset', () => {
    expect(difficultyOf(PRESETS.EASY)).toBe('EASY');
    expect(difficultyOf(PRESETS.NORMAL)).toBe('NORMAL');
    expect(difficultyOf(PRESETS.HARD)).toBe('HARD');
  });

  it('calls anything else Custom', () => {
    expect(difficultyOf({ ...PRESETS.NORMAL, injuryFrequency: 'HIGH' })).toBe('CUSTOM');
    // Including Normal with the editing tools on: that is not the intended
    // balanced experience any more.
    expect(difficultyOf({ ...PRESETS.NORMAL, commissionerMode: 'ON' })).toBe('CUSTOM');
  });
});

describe('reading settings off the wire', () => {
  it('accepts a complete document', () => {
    expect(parseSettings({ ...PRESETS.HARD })).toEqual(PRESETS.HARD);
  });

  it('treats absent settings as absent rather than as the default', () => {
    expect(parseSettings(undefined)).toBeUndefined();
    expect(parseSettings(null)).toBeUndefined();
  });

  it('refuses a document missing a setting rather than filling it in', () => {
    // Five of eight is a save nobody can say was played on Hard, and filling
    // the other three from a default writes values indistinguishable from ones
    // the player chose.
    const partial: Record<string, string> = { ...PRESETS.NORMAL };
    delete partial['injuryFrequency'];
    expect(() => parseSettings(partial)).toThrow(/injuryFrequency/);
  });

  it('refuses a value it does not know', () => {
    expect(() => parseSettings({ ...PRESETS.NORMAL, injuryFrequency: 'CATASTROPHIC' }))
      .toThrow(/CATASTROPHIC/);
  });

  it('refuses an unknown key rather than dropping it', () => {
    // An unknown key means the catalogues have drifted. Discarding it hides
    // that behind a save that looks fine until a setting turns out to be gone.
    expect(() => parseSettings({ ...PRESETS.NORMAL, weatherSeverity: 'HIGH' }))
      .toThrow(/weatherSeverity/);
  });

  it('refuses anything that is not an object', () => {
    expect(() => parseSettings('NORMAL')).toThrow(/object/);
    expect(() => parseSettings([PRESETS.NORMAL])).toThrow(/object/);
  });
});
