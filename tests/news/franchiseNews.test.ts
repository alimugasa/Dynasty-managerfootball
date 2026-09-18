// The front office's own stories, as sentences.
//
// These are pure functions over facts, so the tests are about what they say --
// and specifically about what they say when a fact is missing, which is where
// a generator is tempted to invent one. A save with no GM name must not get a
// made-up GM, and a league with no schedule must not get a preview of a game
// nobody has scheduled.

import { describe, expect, it } from 'vitest';
import {
  openingStories, recordText, resultStory, type ClubName, type OpeningFacts,
} from '../../supabase/functions/_shared/api/franchiseNews';

const CLUB: ClubName = { teamId: 'SEA', metro: 'Seattle', nickname: 'Evergreens' };
const OPPONENT: ClubName = { teamId: 'SF', metro: 'San Francisco', nickname: 'Prospectors' };

const facts = (over: Partial<OpeningFacts> = {}): OpeningFacts => ({
  season: 2026,
  club: CLUB,
  gmName: 'Dahlia Okonkwo',
  ownerName: 'Absalom Calloway',
  ownerTenure: 9,
  mandate: 'MAKE_PLAYOFFS',
  rosterCount: 53,
  campInjuries: 4,
  opener: { gameId: 'g1', opponent: OPPONENT, home: false, neutral: false },
  ...over,
});

describe('the four opening stories', () => {
  it('writes exactly four, oldest first, all about the club', () => {
    const out = openingStories(facts());
    expect(out).toHaveLength(4);
    expect(out.map((s) => s.category)).toEqual(['FRANCHISE', 'OWNER', 'CAMP', 'MATCHUP']);
    expect(out.every((s) => s.teamId === 'SEA')).toBe(true);
    expect(out.every((s) => s.week === 1)).toBe(true);
  });

  it('names the GM and the club in the appointment', () => {
    const [appointment] = openingStories(facts());
    expect(appointment?.headline).toBe('Dahlia Okonkwo takes over the Evergreens');
    expect(appointment?.body).toContain('Seattle Evergreens');
    expect(appointment?.body).toContain('Absalom Calloway');
    expect(appointment?.body).toContain('9 years');
  });

  it('does not invent a GM for a save that has none', () => {
    const [appointment] = openingStories(facts({ gmName: null }));
    expect(appointment?.headline).toContain('without a named GM');
    expect(appointment?.body).toContain('created without one');
    // And nothing that reads like a name.
    expect(appointment?.body).not.toMatch(/takes over/);
  });

  it('drops the tenure clause rather than claiming a first year', () => {
    const [appointment] = openingStories(facts({ ownerTenure: null }));
    expect(appointment?.body).toContain('Absalom Calloway.');
    expect(appointment?.body).not.toContain('year');
  });

  it('says what the owner wants, and that nothing follows from it', () => {
    const [, owner] = openingStories(facts());
    expect(owner?.headline).toContain('Absalom Calloway');
    expect(owner?.body).toContain('the playoffs in year one');
    // The dashboard's Owner Goal card says the same thing; a story that let a
    // player believe the owner acts on this would be the lie.
    expect(owner?.body).toContain('No consequence has been attached');
  });

  it('reports a club with no owner rather than inventing an expectation', () => {
    const [, owner] = openingStories(facts({ mandate: null, ownerName: null }));
    expect(owner?.headline).toContain('No first-season target');
    expect(owner?.body).toContain('no owner on record');
  });

  it('counts the roster into camp, and says when nobody is hurt', () => {
    const [, , camp] = openingStories(facts());
    expect(camp?.headline).toBe('Training camp opens in Seattle');
    expect(camp?.body).toContain('53 players');
    expect(camp?.body).toContain('4 of them carrying an injury');
    const [, , fit] = openingStories(facts({ campInjuries: 0 }));
    expect(fit?.body).toContain('all of them available');
  });

  it('previews the opener, and carries the game it previews', () => {
    const [, , , opener] = openingStories(facts());
    expect(opener?.headline).toBe('Evergreens open on the road at the Prospectors');
    expect(opener?.body).toContain('San Francisco');
    expect(opener?.gameId).toBe('g1');
  });

  it('turns the preview around for a home opener', () => {
    const [, , , opener] = openingStories(facts({
      opener: { gameId: 'g1', opponent: OPPONENT, home: true, neutral: false },
    }));
    expect(opener?.headline).toContain('open at home against');
    expect(opener?.body).toContain('their own crowd');
  });

  it('says the schedule is being prepared when there is no fixture', () => {
    const [, , , opener] = openingStories(facts({ opener: null }));
    expect(opener?.headline).toBe('The league schedule is being prepared');
    expect(opener?.body).toContain('No week 1 fixture');
    // And no game to open, which is what stops a button being drawn for it.
    expect(opener?.gameId).toBeNull();
  });

  it('writes no pronoun for an owner whose gender nothing records', () => {
    // The world stores an owner's name, archetype, patience and tenure. It
    // stores no gender, so any pronoun here would be invented -- and wrong for
    // roughly half the league by construction.
    const bodies = openingStories(facts()).map((s) => s.body ?? '').join(' ');
    expect(bodies).not.toMatch(/\b(he|him|his|she|her|hers)\b/i);
  });
});

describe('the result story', () => {
  const played = {
    season: 2026, week: 3, phase: 'REGULAR_SEASON', club: CLUB, opponent: OPPONENT,
    gameId: 'g9', home: true, overtime: false,
    wins: 2, losses: 1, ties: 0,
  };

  it('leads with the winner and the score, and ends on the record', () => {
    const win = resultStory({ ...played, ourScore: 24, theirScore: 17 });
    expect(win.headline).toBe('Evergreens beat Prospectors 24-17');
    expect(win.body).toContain('are 2-1');
    expect(win.gameId).toBe('g9');
    expect(win.category).toBe('RESULT');
  });

  it('puts the winning score first in a defeat too', () => {
    // "Evergreens fall to Prospectors 17-24" reads as a scoreline nobody
    // writes. The winner's number leads, whoever won.
    const loss = resultStory({ ...played, ourScore: 17, theirScore: 24 });
    expect(loss.headline).toBe('Evergreens fall to Prospectors 24-17');
  });

  it('has a word for a draw', () => {
    const tie = resultStory({ ...played, ourScore: 20, theirScore: 20, ties: 1 });
    expect(tie.headline).toContain('finish level 20-20');
    expect(tie.body).toContain('Neither side could separate it');
  });

  it('says where it was played and whether it went long', () => {
    const away = resultStory({
      ...played, home: false, overtime: true, ourScore: 30, theirScore: 27,
    });
    expect(away.body).toContain('on the road in San Francisco');
    expect(away.body).toContain('it took overtime');
  });

  it('leads the week when it is a playoff game', () => {
    const post = resultStory({
      ...played, phase: 'PLAYOFFS', ourScore: 21, theirScore: 14,
    });
    expect(post.importance).toBe(5);
  });
});

describe('a record, written the way a record is written', () => {
  it('drops the tie column when there are none', () => {
    expect(recordText(9, 4, 0)).toBe('9-4');
  });
  it('keeps it when there are', () => {
    expect(recordText(9, 4, 1)).toBe('9-4-1');
  });
});
