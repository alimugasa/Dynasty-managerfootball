// Turning a fact into a sentence, without saying the same thing twice.
//
// Two guarantees, one weaker and one absolute:
//
//   Templates are dealt without replacement per kind. A phrasing cannot come
//   round again until every other phrasing of that kind has been used, which is
//   what stops a season reading like one sentence with the names swapped.
//
//   Every rendered headline is checked against every headline already published
//   this season. That is the guarantee the deck alone cannot give, because word
//   banks and slot values could in principle collide.
//
// When a fact cannot be phrased without repeating itself, it is dropped rather
// than published. A season is better one story short than saying the same
// sentence twice, and the count is reported so the shortfall is visible instead
// of silent.

import { BANKS, TEMPLATES, type Template } from './templates.ts';
import type { Rng } from '../rng.ts';
import type { NewsCategory, NewsFact, NewsItem } from './types.ts';

export interface NewsLedger {
  readonly season: number;
  /** Template ids already dealt this season, per kind. */
  readonly dealt: Map<string, Set<string>>;
  /** Every headline published this season, verbatim. */
  readonly headlines: Set<string>;
  /** Facts that could not be phrased without repetition. */
  dropped: number;
}

export function createLedger(season: number): NewsLedger {
  return { season, dealt: new Map(), headlines: new Set(), dropped: 0 };
}

/** Thrown when a template references a slot nothing supplies. Loud on purpose:
 *  the alternative is shipping literal braces inside a headline. */
export class TemplateSlotError extends Error {
  readonly templateId: string;
  readonly slot: string;

  constructor(templateId: string, slot: string) {
    super(`Template ${templateId} references unknown slot "${slot}"`);
    this.name = 'TemplateSlotError';
    this.templateId = templateId;
    this.slot = slot;
  }
}

const SLOT = /\{(@?[a-zA-Z0-9_]+)\}/g;

/** Fills {slot} from the fact and {@bank} from the word lists. */
export function renderTemplate(
  text: string,
  templateId: string,
  slots: Readonly<Record<string, string>>,
  rng: Rng,
): string {
  return text.replace(SLOT, (_match, token: string) => {
    if (token.startsWith('@')) {
      const bank = BANKS[token.slice(1)];
      if (bank === undefined || bank.length === 0) {
        throw new TemplateSlotError(templateId, token);
      }
      return rng.pick(bank);
    }
    const value = slots[token];
    if (value === undefined) throw new TemplateSlotError(templateId, token);
    return value;
  });
}

/** Deterministic shuffle. Fisher-Yates, drawing from the seeded generator so a
 *  seed reproduces a season's news exactly. */
function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = rng.int(0, i);
    const a = out[i] as T;
    const b = out[j] as T;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/** Templates of this kind not yet dealt, reshuffling the deck when spent. */
function candidatesFor(kind: string, ledger: NewsLedger): readonly Template[] {
  const all = TEMPLATES[kind];
  if (all === undefined || all.length === 0) return [];

  let used = ledger.dealt.get(kind);
  if (used === undefined) {
    used = new Set<string>();
    ledger.dealt.set(kind, used);
  }
  const fresh = all.filter((t) => !used.has(t.id));
  if (fresh.length > 0) return fresh;

  // The deck is spent. Reshuffle rather than refusing to write: a long season
  // will exhaust any bank, and the headline check below still prevents a
  // literal repeat.
  used.clear();
  return all;
}

/**
 * A headline opening with a word bank starts lower case -- '{@big} day for
 * {player}' renders as 'career day for ...'. Every other opening is a proper
 * noun and already capitalised, so lifting the first letter is safe here and
 * cheaper than duplicating each bank in a capitalised form.
 */
function capitalise(text: string): string {
  // slice rather than an index, so there is no path on which an undefined
  // first character stringifies into the headline.
  return text.slice(0, 1).toUpperCase() + text.slice(1);
}

/** Writes one fact, or returns null if it could not be said in a new way. */
export function writeFact(
  fact: NewsFact,
  input: { readonly season: number; readonly week: number; readonly phase: string },
  ledger: NewsLedger,
  rng: Rng,
): NewsItem | null {
  const candidates = shuffled(candidatesFor(fact.kind, ledger), rng);

  for (const template of candidates) {
    const headline = capitalise(
      renderTemplate(template.headline, template.id, fact.slots, rng));
    if (ledger.headlines.has(headline)) continue;

    const body = renderTemplate(template.body, template.id, fact.slots, rng);
    ledger.headlines.add(headline);
    ledger.dealt.get(fact.kind)?.add(template.id);

    return {
      season: input.season,
      week: input.week,
      phase: input.phase,
      category: fact.category,
      headline,
      body,
      teamId: fact.teamId,
      playerId: fact.playerId,
      gameId: fact.gameId,
      importance: fact.importance,
    };
  }

  ledger.dropped += 1;
  return null;
}

/** Category ordering for a tie in importance, so a feed reads sensibly rather
 *  than in whatever order the detectors happened to run. */
const CATEGORY_RANK: Record<NewsCategory, number> = {
  UPSET: 0, INJURY: 1, MILESTONE: 2, STREAK: 3, HOT_SEAT: 4, AWARD_RACE: 5,
};

export function orderFeed(items: readonly NewsItem[]): NewsItem[] {
  return [...items].sort((a, b) =>
    b.importance - a.importance || CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category]);
}
