// The news engine.

import { describe, expect, it } from 'vitest';
import { createRng } from '../../supabase/functions/_shared/engine/rng.ts';
import {
  BANKS, TEMPLATES, TEMPLATE_KINDS, categoryCounts, createLedger, detectAll,
  detectAwardRaces, detectHotSeat, detectInjuries, detectMilestones, detectStreaks,
  detectUpsets, generateWeeklyNews, NEWS_CATEGORIES, NEWS_RULES, renderTemplate,
  TemplateSlotError, writeFact,
} from '../../supabase/functions/_shared/engine/news/index.ts';
import { AWARD_RACES, COACHES, everyKindWeek, GAMES, INJURIES, TEAMS, team }
  from './fixtures.ts';

describe('templates', () => {
  it('reference only word banks that exist', () => {
    for (const [kind, templates] of Object.entries(TEMPLATES)) {
      for (const t of templates) {
        for (const text of [t.headline, t.body]) {
          for (const match of text.matchAll(/\{@([a-zA-Z0-9_]+)\}/g)) {
            const bank = match[1] as string;
            expect(BANKS[bank], `${kind}/${t.id} uses unknown bank @${bank}`).toBeDefined();
          }
        }
      }
    }
  });

  it('reference only slots their own detector supplies', () => {
    // The strong version of the check: render every template of every kind
    // against the slots the detector actually produces. A missing slot throws
    // rather than shipping literal braces into a headline.
    const facts = detectAll(everyKindWeek());
    const byKind = new Map(facts.map((f) => [f.kind, f]));

    for (const kind of TEMPLATE_KINDS) {
      const fact = byKind.get(kind);
      expect(fact, `fixture never produces a ${kind} fact`).toBeDefined();
      if (fact === undefined) continue;
      for (const t of TEMPLATES[kind] ?? []) {
        expect(
          () => renderTemplate(t.headline, t.id, fact.slots, createRng(1)),
          `${kind}/${t.id} headline`,
        ).not.toThrow();
        expect(
          () => renderTemplate(t.body, t.id, fact.slots, createRng(1)),
          `${kind}/${t.id} body`,
        ).not.toThrow();
      }
    }
  });

  it('throws loudly on an unknown slot rather than emitting braces', () => {
    expect(() => renderTemplate('{missing} wins', 'x1', {}, createRng(1)))
      .toThrow(TemplateSlotError);
  });

  it('gives every kind several phrasings to draw on', () => {
    for (const kind of TEMPLATE_KINDS) {
      expect((TEMPLATES[kind] ?? []).length, `${kind} has too few templates`)
        .toBeGreaterThanOrEqual(4);
    }
  });

  it('has no duplicate template ids within a kind', () => {
    for (const [kind, templates] of Object.entries(TEMPLATES)) {
      const ids = templates.map((t) => t.id);
      expect(new Set(ids).size, `${kind} has duplicate ids`).toBe(ids.length);
    }
  });
});

