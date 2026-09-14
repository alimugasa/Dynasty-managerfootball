// The News tab's two rules, tested without a browser.
//
// The first is the chips: seven of them, overlapping on purpose, except Team
// and League which must partition the feed exactly. The second is the one the
// whole feed is built on -- a card shows a button only when there is a screen
// behind it -- and it is worth a test because the tempting shortcut (switch on
// the category) gets it wrong for exactly the story a new franchise opens on.

import { describe, expect, it } from 'vitest';
import {
  CHIP_UNWRITTEN, NEWS_CHIPS, chipCounts, isNewsChip, matchesChip,
} from '../supabase/functions/_shared/api/newsFilters';
import { actionFor } from '../src/screens/newsAction';
import { accentFor, clubAccent, preview, stampFor } from '../src/screens/newsCard';
import { SCREENS } from '../src/app/screens';
import type { FeedItem } from '../supabase/functions/_shared/api/reads/news';

const MINE = 'SEA';

const item = (over: Partial<FeedItem> = {}): FeedItem => ({
  newsId: 1, season: 2026, week: 1, phase: 'REGULAR_SEASON',
  category: 'MILESTONE', headline: 'A headline', body: 'A body.',
  importance: 3, teamId: null, teamName: null, playerId: null, playerName: null,
  gameId: null, gamePlayed: false, publishedAt: '2026-09-01T00:00:00Z', readAt: null,
  ...over,
});

describe('the filter chips', () => {
  it('has the seven the tab was asked for', () => {
    expect([...NEWS_CHIPS]).toEqual(
      ['ALL', 'TEAM', 'LEAGUE', 'INJURIES', 'TRANSACTIONS', 'DRAFT', 'OWNER']);
  });

  it('splits team from league exactly, with nothing in both and nothing lost', () => {
    const feed = [
      item({ newsId: 1, teamId: MINE }),
      item({ newsId: 2, teamId: 'SF' }),
      item({ newsId: 3, teamId: null }),
      item({ newsId: 4, teamId: MINE, category: 'INJURY' }),
    ];
    const team = feed.filter((i) => matchesChip('TEAM', i, MINE));
    const league = feed.filter((i) => matchesChip('LEAGUE', i, MINE));
    expect(team.map((i) => i.newsId)).toEqual([1, 4]);
    expect(league.map((i) => i.newsId)).toEqual([2, 3]);
    expect(team.length + league.length).toBe(feed.length);
  });

  it('lets a story sit under more than one chip where it honestly belongs', () => {
    // Your own player going down is a Team story and an Injuries story. The
    // chips are filters, not a filing cabinet with one drawer per item.
    const hurt = item({ teamId: MINE, category: 'INJURY' });
    expect(matchesChip('TEAM', hurt, MINE)).toBe(true);
    expect(matchesChip('INJURIES', hurt, MINE)).toBe(true);
    expect(matchesChip('LEAGUE', hurt, MINE)).toBe(false);
  });

  it('shows nothing under team or league when no club is being managed', () => {
    // Neither question can be answered without knowing whose club is whose,
    // and an unanswerable filter returns nothing rather than guessing.
    expect(matchesChip('TEAM', item({ teamId: MINE }), null)).toBe(false);
    expect(matchesChip('LEAGUE', item({ teamId: 'SF' }), null)).toBe(false);
    expect(matchesChip('ALL', item(), null)).toBe(true);
  });

  it('puts owner talk and hot seats under Owner', () => {
    expect(matchesChip('OWNER', item({ category: 'OWNER' }), MINE)).toBe(true);
    expect(matchesChip('OWNER', item({ category: 'HOT_SEAT' }), MINE)).toBe(true);
    expect(matchesChip('OWNER', item({ category: 'UPSET' }), MINE)).toBe(false);
  });

  it('records which chips nothing writes to yet', () => {
    // One of the seven is shape rather than content in this build. The screen
    // says so in the empty state; this is where that fact lives.
    //
    // It was two until the waiver wire started filing stories, and this is the
    // assertion that makes sure the sentence goes when the feed arrives: a
    // chip that carries real news while telling the reader nothing is written
    // to it is worse than an empty chip, because it stops them looking.
    expect(Object.keys(CHIP_UNWRITTEN).sort()).toEqual(['DRAFT']);
  });

  it('files a claim, a release and a signing under Transactions', () => {
    for (const category of ['TRANSACTION']) {
      expect(matchesChip('TRANSACTIONS', item({ category }), MINE)).toBe(true);
    }
    expect(matchesChip('TRANSACTIONS', item({ category: 'RESULT' }), MINE)).toBe(false);
  });

  it('counts every chip, including the empty ones', () => {
    const counts = chipCounts([item({ teamId: MINE }), item({ teamId: 'SF' })], MINE);
    expect(counts.ALL).toBe(2);
    expect(counts.TEAM).toBe(1);
    expect(counts.LEAGUE).toBe(1);
    expect(counts.DRAFT).toBe(0);
  });

  it('recognises its own keys and nothing else', () => {
    expect(isNewsChip('TEAM')).toBe(true);
    expect(isNewsChip('team')).toBe(false);
    expect(isNewsChip(7)).toBe(false);
  });
});

