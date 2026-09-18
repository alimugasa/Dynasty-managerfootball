// Loads the frozen seed CSVs into Postgres as the template world.
//
//   DATABASE_URL=postgres://... node scripts/import-seed.ts
//
// One template save (saves.is_template, enforced unique by 0001), owned by
// nobody, that create_save() clones for every dynasty. Running this twice
// leaves the same rows: the template and everything under it is deleted and
// reloaded inside one transaction, under a fixed id, so a second run replaces
// rather than doubles and a failed run leaves the previous template in place.
//
// No transformation of the data. Every value lands as it appears in the CSV.
// What the schema forces is named below and reported at the end, so a gap is
// visible rather than rounded past:
//
//   RENAMED   two columns the migrations renamed for IP or naming reasons; the
//             value is unchanged, only the column name differs.
//   DROPPED   CSV columns the schema has no home for. Verified before dropping:
//             the schedule's score columns are empty in every row, and the
//             three roster columns on players.csv are byte-identical to
//             team_rosters.csv for all 2,880 rostered players.
//   RESHAPED  player_contracts.csv carries this season's cap line as five
//             *_2026 columns; the schema holds them as one contract_years row.
//             Same five numbers, moved sideways. The season is read from the
//             schedule file, not from the column suffix, and the two must agree.
//   SOURCED   two required values the CSVs express indirectly: the league row
//             (its id is the only league_id the conference file names) and
//             team_needs.season (the one season the schedule file contains).
//   SENTINEL  the seed writes 'FA' in a team_id column to mean "no team". The
//             schema means that with NULL, and players.team_id has a foreign key
//             that rejects the literal. Only the two team_id columns that carry
//             it are mapped; colleges.abbreviation also holds an 'FA' and that is
//             a real abbreviation, left alone.
//
// Rule 3 in code: a CSV column that is neither a table column nor in one of
// the lists above stops the run. A schema that drifts from the seed is
// reported, never silently half-loaded.

import { readFileSync } from 'node:fs';
import { readSeedCsv } from './lib/seedCsv.ts';
import type { TransactionSql } from 'postgres';
import { connect, parseDatabaseUrl } from '../supabase/functions/_shared/api/db.ts';

/** Fixed, so a rerun finds and replaces the same row. */
export const TEMPLATE_SAVE_ID = '00000000-0000-0000-0000-000000000000';

/** Dependency order. Lifted from create_save() in 0010, plus leagues first. */
const TABLES = [
  'leagues', 'league_conferences', 'league_divisions', 'teams', 'stadiums', 'owners',
  'colleges', 'coaches', 'coach_attributes', 'team_coaching_staff', 'team_schemes',
  'players', 'player_attributes', 'player_traits', 'player_morale', 'player_injuries',
  'team_rosters', 'team_depth_charts', 'player_contracts', 'contract_years',
  'salary_cap', 'franchise_finances', 'free_agents', 'team_needs', 'owner_goals',
  'season_schedule', 'team_bye_weeks', 'draft_picks', 'draft_classes',
  'scouting_reports', 'data_provenance',
] as const;

const RENAMED: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  colleges: { nfl_pipeline_rate: 'pro_pipeline_rate' },
  salary_cap: { rollover_from_2025: 'rollover_from_prior' },
};

const DROPPED: Readonly<Record<string, readonly string[]>> = {
  season_schedule: ['home_score', 'away_score'],
  players: ['roster_status', 'designation', 'depth_rank'],
};

/** player_contracts.csv columns that become one contract_years row. */
const RESHAPED_CONTRACT_YEAR: Readonly<Record<string, string>> = {
  base_salary_2026: 'base_salary',
  bonus_proration_2026: 'signing_bonus_proration',
  roster_bonus_2026: 'roster_bonus',
  cap_hit_2026: 'cap_hit',
  dead_cap_if_cut_2026: 'dead_cap_if_cut',
};

/** 'FA' in these columns is the seed's way of writing NULL. Nowhere else. */
const SENTINEL_NULL: Readonly<Record<string, readonly string[]>> = {
  players: ['team_id'],
  player_morale: ['team_id'],
};

/** Tables the template holds that no CSV describes. Legitimately empty in a
 *  fresh world; listed so their absence from the report is deliberate. */
