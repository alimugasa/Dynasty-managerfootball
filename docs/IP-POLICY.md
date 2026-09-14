# Intellectual Property Policy

This game ships commercially. Every name in the database is original; only real
metropolitan area names are used, since city names are not trademarks.

## Prohibited, without exception

- Real league names or abbreviations, and real championship or all-star event names.
- Real honour and selection names. This league votes on its own **all-league**
  first and second teams and picks its own **all-star** rosters; the real
  league's names for those are denied in `scripts/lint-arch.mjs`.
- Real team names, nicknames, marks, logos, wordmarks, or colour schemes presented
  as an official identity.
- Real player, coach, owner or executive names.
- Real player likenesses, photographs or derived portraits.
- Real stadium sponsorship names.
- Copyrighted broadcast or publisher terminology, including competing franchise
  titles in this genre.

## How the league is structured, and named

Thirty-two clubs, two conferences, four divisions each, four clubs a division.
The conferences are the **Atlas Conference** (AC) and the **Frontier
Conference** (FC); the divisions are East, North, South and West within each.
`supabase/functions/_shared/api/leaguePlacing.ts` is the only place a label is
built from those parts, and `LEAGUE_SHAPE` there is checked against the rows by
`tests/api/leagueStructure.test.ts`.

The conferences shipped under two other names until migration `0031`, each one
word away from a real league's. Nothing caught it for months, because they
lived in a seed CSV and the denylist reads source. Both spellings are on the
denylist now, and the structure test reads the rows rather than the files. The
lesson generalises: **data is a surface too.**

The ids are not the names. `conference_id` is still `'AC'` and `'NC'` -- they
are foreign keys across five tables and renaming them buys nothing a player can
see -- so `'NC'` is the id of the Frontier Conference, whose abbreviation is
`'FC'`. Nothing may derive a label from an id.

## How team identity is expressed instead

Metro area + original nickname + the two colours stored on the `teams` table
(`primary_color`, `secondary_color`). Marks are generated procedurally as geometric
badges or wordmarks from those two colours and the team abbreviation. Generated
marks are acceptable; imitations of real marks are not.

## Icons and fonts

Every icon is original or carries a permissive licence explicitly allowing
commercial use in a paid application. Record the licence here when the set is
chosen (Prompt 0073). Fonts: Barlow Condensed and Inter, both SIL Open Font
License, which permits commercial embedding.

## Enforcement

`scripts/lint-arch.mjs` carries a denylist of real franchise nicknames and league
marks and fails the build if any appears in `src/`, `scripts/`, `tests/`, or an
asset filename. `legacy/` is excluded — it is frozen reference material.

Verify the rule fires by placing a real franchise nickname in a source file, running
`npm run lint:arch`, and confirming the failure before removing it.
