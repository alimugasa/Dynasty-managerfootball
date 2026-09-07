// The ledger across a page reload.
//
// A NewsLedger carries a Map of Sets, which JSON turns into empty objects. The
// browser host persists the whole session after every action, so the ledger
// needs a shape that survives the round trip -- otherwise a reload silently
// forgets every headline of the season and the no-repeat guarantee breaks
// exactly when nobody is watching.

import type { NewsLedger } from './render.ts';

export interface LedgerJson {
  readonly season: number;
  readonly dealt: readonly (readonly [string, readonly string[]])[];
  readonly headlines: readonly string[];
  readonly dropped: number;
}

export function ledgerToJson(ledger: NewsLedger): LedgerJson {
  return {
    season: ledger.season,
    dealt: [...ledger.dealt.entries()].map(([kind, ids]) => [kind, [...ids]] as const),
    headlines: [...ledger.headlines],
    dropped: ledger.dropped,
  };
}

export function ledgerFromJson(json: LedgerJson): NewsLedger {
  return {
    season: json.season,
    dealt: new Map(json.dealt.map(([kind, ids]) => [kind, new Set(ids)])),
    headlines: new Set(json.headlines),
    dropped: json.dropped,
  };
}

/** A deep copy, so a week can be generated against a ledger without the
 *  previous state's ledger changing underneath it. */
export function cloneLedger(ledger: NewsLedger): NewsLedger {
  return ledgerFromJson(ledgerToJson(ledger));
}