const NO_CSV = ['scouting_reports'] as const;

type Row = Record<string, string | number | null>;

/** '' is how the CSV writes an absent value; the column is nullable there. */
const cell = (v: string | undefined): string | null => (v === undefined || v === '' ? null : v);

interface Report {
  readonly csvRows: Record<string, number>;
  readonly landed: Record<string, number>;
  readonly notes: string[];
}

export async function importSeed(databaseUrl: string): Promise<Report> {
  const sql = connect({ ...parseDatabaseUrl(databaseUrl), max: 1 });
  const notes: string[] = [];
  const csvRows: Record<string, number> = {};

  try {
    const columns = new Map<string, Set<string>>();
    for (const r of await sql<{ table_name: string; column_name: string }[]>`
      select table_name, column_name from information_schema.columns
       where table_schema = 'public' and table_name = any(${[...TABLES, 'saves']})`) {
      const set = columns.get(r.table_name) ?? new Set<string>();
      set.add(r.column_name);
      columns.set(r.table_name, set);
    }
    for (const t of TABLES) {
      if (!columns.has(t)) throw new Error(`table public.${t} does not exist; run the migrations first`);
    }

    // The one season the seed describes, read from data rather than assumed.
    const schedule = readSeedCsv('season_schedule');
    const seasons = new Set(schedule.map((r) => r['season']));
    if (seasons.size !== 1) throw new Error(`season_schedule.csv spans ${String(seasons.size)} seasons; expected one`);
    const season = Number([...seasons][0]);
    for (const suffixed of Object.keys(RESHAPED_CONTRACT_YEAR)) {
      if (!suffixed.endsWith(`_${String(season)}`)) {
        throw new Error(`${suffixed} does not match the schedule season ${String(season)}`);
      }
    }
    const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;

    await sql.begin(async (tx) => {
      // Replace, never append. Cascades take every row under the template.
      await tx`delete from public.saves where id = ${TEMPLATE_SAVE_ID}`;
      await tx`insert into public.saves (id, user_id, is_template, name, season, rng_seed, engine_version)
               values (${TEMPLATE_SAVE_ID}, null, true, 'Template world', ${season}, 0, ${version})`;

      // SOURCED: the league row. Its id is the only league_id the conference
      // file names; the name is the product's; founded_year has no source and
      // is left NULL rather than guessed.
      const leagueIds = new Set(readSeedCsv('league_conferences').map((r) => r['league_id']));
      if (leagueIds.size !== 1) throw new Error(`league_conferences.csv names ${String(leagueIds.size)} leagues`);
      const leagueId = [...leagueIds][0] as string;
      await tx`insert into public.leagues (save_id, league_id, name, abbreviation, founded_year)
               values (${TEMPLATE_SAVE_ID}, ${leagueId}, 'Dynasty Manager Pro', ${leagueId}, null)`;
      notes.push(`SOURCED  leagues: 1 row; league_id "${leagueId}" from league_conferences.csv, founded_year NULL (no source)`);

      for (const table of TABLES) {
        if (table === 'leagues' || (NO_CSV as readonly string[]).includes(table)) continue;
        const target = columns.get(table) as Set<string>;

        if (table === 'contract_years') {
          // RESHAPED from player_contracts.csv.
          const rows: Row[] = readSeedCsv('player_contracts').map((r) => {
            // guaranteed is per year and the CSV has only a per-contract total.
            // Unknown, so NULL -- never the column's old default of false, which
            // made every release's dead-money math silently wrong.
            const out: Row = { save_id: TEMPLATE_SAVE_ID, contract_id: cell(r['contract_id']), season, guaranteed: null };
            for (const [from, to] of Object.entries(RESHAPED_CONTRACT_YEAR)) out[to] = cell(r[from]);
            return out;
          });
          await insertRows(tx, table, rows);
          csvRows[table] = 0;
          notes.push(`RESHAPED contract_years: ${String(rows.length)} rows from five *_${String(season)} columns of player_contracts.csv; guaranteed written NULL (no per-year source)`);
          continue;
        }

        const source = readSeedCsv(table);
        csvRows[table] = source.length;
        const header = source[0] === undefined ? [] : Object.keys(source[0]);
        const rename = RENAMED[table] ?? {};
        const dropped = DROPPED[table] ?? [];
        const reshaped = table === 'player_contracts' ? Object.keys(RESHAPED_CONTRACT_YEAR) : [];

        for (const h of header) {
          const landsAs = rename[h] ?? h;
          if (target.has(landsAs) || dropped.includes(h) || reshaped.includes(h)) continue;
          throw new Error(`${table}.csv column "${h}" is not a column of public.${table} and is not accounted for`);
        }
        for (const [from, to] of Object.entries(rename)) {
          notes.push(`RENAMED  ${table}.${from} -> ${to}`);
        }
        if (dropped.length > 0) notes.push(`DROPPED  ${table}: ${dropped.join(', ')}`);

        const sentinel = SENTINEL_NULL[table] ?? [];
        let sentinels = 0;
        const rows: Row[] = source.map((r) => {
          const out: Row = { save_id: TEMPLATE_SAVE_ID };
          for (const h of header) {
            if (dropped.includes(h) || reshaped.includes(h)) continue;
            let v = cell(r[h]);
            if (v === 'FA' && sentinel.includes(h)) { v = null; sentinels += 1; }
            out[rename[h] ?? h] = v;
          }
          if (table === 'team_needs') out['season'] = season;
          return out;
        });
        if (sentinels > 0) notes.push(`SENTINEL ${table}.${sentinel.join(',')}: 'FA' -> NULL in ${String(sentinels)} rows`);
        if (table === 'team_needs') notes.push(`SOURCED  team_needs.season = ${String(season)} from season_schedule.csv (column absent from team_needs.csv)`);
        await insertRows(tx, table, rows);
      }
    });

    const landed: Record<string, number> = {};
    for (const table of TABLES) {
      const [r] = await sql<{ n: string }[]>`
        select count(*) as n from public.${sql(table)} where save_id = ${TEMPLATE_SAVE_ID}`;
      landed[table] = Number(r?.n ?? 0);
    }
    const [s] = await sql<{ n: string }[]>`select count(*) as n from public.saves where id = ${TEMPLATE_SAVE_ID}`;
    landed['saves'] = Number(s?.n ?? 0);
    return { csvRows, landed, notes };
  } finally {
    await sql.end();
  }
}

