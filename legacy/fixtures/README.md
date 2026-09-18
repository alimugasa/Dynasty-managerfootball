# Fixtures

`snapshot-2031.json` — extracted verbatim from the `<script id="gamedata">` block
in `legacy/ui/index.html`. **This is a test fixture and a reference for what correct
output looks like. It is not application data.** The application reads from
Supabase and never from this file.

Contents: season 2031, `userTeam` "DEN", 32 teams, 284 player career profiles
including retired players.

## Defects present in this export

Counted from the fixture itself:

- **86 profiles** carry `"ovr": null, "age": null` — P-prefixed engine-generated
  players with no corresponding row in the seed CSVs.
- **19 profiles** carry `"team": ""` — retired or unsigned players.
- **`longest_fg` ranges 0 to 720** — a longest single field goal cannot be 720
  yards. Season sums are being written into a field meant to hold one attempt.

These are defects in the engine's export path (`stats.py` / `export_history.py`).
Fix them at the source. Patching them in the interface would hide the defect
rather than remove it, and would put a fabricated number on screen.
