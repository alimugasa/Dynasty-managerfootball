// Missing data is reported, never substituted. Inventing a plausible value to
// satisfy a component is the most serious defect that can be introduced in this
// project: it turns a loud failure into a number on screen that was never real.

export interface MissingDataContext {
  table: string;
  column?: string;
  id?: string;
  screen?: string;
}

export class MissingData extends Error {
  readonly table: string;
  readonly column: string | undefined;
  readonly id: string | undefined;
  readonly screen: string | undefined;

  constructor(ctx: MissingDataContext) {
    const where = [ctx.table, ctx.column].filter(Boolean).join('.');
    super(
      `Missing data: ${where}` +
        (ctx.id ? ` for id "${ctx.id}"` : '') +
        (ctx.screen ? ` (requested by ${ctx.screen})` : ''),
    );
    this.name = 'MissingData';
    this.table = ctx.table;
    this.column = ctx.column;
    this.id = ctx.id;
    this.screen = ctx.screen;
  }
}

export function isMissingData(e: unknown): e is MissingData {
  return e instanceof MissingData;
}

/** Use instead of `?? 0`, `|| 0` or `?? '-'`. There are no fallback values. */
export function required<T>(value: T | null | undefined, ctx: MissingDataContext): T {
  if (value === null || value === undefined) throw new MissingData(ctx);
  return value;
}
