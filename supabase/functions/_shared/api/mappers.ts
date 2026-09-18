// Row -> engine value conversions that must not guess.
//
// A database column can be NULL where the engine wants a value. Rule 3 says
// the answer is never a default: a NULL that becomes false or 0 on the way
// into the engine changes an outcome and tells nobody. Each accessor here
// throws with the row identified, so the first read of an unknown value is a
// loud failure at the exact contract, not a quietly wrong cap sheet.

import { ApiError } from './context.ts';

export class UnknownValue extends ApiError {
  constructor(what: string, where: string) {
    super(500, 'unknown_value', `${what} is not known for ${where}; refusing to assume`);
    this.name = 'UnknownValue';
  }
}

/**
 * contract_years.guaranteed, which the seed cannot supply (it carries only a
 * per-contract total) and which is therefore NULL on every imported row. The
 * derivation rule is a cap-design decision that has not been made; until it
 * is, any code path that needs the flag must come through here and fail.
 */
export function guaranteedFlag(
  value: boolean | null | undefined, where: { contractId: string; season: number },
): boolean {
  if (value === null || value === undefined) {
    throw new UnknownValue('contract_years.guaranteed',
      `contract ${where.contractId}, season ${String(where.season)}`);
  }
  return value;
}
