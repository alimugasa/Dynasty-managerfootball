#!/usr/bin/env node
// Architecture rules from Phase 1. These are hard constraints, not style
// preferences. legacy/ is exempt: it is frozen reference material containing
// Python and one deliberately monolithic 638KB HTML file.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT = process.cwd();
const MAX_LINES = 400;
const SCAN = ['src', 'scripts', 'tests'];
const errors = [];

// Real franchise nicknames and league marks. See docs/IP-POLICY.md.
const IP_DENY = [
  'chiefs','patriots','packers','steelers','cowboys','49ers','niners','ravens',
  'bengals','browns','texans','colts','jaguars','titans','broncos','raiders',
  'chargers','bills','dolphins','jets','eagles','commanders','giants','bears',
  'lions','vikings','falcons','panthers','saints','buccaneers','cardinals',
  'rams','seahawks','nfl','super bowl','pro bowl','madden',
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'node_modules' || name === 'dist' || name === 'legacy') continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = SCAN.flatMap((d) => {
  try { return walk(join(ROOT, d)); } catch { return []; }
});

for (const file of files) {
  const rel = relative(ROOT, file);
  if (rel === 'scripts/lint-arch.mjs') continue; // the rules file names the patterns it bans
  const ext = extname(file);
  if (!['.ts', '.tsx', '.js', '.mjs', '.css'].includes(ext)) continue;
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');

  // 1. 400-line ceiling
  if (lines.length > MAX_LINES) {
    errors.push(`${rel}: ${lines.length} lines exceeds the ${MAX_LINES}-line ceiling.`);
  }

  // 2. Screens and components consume hooks, never src/data directly
  if (/^src\/(screens|components)\//.test(rel) && ext !== '.css') {
    for (const [i, l] of lines.entries()) {
      if (/from\s+['"].*\/data\/(?!errors)/.test(l)) {
        errors.push(`${rel}:${i + 1}: ${rel.split('/')[1]} may not import src/data directly; use a hook.`);
      }
    }
  }

  const isComment = (l) => /^\s*(\/\/|\*|\/\*)/.test(l);

  // 3. Exactly one Supabase client (Phase 2 onward)
  for (const [i, l] of lines.entries()) {
    if (!isComment(l) && l.includes('createClient') && !rel.endsWith('src/data/client.ts')) {
      errors.push(`${rel}:${i + 1}: createClient may only appear in src/data/client.ts.`);
    }
  }

  // 4. No fallback values for missing data
  for (const [i, l] of lines.entries()) {
    if (/^src\/data\//.test(rel) && !isComment(l) && /(\?\?|\|\|)\s*(0\b|''|""|'-'|"-"|\[\])/.test(l)) {
      errors.push(`${rel}:${i + 1}: fallback value in data layer; throw MissingData instead.`);
    }
  }

  // 5. IP policy
  const lower = (rel + '\n' + text).toLowerCase();
  for (const term of IP_DENY) {
    if (new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower)) {
      errors.push(`${rel}: contains "${term}" — violates docs/IP-POLICY.md.`);
    }
  }
}

if (errors.length) {
  console.error('\nArchitecture violations:\n');
  for (const e of errors) console.error('  ' + e);
  console.error(`\n${errors.length} violation(s).\n`);
  process.exit(1);
}
console.log(`lint:arch OK — ${files.length} files checked, 0 violations.`);
