// Where a club sits, and the three ways of saying it.
//
// These are pure functions over two columns, so the test is mostly about the
// thing that used to go wrong: a label built by cutting a conference out of a
// division string. Nothing here parses, so nothing here can mis-parse -- and
// the test that matters most is the one asserting a label never contains an
// id, because 'NC' is the id of the Frontier Conference and printing it would
// be the wrong two letters rather than merely an ugly pair.

import { describe, expect, it } from 'vitest';
import {
  LEAGUE_SHAPE, conferenceFull, divisionCompact, divisionFull, divisionShort,
  leagueShapeLine, type Placing,
} from '../supabase/functions/_shared/api/leaguePlacing';

const ATLAS: Placing = {
  conferenceId: 'AC', conferenceName: 'Atlas Conference',
  conferenceAbbr: 'AC', conferenceShort: 'Atlas',
  divisionId: 'AC-N', region: 'North', divisionName: 'Atlas Conference North',
};

// The one that catches a label built off the key: this conference's id is 'NC'
// and its abbreviation is 'FC'.
const FRONTIER: Placing = {
  conferenceId: 'NC', conferenceName: 'Frontier Conference',
  conferenceAbbr: 'FC', conferenceShort: 'Frontier',
  divisionId: 'NC-S', region: 'South', divisionName: 'Frontier Conference South',
};

describe('the three labels', () => {
  it('says the whole thing when there is room', () => {
    expect(divisionFull(ATLAS)).toBe('Atlas Conference North');
    expect(divisionFull(FRONTIER)).toBe('Frontier Conference South');
    expect(conferenceFull(FRONTIER)).toBe('Frontier Conference');
  });

  it('says it in two readable words when there is not', () => {
    expect(divisionShort(ATLAS)).toBe('Atlas North');
    expect(divisionShort(FRONTIER)).toBe('Frontier South');
  });

  it('abbreviates only when asked', () => {
    expect(divisionCompact(ATLAS)).toBe('AC North');
    expect(divisionCompact(FRONTIER)).toBe('FC South');
  });

  it('never prints a conference or division id', () => {
    // The id and the abbreviation agree for Atlas and disagree for Frontier,
    // which is exactly the case a label derived from the key gets wrong.
    for (const p of [ATLAS, FRONTIER]) {
      for (const label of [divisionFull(p), divisionShort(p), divisionCompact(p)]) {
        expect(label).not.toContain(p.divisionId);
      }
    }
    expect(divisionCompact(FRONTIER)).not.toContain('NC');
    expect(divisionCompact(FRONTIER)).toContain('FC');
  });

  it('drops a missing half rather than printing a stray separator', () => {
    // A club whose division row is missing is a fault to show plainly. The
    // old code would have produced " North" or "Atlas ", which reads as a
    // rendering bug rather than as missing data.
    const noRegion: Placing = { ...ATLAS, region: '', divisionName: '' };
    expect(divisionShort(noRegion)).toBe('Atlas');
    expect(divisionFull(noRegion)).toBe('Atlas Conference');
    const nothing: Placing = {
      ...ATLAS, conferenceName: '', conferenceShort: '', conferenceAbbr: '',
      region: '', divisionName: '',
    };
    expect(divisionShort(nothing)).toBe('');
    expect(divisionFull(nothing)).toBe('');
  });

  it('falls back to its parts when the stored full name is missing', () => {
    expect(divisionFull({ ...ATLAS, divisionName: '' })).toBe('Atlas Conference North');
  });
});

describe('the league\'s shape', () => {
  it('multiplies out', () => {
    // Stated once and checked here, so the sentence on a screen and the
    // arithmetic behind it cannot drift apart.
    const s = LEAGUE_SHAPE;
    expect(s.conferences * s.divisionsPerConference).toBe(s.divisions);
    expect(s.divisions * s.teamsPerDivision).toBe(s.teams);
    expect(s.teams).toBe(32);
    expect(s.regions).toHaveLength(s.divisionsPerConference);
  });

  it('says it the way a subtitle would', () => {
    expect(leagueShapeLine()).toBe('32 clubs · 2 conferences · 8 divisions of 4');
  });
});
