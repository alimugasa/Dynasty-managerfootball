# Intellectual Property Policy

This game ships commercially. Every name in the database is original; only real
metropolitan area names are used, since city names are not trademarks.

## Prohibited, without exception

- Real league names or abbreviations, and real championship or all-star event names.
- Real team names, nicknames, marks, logos, wordmarks, or colour schemes presented
  as an official identity.
- Real player, coach, owner or executive names.
- Real player likenesses, photographs or derived portraits.
- Real stadium sponsorship names.
- Copyrighted broadcast or publisher terminology, including competing franchise
  titles in this genre.

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
