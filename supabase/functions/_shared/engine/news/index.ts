// The weekly news feed.
//
//   const ledger = createLedger(season);          // once per season
//   const items = generateWeeklyNews(week, ledger, rng);   // once per week
//
// The ledger is what makes "no repeated sentences within a season" true: it
// carries the dealt templates and every published headline across the whole
// year. Passing a fresh ledger each week would silently discard the guarantee,
// which is why it is a parameter rather than something the generator owns.
//
// Pure, like the rest of the engine. No clock, no database, no Math.random.

import { detectAll, NEWS_RULES } from './detectors.ts';
import { orderFeed, writeFact, type NewsLedger } from './render.ts';
import type { Rng } from '../rng.ts';
import type { NewsCategory, NewsFact, NewsItem, WeekInput } from './types.ts';

/**
 * Which of the week's facts get written.
 *
 * Importance decides the order, but importance alone decides the feed badly: a
 * mid-season week produces a dozen milestones and half a dozen hot-seat stories
 * rated above every upset and every award race, and the reader gets eight
 * variations on one theme. So the first pass takes the best of each category up
 * to its own limit, and only then does a second pass spend whatever room is
 * left on the highest-rated facts still waiting. A quiet week still fills.
 */
function selectWeek(facts: readonly NewsFact[]): NewsFact[] {
  // Ties are broken by kind then by the first slot value so that the choice is
  // a function of the facts alone -- two runs of the same week must select the
  // same stories in the same order.
  const ranked = [...facts].sort((a, b) => (
    b.importance - a.importance
    || a.kind.localeCompare(b.kind)
    || JSON.stringify(a.slots).localeCompare(JSON.stringify(b.slots))
  ));

  const perCategory = new Map<NewsCategory, number>();
  const chosen: NewsFact[] = [];
  const held: NewsFact[] = [];

  for (const fact of ranked) {
    if (chosen.length >= NEWS_RULES.maxPerWeek) break;
    const used = perCategory.get(fact.category) ?? 0;
    if (used >= NEWS_RULES.maxPerCategory) { held.push(fact); continue; }
    perCategory.set(fact.category, used + 1);
    chosen.push(fact);
  }

  for (const fact of held) {
    if (chosen.length >= NEWS_RULES.maxPerWeek) break;
    chosen.push(fact);
  }
  return chosen;
}

export function generateWeeklyNews(
  input: WeekInput, ledger: NewsLedger, rng: Rng,
): NewsItem[] {
  const facts = detectAll(input);
  const chosen = selectWeek(facts);

  const items: NewsItem[] = [];
  for (const fact of chosen) {
    const item = writeFact(fact, input, ledger, rng);
    if (item !== null) items.push(item);
  }
  return orderFeed(items);
}

/** Stories per category in a set of items. Used by the report and the tests to
 *  check the feed is not dominated by one kind of story. */
export function categoryCounts(
  items: readonly NewsItem[],
): Record<NewsCategory, number> {
  const counts = {
    UPSET: 0, STREAK: 0, MILESTONE: 0, INJURY: 0, HOT_SEAT: 0, AWARD_RACE: 0,
  };
  for (const item of items) counts[item.category] += 1;
  return counts;
}

export { createLedger, orderFeed, renderTemplate, TemplateSlotError, writeFact } from './render.ts';
export type { NewsLedger } from './render.ts';
export { cloneLedger, ledgerFromJson, ledgerToJson, type LedgerJson } from './ledger.ts';
export {
  detectAll, detectAwardRaces, detectHotSeat, detectInjuries, detectMilestones,
  detectStreaks, detectUpsets, NEWS_RULES,
} from './detectors.ts';
export { BANKS, TEMPLATES, TEMPLATE_KINDS, type Template } from './templates.ts';
export { NEWS_CATEGORIES } from './types.ts';
export type {
  AwardRaceNews, CoachNews, GameNews, InjuryNews, NewsCategory, NewsFact,
  NewsItem, PlayerNews, TeamNews, WeekInput,
} from './types.ts';
