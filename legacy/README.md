# legacy/ — frozen reference material

Nothing here is imported by application code. Nothing here is linted, formatted or
bundled. **Nothing in `legacy/engine/` may be modified, deleted or refactored at any
point in this project** — it is the calibrated reference implementation that the
Phase 6 TypeScript port is tested against.

```
engine/      17 Python files, 2,753 lines — the simulation, byte-identical to the
             original upload. Its hardcoded DB path is redirected at runtime by
             parity/export_goldens.py, not edited on disk.
seed/        28 CSVs (~25,200 rows) + schema_supabase.sql
generators/  1,708 lines — world creation
history/     16 exported CSVs, ~40,000 rows, 6 validated seasons
ui/          index.html — the 638KB prototype. Do not modify.
fixtures/    snapshot-2031.json, extracted verbatim from the prototype's
             <script id="gamedata"> block. A TEST FIXTURE, not application data.
parity/      golden exporter + goldens/ for the Phase 6 port
```
