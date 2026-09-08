// One HTML file: the engine, the world and the interface, with nothing to fetch.
//
//   node scripts/playtest/build.ts
//
// The product is a client that reads rows a server wrote. This is the test rig
// for it -- the same engine, the same components, the same tokens, hosted in
// the page so the game can be played on a phone. It is built from scripts/,
// ships nothing into src/, and is not the deployable path.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const here = join(root, 'scripts', 'playtest');

execFileSync('npx', ['vite', 'build', '--config', join(here, 'vite.config.ts')], {
  cwd: root, stdio: 'inherit',
});

const js = readFileSync(join(here, 'dist', 'playtest.js'), 'utf8');
const tokens = readFileSync(join(root, 'src', 'app', 'tokens.css'), 'utf8');
const base = readFileSync(join(root, 'src', 'app', 'base.css'), 'utf8');

// The page commits to one look: the product's night press box. Both grounds are
// painted explicitly so it holds whatever theme the viewer's host is in.
const html = `<title>Dynasty Manager Pro</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Inter:wght@400;500;600&display=swap">
<style>
${tokens}
${base}
html, body {
  background: var(--ink);
  color: var(--tx);
  font-family: var(--f-ui);
  color-scheme: dark;
  margin: 0;
  min-height: 100%;
  overflow-x: hidden;
}
#dmp-playtest { min-height: 100vh; }
.dmp-boot {
  padding: 28vh 24px 0;
  text-align: center;
  color: var(--mut);
  font-family: var(--f-ui);
  font-size: 14px;
}
.dmp-boot strong {
  display: block;
  font-family: var(--f-disp);
  font-size: 30px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--tx);
  margin-bottom: 6px;
}
</style>
<div id="dmp-playtest"><div class="dmp-boot"><strong>Dynasty Manager Pro</strong>Loading the league…</div></div>
<script>
${js}
</script>
`;

const out = join(here, 'playtest.html');
writeFileSync(out, html);
process.stdout.write(`${out} ${String(Math.round(html.length / 1024))}KB\n`);
