// The words a scouting report puts on a set of numbers.
//
// Two rules run through every test here. A phrase is only worth reading if it
// could not have been printed over a club nobody measured, so every derivation
// returns null when its input is missing. And the bands are absolute rather
// than ranked: a rating of 86 is elite whether or not six clubs are better,
// because a manager knows what 86 means and re-ranking it against this
// particular league would make the same roster read differently in a weaker one.

import { describe, expect, it } from 'vitest';
import {
  draftLabel, draftScore, fanPressure, franchiseStatus, ownerMood,
  quarterbackSituation, ratingBand, rosterTimeline, suggestedMove, type Outlook,
} from '../supabase/functions/_shared/api/reads/teamOutlook';

const outlook = (over: Partial<Outlook> = {}): Outlook => ({
  offense: 78, defense: 78, overall: 78, averageAge: 25.5,
  capSpace: 18_000_000, draft: 50, quarterback: 'Bridge QB',
  weakest: 'Backfield', weakestBehind: -1, ...over,
});

describe('rating bands', () => {
  it('band a rating against the position, not against the league', () => {
    expect(ratingBand(92)).toBe('elite');
    expect(ratingBand(85)).toBe('elite');
    expect(ratingBand(82)).toBe('strong');
    expect(ratingBand(74)).toBe('solid');
    expect(ratingBand(64)).toBe('developing');
    expect(ratingBand(55)).toBe('weak');
    expect(ratingBand(null)).toBeNull();
  });
});

describe('the quarterback, in six words', () => {
  it('calls an elite passer a franchise quarterback at any age', () => {
    expect(quarterbackSituation(92, 24, 70)).toBe('Franchise QB');
    expect(quarterbackSituation(88, 35, 70)).toBe('Franchise QB');
  });

  it('separates the young from the old from the merely adequate', () => {
    expect(quarterbackSituation(70, 23, 60)).toBe('Rookie Project');
    expect(quarterbackSituation(78, 34, 60)).toBe('Veteran Stopgap');
    expect(quarterbackSituation(78, 27, 60)).toBe('Bridge QB');
  });

  it('calls it an open competition when nobody has separated', () => {
    // Two passers a point apart is a competition whoever wins it, and the gap
    // is the only thing in the data that can say so.
    expect(quarterbackSituation(74, 27, 72)).toBe('Open Competition');
    expect(quarterbackSituation(74, 27, 64)).toBe('Bridge QB');
  });

  it('says there is no answer when there is no answer', () => {
    expect(quarterbackSituation(58, 27, 50)).toBe('No Answer');
  });

  it('says nothing about a club with no quarterback on the books', () => {
    expect(quarterbackSituation(null, 27, 60)).toBeNull();
  });
});

describe('the crowd and the owner', () => {
  it('reads fan pressure off the only thing the world knows about a market', () => {
    expect(fanPressure(10)).toBe('Relentless');
    expect(fanPressure(7)).toBe('Demanding');
    expect(fanPressure(5)).toBe('Engaged');
    expect(fanPressure(3)).toBe('Patient');
    expect(fanPressure(1)).toBe('Forgiving');
    expect(fanPressure(null)).toBeNull();
  });

  it('turns an owner patience score into what it means for the job', () => {
    expect(ownerMood(90)).toBe('Patient');
    expect(ownerMood(50)).toBe('Even-handed');
    expect(ownerMood(30)).toBe('Restless');
    expect(ownerMood(8)).toBe('Win now or else');
    expect(ownerMood(null)).toBeNull();
  });
});

describe('draft capital', () => {
  it('scores the standard allotment at fifty', () => {
    // Two drafts of seven rounds, none traded. The number is "how far from
    // standard", not "how far from the best club in this particular league".
    const standard = 2 * (100 + 60 + 36 + 22 + 13 + 8 + 5);
    expect(draftScore(standard)).toBe(50);
    expect(draftLabel(draftScore(standard))).toBe('Standard');
  });

  it('names a club that has traded picks away and one that has hoarded them', () => {
    expect(draftLabel(draftScore(150))).toBe('Mortgaged');
    expect(draftLabel(draftScore(900))).toBe('Loaded');
  });

  it('caps at a hundred rather than running off the scale', () => {
    expect(draftScore(100_000)).toBe(100);
  });

  it('says nothing about a club whose picks did not load', () => {
    expect(draftScore(null)).toBeNull();
    expect(draftLabel(null)).toBeNull();
  });
});

describe('how long before this roster wins', () => {
  it('reads strength for the horizon and age for the direction', () => {
    expect(rosterTimeline(outlook({ overall: 85, averageAge: 26.2 }))).toBe('Closing window');
    expect(rosterTimeline(outlook({ overall: 85, averageAge: 25.0 }))).toBe('Win now');
    expect(rosterTimeline(outlook({ overall: 79, averageAge: 25.0 }))).toBe('Rising');
    expect(rosterTimeline(outlook({ overall: 79, averageAge: 25.9 }))).toBe('Contending soon');
    expect(rosterTimeline(outlook({ overall: 75, averageAge: 25.0 }))).toBe('Two years out');
    expect(rosterTimeline(outlook({ overall: 70, averageAge: 26.2 }))).toBe('Long rebuild');
  });

  it('says nothing about an unmeasured roster', () => {
    expect(rosterTimeline(outlook({ overall: null }))).toBeNull();
    expect(franchiseStatus(outlook({ overall: null }), 'Rebuild')).toBeNull();
    expect(franchiseStatus(outlook(), null)).toBeNull();
  });

  it('puts the status together from the band and the horizon', () => {
    expect(franchiseStatus(outlook({ overall: 85, averageAge: 25.0 }), 'Dynasty Ready'))
      .toBe('Dynasty Ready · Win now');
  });
});

describe('the first move', () => {
  it('puts money before football when the club is over the cap', () => {
    // A club over the cap cannot do anything else until it is not.
    expect(suggestedMove(outlook({ capSpace: -1, quarterback: 'No Answer' })))
      .toBe('Clear cap space before anything else.');
  });

  it('sends a club with no quarterback to find one', () => {
    expect(suggestedMove(outlook({ quarterback: 'No Answer' })))
      .toBe('Find a long-term quarterback.');
    expect(suggestedMove(outlook({ quarterback: 'Open Competition' })))
      .toBe('Find a long-term quarterback.');
  });

  it('tells a good old team to win now', () => {
    expect(suggestedMove(outlook({ overall: 84, averageAge: 26.0 })))
      .toBe('Win now, before the veteran core ages out.');
  });

  it('names the room, when the room is really behind the league', () => {
    expect(suggestedMove(outlook({ weakest: 'Offensive line', weakestBehind: -4.2 })))
      .toBe('Review offensive line depth.');
    // One point is noise in how the seed was generated, not a hole.
    expect(suggestedMove(outlook({ weakest: 'Offensive line', weakestBehind: -1 })))
      .not.toContain('offensive line');
  });

  it('judges the hole on the measurement rather than on the overall rating', () => {
    // A strong club can still be five points light at one position, and an
    // earlier cut that gated this on overall said nothing to half the league.
    expect(suggestedMove(outlook({ overall: 86, weakest: 'Secondary', weakestBehind: -5 })))
      .toBe('Review secondary depth.');
  });

  it('says nothing at all about a club it could not measure', () => {
    expect(suggestedMove(outlook({ overall: null }))).toBeNull();
  });
});
