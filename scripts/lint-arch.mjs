#!/usr/bin/env node
// Architecture rules from Phase 1. These are hard constraints, not style
// preferences. legacy/ is exempt: it is frozen reference material containing
// Python and one deliberately monolithic 638KB HTML file.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT = process.cwd();
const MAX_LINES = 400;
const SCAN = ['src', 'scripts', 'tests', 'supabase/functions'];
// The IP policy is checked more widely than the architecture: migrations,
// docs, the seed and its fixtures ship the words the client shows.
const IP_SCAN = [...SCAN, 'supabase/migrations', 'supabase/tests', 'docs', 'legacy', 'index.html', 'README.md', 'ARCHITECTURE.md'];
const IP_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.css', '.sql', '.md', '.json', '.csv', '.html', '.txt']);
const errors = [];

// Real franchise nicknames and league marks. See docs/IP-POLICY.md.
const IP_DENY = [
  'chiefs','patriots','packers','steelers','cowboys','49ers','niners','ravens',
  'bengals','browns','texans','colts','jaguars','titans','broncos','raiders',
  'chargers','bills','dolphins','jets','eagles','commanders','giants','bears',
  'lions','vikings','falcons','panthers','saints','buccaneers','cardinals',
  'rams','seahawks','nfl','super bowl','pro bowl','madden',
  // Round and trophy names, which are another league's as much as its marks.
  'wild card','wildcard','wild-card','wild_card','divisional round','lombardi','afc','nfc',
  // Honour names. docs/IP-POLICY.md bans real all-star and championship event
  // names without exception, and an all-league selection called all-pro is one
  // of those however generic the words look on their own. This league votes on
  // its own all-league teams and picks its own all-star rosters.
  'all-pro','all pro','allpro','pro-bowl','probowl',
];

// Allowed uses of a denied term, scoped to one file and one term with a
// reason. Anything not listed here fails; adding a line here is a review.
import { readFileSync as readAllow } from 'node:fs';
const IP_ALLOW = JSON.parse(readAllow(join(ROOT, 'scripts', 'lint-arch.allow.json'), 'utf8'));

function walk(dir, out = [], skipLegacy = true) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
    if (skipLegacy && name === 'legacy') continue;
    if (statSync(p).isDirectory()) walk(p, out, skipLegacy);
    else out.push(p);
  }
  return out;
}

const files = SCAN.flatMap((d) => {
  try { return walk(join(ROOT, ...d.split('/'))); } catch { return []; }
});

const ipFiles = [...new Set(IP_SCAN.flatMap((d) => {
  const p = join(ROOT, ...d.split('/'));
  try { return statSync(p).isDirectory() ? walk(p, [], false) : [p]; } catch { return []; }
}))].filter((p) => IP_EXTENSIONS.has(extname(p)))
  // The denylist and its allowlist name the terms by definition; scanning
  // them finds every term in them, every time.
  .filter((p) => !['scripts/lint-arch.mjs', 'scripts/lint-arch.allow.json']
    .includes(relative(ROOT, p).replace(/\\/g, '/')));

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
  //    that true is for the engine never to reach the bundle at all. The
  //    simulation runs in the handlers under _shared/api/, and the client reads
  //    the rows they wrote. There is no exception: the src/game/ host that once
  //    held one is gone.
  //
  //    The same goes for legacy/. The seed CSVs are loaded by the importer into
  //    Postgres and reach the client as rows; a bundle that carried them would
  //    be a second copy of the world, and vite.config.ts promises it never does.
  const inSrc = /^src\//.test(rel.replace(/\\/g, '/'));
  if (inSrc) {
    for (const [i, l] of lines.entries()) {
      if (isComment(l)) continue;
      if (/_shared\/engine/.test(l)) {
        errors.push(`${rel}:${i + 1}: src/ may not import the simulation engine; it runs server-side.`);
      }
      if (/from\s+['"][^'"]*\/legacy\//.test(l)) {
        errors.push(`${rel}:${i + 1}: src/ may not import legacy/; the seed reaches the client through Postgres.`);
      }
    }
  }

  // 6b. The dev transport is a shim: route, parse, call the shared handler,
  //     serialize. Zero SQL and zero engine imports, so that every handler is
  //     forced to live in _shared/api/ where the edge function imports it too.
  //     A shim that could run a query or a simulation is a second data path
  //     waiting to happen.
  if (rel.replace(/\\/g, '/') === 'scripts/dev-api.ts') {
    for (const [i, l] of lines.entries()) {
      if (isComment(l)) continue;
      if (/_shared\/engine/.test(l)) {
        errors.push(`${rel}:${i + 1}: dev-api.ts may not import the engine; it is a transport shim.`);
      }
      if (/\b(select|insert|update|delete|create|alter|drop)\b[\s\S]*\b(from|into|table|set|where)\b/i.test(l)
          || /\bsql`/.test(l)) {
        errors.push(`${rel}:${i + 1}: dev-api.ts may not contain SQL; put it in a handler under _shared/api/.`);
      }
    }
  }

}

// 7. IP policy, over everything that ships a word: code, migrations, docs, the
//    seed. A term is allowed only where scripts/lint-arch.allow.json names the
//    file, the term and the reason.
for (const file of ipFiles) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  const text = readFileSync(file, 'utf8');
  const lower = (rel + '\n' + text).toLowerCase();
  const allowed = new Set((IP_ALLOW[rel] ?? []).map((a) => a.term));
  for (const term of IP_DENY) {
    if (allowed.has(term)) continue;
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    const m = re.exec(lower);
    if (m !== null) {
      const line = lower.slice(0, m.index).split('\n').length - 1;
      errors.push(`${rel}:${line}: contains "${term}" — violates docs/IP-POLICY.md.`);
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
