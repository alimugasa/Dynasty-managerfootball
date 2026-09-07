#!/usr/bin/env node
// Architecture rules from Phase 1. These are hard constraints, not style
// preferences. legacy/ is exempt: it is frozen reference material containing
// Python and one deliberately monolithic 638KB HTML file.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT = process.cwd();
const MAX_LINES = 400;
const SCAN = ['src', 'scripts', 'tests', 'supabase/functions'];
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
  try { return walk(join(ROOT, ...d.split('/'))); } catch { return []; }
});

// The simulation engine must stay a pure function of its inputs. A seed has to
// reproduce a game exactly -- for a save file, for a golden test, for a bug
// report -- and any of these would silently break that.
const ENGINE_DIR = 'supabase/functions/_shared/engine/';
const IMPURE = [
  [/\bMath\.random\b/, 'Math.random() is unseeded; draw from the Rng passed in'],
  [/\bDate\.now\b|\bnew Date\b/, 'reading the clock makes a game unreproducible'],
  [/\bfetch\s*\(|\bXMLHttpRequest\b/, 'the engine performs no I/O'],
  [/\bprocess\.|\bDeno\./, 'the engine must not touch the host environment'],
  [/\bconsole\./, 'the engine must not log; return data instead'],
  [/from\s+['"]node:|require\s*\(/, 'the engine must not depend on a runtime'],
  [/\bcrypto\./, 'use the seeded Rng, not a cryptographic source'],
];

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

  // 5. Engine purity
  if (rel.replace(/\\/g, '/').startsWith(ENGINE_DIR)) {
    for (const [i, l] of lines.entries()) {
      if (isComment(l)) continue;
      for (const [pattern, why] of IMPURE) {
        if (pattern.test(l)) {
          errors.push(`${rel}:${i + 1}: ${why}.`);
        }
      }
    }
  }

  // 6. The frontend may not import the engine. Rule 2 of ARCHITECTURE.md is that
  //    no simulation outcome is decided in frontend code; the surest way to keep
  //    that true is for the engine never to reach the bundle at all.
  //
  //    src/game/ is the one exception, and it is a KNOWN DEBT rather than a
  //    design. The server-side write path does not exist: there is no Supabase
  //    client, no edge function, nothing that can run a week and store the
  //    result. So that the game can be played at all, src/game/ hosts the pure
  //    engine in the browser and persists through the save system to
  //    localStorage. See docs/PLAYING.md.
  //
  //    The rule still bites where it matters. A screen, a component or anything
  //    else under src/ that reaches for the engine is still a violation: the
  //    simulation is called from exactly one directory, which is the directory
  //    that gets deleted when the server lands.
  const inSrc = /^src\//.test(rel.replace(/\\/g, '/'));
  const isGameHost = /^src\/game\//.test(rel.replace(/\\/g, '/'));
  if (inSrc && !isGameHost) {
    for (const [i, l] of lines.entries()) {
      if (/_shared\/engine/.test(l)) {
        errors.push(`${rel}:${i + 1}: src/ may not import the simulation engine; it runs server-side. `
          + 'Only src/game/ may, and only until the server write path exists.');
      }
    }
  }

  // 7. IP policy
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
