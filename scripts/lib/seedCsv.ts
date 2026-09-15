// Reader for the frozen seed CSVs. legacy/ is read here and never written.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from './csv.ts';

const SEED = join(process.cwd(), 'legacy', 'seed');

export function readSeedCsv(name: string): Record<string, string>[] {
  return parseCsv(readFileSync(join(SEED, `${name}.csv`), 'utf8'));
}

export { numberOrUndefined, parseCsv, parseCsv as parseSeedCsv } from './csv.ts';