describe('the action button, which is drawn only when it works', () => {
  it('opens the box score once a game has been played', () => {
    const action = actionFor(
      item({ category: 'RESULT', teamId: MINE, gameId: 'g1', gamePlayed: true }), MINE);
    expect(action).toEqual({ label: 'View Matchup', screen: 'game', params: { id: 'g1' }, root: false });
  });

  it('sends the week 1 preview to the Play tab, not to an empty box score', () => {
    // The Game screen reads game_results. The opener written when a franchise
    // is created has no row there, so a View Matchup button pointing at it
    // would 404 on the first tap a player ever makes in this tab.
    const action = actionFor(
      item({ category: 'MATCHUP', teamId: MINE, gameId: 'g1', gamePlayed: false }), MINE);
    expect(action?.screen).toBe('play');
    expect(action?.root).toBe(true);
  });

  it("draws nothing for another club's unplayed fixture", () => {
    expect(actionFor(
      item({ category: 'MATCHUP', teamId: 'SF', gameId: 'g1', gamePlayed: false }), MINE)).toBeNull();
  });

  it('opens a named player from any club', () => {
    const action = actionFor(item({ category: 'INJURY', teamId: 'SF', playerId: 'p7' }), MINE);
    expect(action).toEqual({ label: 'View Player', screen: 'player', params: { id: 'p7' }, root: false });
  });

  it('sends camp to the roster and the owner to the office, for your club only', () => {
    expect(actionFor(item({ category: 'CAMP', teamId: MINE }), MINE)?.screen).toBe('roster');
    expect(actionFor(item({ category: 'OWNER', teamId: MINE }), MINE)?.screen).toBe('office');
    // The roster screen shows your roster and the office your office. Another
    // club's camp story has nothing to open.
    expect(actionFor(item({ category: 'CAMP', teamId: 'SF' }), MINE)).toBeNull();
    expect(actionFor(item({ category: 'OWNER', teamId: 'SF' }), MINE)).toBeNull();
  });

  it('draws nothing for a league story with nothing behind it', () => {
    expect(actionFor(item({ category: 'UPSET', teamId: 'SF' }), MINE)).toBeNull();
    expect(actionFor(item({ category: 'STREAK', teamId: null }), MINE)).toBeNull();
  });

  it('never names a screen the registry does not have', () => {
    // The whole point. Every destination this module can return has to resolve
    // to a real screen, or the feed grows a dead button the day a category is
    // added.
    const every = [
      item({ category: 'RESULT', teamId: MINE, gameId: 'g', gamePlayed: true }),
      item({ category: 'MATCHUP', teamId: MINE, gameId: 'g' }),
      item({ category: 'INJURY', teamId: 'SF', playerId: 'p' }),
      item({ category: 'CAMP', teamId: MINE }),
      item({ category: 'OWNER', teamId: MINE }),
      item({ category: 'HOT_SEAT', teamId: MINE }),
      item({ category: 'FRANCHISE', teamId: MINE }),
    ];
    for (const one of every) {
      const action = actionFor(one, MINE);
      expect(action, one.category).not.toBeNull();
      expect(Object.keys(SCREENS)).toContain(action?.screen);
    }
  });
});

describe("the card's furniture", () => {
  it('edges your own club in its own colour and a big league story in blue', () => {
    const mine = accentFor(item({ teamId: MINE }), MINE, '#5FA83E');
    expect(mine).toEqual({ colour: '#5FA83E', strong: true });
    const big = accentFor(item({ teamId: 'SF', importance: 5 }), MINE, null);
    expect(big.strong).toBe(true);
    expect(big.colour).not.toBe('#5FA83E');
    expect(accentFor(item({ teamId: 'SF', importance: 2 }), MINE, null).strong).toBe(false);
  });

  it('refuses a club colour too dark to see on this ink', () => {
    // A navy that measures darker than the panel behind it draws an accent
    // nobody can see, which is worse than drawing none: the card silently
    // loses the mark that says it is yours.
    expect(clubAccent('#0C2340', '#5FA83E')).toBe('#5FA83E');
    expect(clubAccent('#0C2340', '#101820')).toBe('#F0A830');
    expect(clubAccent('#5FA83E', '#0C2340')).toBe('#5FA83E');
    expect(clubAccent(null, null)).toBe('#F0A830');
    expect(clubAccent('not a colour', null)).toBe('#F0A830');
  });

  it('stamps the week and the category, or just the category', () => {
    expect(stampFor(item({ week: 3, category: 'HOT_SEAT' }))).toBe('Week 3 · Hot seat');
    expect(stampFor(item({ week: null, category: 'UPSET' }))).toBe('Upset');
  });

  it('cuts a preview on a word, never mid-word', () => {
    const long = 'The Evergreens are on the field and every one of them is accounted for today';
    const cut = preview(long, 40);
    expect(cut?.endsWith('…')).toBe(true);
    expect(long).toContain(cut?.slice(0, -1).trim());
    expect(preview('Short.', 40)).toBe('Short.');
    expect(preview(null)).toBeNull();
    expect(preview('   ')).toBeNull();
  });
});