describe('detectors', () => {
  it('finds an upset and grades it by the gap', () => {
    const facts = detectUpsets(GAMES, TEAMS);
    expect(facts).toHaveLength(2);
    const big = facts.find((f) => f.kind === 'upset.big');
    const close = facts.find((f) => f.kind === 'upset.close');
    expect(big?.slots['winner']).toBe('Weyland Drovers');
    expect(close?.slots['winner']).toBe('Narrows Pilots');
    expect(big?.importance).toBeGreaterThan(close?.importance ?? 0);
  });

  it('ignores a result the stronger side won', () => {
    const games = [{
      gameId: 'G9', week: 3, homeTeamId: 'STR', awayTeamId: 'WEK',
      homeScore: 30, awayScore: 10, overtime: false,
    }];
    expect(detectUpsets(games, TEAMS)).toHaveLength(0);
  });

  it('finds runs in both directions and ignores short ones', () => {
    const facts = detectStreaks(TEAMS);
    expect(facts.map((f) => f.kind).sort()).toEqual(['streak.loss', 'streak.win']);
    expect(detectStreaks([team({ streak: 2 })])).toHaveLength(0);
  });

  it('reports a run as it lengthens, not every week', () => {
    // Three is the threshold; four is not news again; five is.
    expect(detectStreaks([team({ streak: 3 })])).toHaveLength(1);
    expect(detectStreaks([team({ streak: 4 })])).toHaveLength(0);
    expect(detectStreaks([team({ streak: 5 })])).toHaveLength(1);
  });

  it('finds both a big game and a season total crossed this week', () => {
    const facts = detectMilestones(everyKindWeek());
    expect(facts.some((f) => f.kind === 'milestone.game')).toBe(true);
    const season = facts.find((f) => f.kind === 'milestone.season');
    expect(season?.slots['value']).toBe('3000');
  });

  it('reports a season milestone only in the week it is crossed', () => {
    const week = everyKindWeek({
      players: [{
        playerId: 'P1', name: 'Emeka Isbell', teamId: 'MIL', position: 'QB',
        // Already past 3000 before this game: nothing was crossed.
        gamePassYards: 210, gameRushYards: 0, gameRecYards: 0, gameTouchdowns: 1,
        seasonPassYards: 3400, seasonRushYards: 0, seasonRecYards: 0, seasonSacks: 0,
      }],
    });
    expect(detectMilestones(week).some((f) => f.kind === 'milestone.season')).toBe(false);
  });

  it('reports season-ending and long injuries, but not knocks', () => {
    const facts = detectInjuries(INJURIES, TEAMS);
    expect(facts.map((f) => f.kind).sort()).toEqual(['injury.major', 'injury.season']);
    const minor = detectInjuries([{
      playerId: 'P9', name: 'Sam Vale', teamId: 'MIL', position: 'WR',
      severity: 'shortTerm', weeksOut: 2, starter: false,
    }], TEAMS);
    expect(minor).toHaveLength(0);
  });

  it('says nothing about a coach before a record means anything', () => {
    expect(detectHotSeat(COACHES, TEAMS, 3)).toHaveLength(0);
    expect(detectHotSeat(COACHES, TEAMS, 10).length).toBeGreaterThan(0);
  });

  it('covers both sides of the hot seat', () => {
    const kinds = detectHotSeat(COACHES, TEAMS, 10).map((f) => f.kind).sort();
    expect(kinds).toEqual(['hot_seat.pressure', 'hot_seat.reprieve']);
  });

  it('separates a tight award race from a settled one', () => {
    const kinds = detectAwardRaces(AWARD_RACES, TEAMS, 12).map((f) => f.kind).sort();
    expect(kinds).toEqual(['award.clear', 'award.tight']);
    expect(detectAwardRaces(AWARD_RACES, TEAMS, 2)).toHaveLength(0);
  });

  it('produces a fact for every template kind from one week', () => {
    const kinds = new Set(detectAll(everyKindWeek()).map((f) => f.kind));
    for (const kind of TEMPLATE_KINDS) {
      expect(kinds.has(kind), `nothing produces ${kind}`).toBe(true);
    }
  });
});

describe('the weekly feed', () => {
  it('emits rows the news table accepts', () => {
    const items = generateWeeklyNews(everyKindWeek(), createLedger(2026), createRng(7));
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(NEWS_CATEGORIES).toContain(item.category);
      expect(item.importance).toBeGreaterThanOrEqual(1);
      expect(item.importance).toBeLessThanOrEqual(5);
      expect(item.headline.length).toBeGreaterThan(0);
      expect(item.headline).not.toContain('{');
      expect(item.body ?? '').not.toContain('{');
      expect(item.season).toBe(2026);
      expect(item.week).toBe(10);
    }
  });

  it('caps the week so a feed stays a feed', () => {
    const items = generateWeeklyNews(everyKindWeek(), createLedger(2026), createRng(3));
    expect(items.length).toBeLessThanOrEqual(NEWS_RULES.maxPerWeek);
  });

  it('leads with the biggest story', () => {
    const items = generateWeeklyNews(everyKindWeek(), createLedger(2026), createRng(11));
    for (let i = 1; i < items.length; i += 1) {
      expect((items[i - 1] as { importance: number }).importance)
        .toBeGreaterThanOrEqual((items[i] as { importance: number }).importance);
    }
  });

  it('is deterministic for a seed', () => {
    const run = () => generateWeeklyNews(everyKindWeek(), createLedger(2026), createRng(99));
    expect(run()).toEqual(run());
  });

  it('differs across seeds', () => {
    const a = generateWeeklyNews(everyKindWeek(), createLedger(2026), createRng(1));
    const b = generateWeeklyNews(everyKindWeek(), createLedger(2026), createRng(2));
    expect(a.map((i) => i.headline)).not.toEqual(b.map((i) => i.headline));
  });

  it('never lets one category take the whole week', () => {
    // The defect this pins: ranking on importance alone, a week with twenty
    // injuries published eight injuries and nothing else. Real weeks look like
    // this -- the detectors fire far more facts than the feed has room for.
    const flood = everyKindWeek({
      injuries: Array.from({ length: 20 }, (_, i) => ({
        playerId: `F${String(i)}`, name: `Flood Player ${String(i)}`, teamId: 'MIL',
        position: 'EDGE', severity: 'seasonEnding' as const, weeksOut: 99, starter: true,
      })),
    });
    const counts = categoryCounts(generateWeeklyNews(flood, createLedger(2026), createRng(4)));
    expect(counts.INJURY).toBeLessThanOrEqual(NEWS_RULES.maxPerCategory);
    expect(Object.values(counts).filter((n) => n > 0).length).toBeGreaterThan(2);
  });

  it('still fills the week when only one category has anything to say', () => {
    // The cap limits crowding, it must not create a thin feed: with nothing
    // else happening, the held-back stories come back to fill the space.
    const quiet = everyKindWeek({
      games: [], teams: TEAMS.map((t) => team({ ...t, streak: 0 })),
      players: [], coaches: [], awardRaces: [],
      injuries: Array.from({ length: 20 }, (_, i) => ({
        playerId: `F${String(i)}`, name: `Flood Player ${String(i)}`, teamId: 'MIL',
        position: 'EDGE', severity: 'seasonEnding' as const, weeksOut: 99, starter: true,
      })),
    });
    const items = generateWeeklyNews(quiet, createLedger(2026), createRng(4));
    expect(items.length).toBe(NEWS_RULES.maxPerWeek);
  });

  it('never opens a headline in lower case', () => {
    // Templates that start with a word bank -- '{@big} day for {player}' --
    // otherwise render as 'career day for ...'.
    const ledger = createLedger(2026);
    const rng = createRng(21);
    for (let week = 1; week <= 18; week += 1) {
      for (const item of generateWeeklyNews(everyKindWeek({ week }), ledger, rng)) {
        const first = item.headline[0] as string;
        expect(first, item.headline).toBe(first.toUpperCase());
      }
    }
  });

  it('covers more than one kind of story', () => {
    const counts = categoryCounts(
      generateWeeklyNews(everyKindWeek(), createLedger(2026), createRng(5)),
    );
    expect(Object.values(counts).filter((n) => n > 0).length).toBeGreaterThan(2);
  });
});

