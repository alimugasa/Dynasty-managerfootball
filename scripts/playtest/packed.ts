// The packed world's shape, with no filesystem dependency.
//
// Separate from seed.ts because that module reads the CSVs at build time and
// imports node:fs; a browser bundle that reached it would evaluate that import
// and die before running a line of the game. Same split as csv.ts and
// seedCsv.ts, for the same reason.

/** Column-oriented: the header once, then a row of values per player. The same
 *  data as a list of objects and a quarter of the bytes, which on a phone is
 *  the difference between a fast first paint and a slow one. */
export interface PackedTable {
  readonly cols: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export type PackedWorld = Readonly<Record<string, PackedTable>>;

/** Unpacks a table into the rows the seed reader hands the loader. */
export function unpack(table: PackedTable): Record<string, string>[] {
  return table.rows.map((row) => {
    const out: Record<string, string> = {};
    table.cols.forEach((col, i) => { out[col] = row[i] ?? ''; });
    return out;
  });
}
