Dynasty Manager Pro

Mobile-first professional football franchise simulation. React + TypeScript + Vite + Tailwind on the front, Supabase for data and server-side simulation, a calibrated Python engine as the reference implementation.

Repository layout
src/            application code (Phase 1 scaffold; screens arrive in Phase 3)
docs/           architecture decisions, contracts, and the full 640-prompt build plan
supabase/       migrations, seed harness, edge functions
legacy/         FROZEN reference material — engine, seed CSVs, prototype, history
scripts/        architecture lint rules
tests/          unit, component, e2e, and engine-parity harnesses
First run
bash
npm install          # then COMMIT package-lock.json — CI uses `npm ci` and needs it
npm run dev          # open /dev/components to inspect the primitives
npm run preflight    # typecheck + lint + architecture rules + tests
npm run test:e2e     # overflow assertions at 320 / 390 / 768 / 1280
Pushing this to GitHub
bash
git init
git add .
git commit -m "P0001-P0018: Phase 1 scaffold + frozen legacy reference"
git branch -M main
git remote add origin https://github.com/<you>/dynasty-manager-pro.git
git push -u origin main
git tag phase-01-complete && git push --tags

Make the repository private. legacy/ contains the full simulation engine and the complete seed database — the entire competitive substance of the product.

Commit messages carry the prompt number (P0137: wire roster sort to season_stats) so git bisect stays usable when a regression appears forty prompts later. Tag every phase boundary. See docs/PROMPT-BOOK.md.

The three rules
No production file exceeds 400 lines.
No simulation outcome is decided in frontend code.
Missing data is reported, never invented.

Full detail in ARCHITECTURE.md. Invariants that must survive every future change: universal entity routing, regular-season/playoff separation, the ability-dial versus performance-chip geometry, navigation state restoration, and the IP policy.

What exists / what does not

Exists: design tokens extracted verbatim from the prototype; 28 domain interfaces (360 columns) generated from the real schema; the entity routing seam; the competition split enforced at type level; ability/performance components; the missing-data boundary; architecture lint; a deterministic parity golden exporter.

Does not exist yet: database connection, screens, navigation implementation, simulation, save system. The runtime tables (save state, calendar, results, standings, season statistics, grades, awards, transactions, news) are specified in Prompt 0038.