describe('no repeated sentences within a season', () => {
  it('never publishes the same headline twice in a season', () => {
    const ledger = createLedger(2026);
    const rng = createRng(4242);
    const seen = new Set<string>();

    // The same week, run eighteen times. This is the adversarial case: identical
    // facts every week, so only the phrasing can vary.
    for (let week = 1; week <= 18; week += 1) {
      for (const item of generateWeeklyNews(everyKindWeek({ week }), ledger, rng)) {
        expect(seen.has(item.headline), `repeated: ${item.headline}`).toBe(false);
        seen.add(item.headline);
      }
    }
    expect(seen.size).toBeGreaterThan(40);
  });

  it('deals a kind without replacement before repeating a phrasing', () => {
    const ledger = createLedger(2026);
    const rng = createRng(31);
    const bank = TEMPLATES['streak.win'] ?? [];
    const used: string[] = [];

    for (let i = 0; i < bank.length; i += 1) {
      const item = writeFact({
        category: 'STREAK', kind: 'streak.win', importance: 3,
        slots: { team: `Club ${i}`, count: '4', record: `${i}-2` },
        teamId: 'AAA', playerId: null, gameId: null,
      }, { season: 2026, week: i + 1, phase: 'REGULAR_SEASON' }, ledger, rng);
      expect(item).not.toBeNull();
      used.push(item?.headline ?? '');
    }
    // Every phrasing in the bank was used before any came round again.
    expect(ledger.dealt.get('streak.win')?.size).toBe(bank.length);
    expect(new Set(used).size).toBe(bank.length);
  });

  it('drops a story rather than repeating itself, and counts the drop', () => {
    const ledger = createLedger(2026);
    const rng = createRng(8);
    const fact = {
      category: 'STREAK' as const, kind: 'streak.win', importance: 3,
      slots: { team: 'Same Club', count: '3', record: '3-0' },
      teamId: 'AAA', playerId: null, gameId: null,
    };
    const at = { season: 2026, week: 1, phase: 'REGULAR_SEASON' };

    // Exhaust every phrasing and every word-bank combination for one identical
    // fact, then keep going. Once nothing new can be said, it stops publishing.
    let published = 0;
    for (let i = 0; i < 400; i += 1) {
      if (writeFact(fact, at, ledger, rng) !== null) published += 1;
    }
    expect(published).toBeGreaterThan(0);
    expect(ledger.dropped).toBeGreaterThan(0);
    expect(published + ledger.dropped).toBe(400);
  });

  it('starts clean in a new season', () => {
    const rng = createRng(77);
    const first = generateWeeklyNews(everyKindWeek(), createLedger(2026), rng);
    const second = generateWeeklyNews(
      everyKindWeek({ season: 2027 }), createLedger(2027), createRng(77),
    );
    // A fresh ledger means last year's phrasings are available again, which is
    // correct: the constraint is within a season, not for all time.
    expect(second.length).toBe(first.length);
  });
});