/** Parameter ceiling is 65,535 per statement; player_attributes alone is ~92k. */
async function insertRows(tx: TransactionSql, table: string, rows: readonly Row[]): Promise<void> {
  if (rows.length === 0) return;
  const cols = Object.keys(rows[0] as Row);
  const chunk = Math.max(1, Math.floor(60000 / cols.length));
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    await tx`insert into public.${tx(table)} ${tx(slice as Record<string, unknown>[], ...cols)}`;
  }
}

function main(): void {
  const url = process.env['DATABASE_URL'];
  if (url === undefined) { process.stderr.write('import-seed: DATABASE_URL is not set\n'); process.exit(2); }
  importSeed(url).then((report) => {
    const out: string[] = ['', 'TEMPLATE WORLD IMPORT', '-'.repeat(60)];
    let csvTotal = 0; let landedTotal = 0;
    for (const table of TABLES) {
      const c = report.csvRows[table]; const l = report.landed[table] ?? 0;
      csvTotal += c ?? 0; landedTotal += l;
      const src = c === undefined ? '   (no csv)' : String(c).padStart(11);
      out.push(`  ${table.padEnd(22)} csv ${src}   landed ${String(l).padStart(6)}${c !== undefined && c !== l ? '   <-- differs' : ''}`);
    }
    out.push(`  ${'saves (template)'.padEnd(22)} csv    (no csv)   landed ${String(report.landed['saves'] ?? 0).padStart(6)}`);
    out.push('-'.repeat(60));
    out.push(`  csv rows ${String(csvTotal)}   landed ${String(landedTotal + (report.landed['saves'] ?? 0))}`);
    out.push('', ...report.notes.map((n) => `  ${n}`), '');
    process.stdout.write(out.join('\n') + '\n');
  }).catch((e: unknown) => {
    process.stderr.write(`import-seed: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  });
}

if (process.argv[1]?.endsWith('import-seed.ts')) main();
