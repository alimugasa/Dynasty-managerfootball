-- 0014 · snaps is unknown, not zero.
--
-- The engine does not fill PlayerStatLine.snaps: boxScore.ts creates every
-- line with snaps: 0 and nothing increments it (measured: 0 for every player in
-- every game of a 272-game season). Both season tables declared the column
-- NOT NULL DEFAULT 0, so the first write of real seasons would have stored a 0
-- that is indistinguishable from a genuine zero and poisons history for good:
-- no later backfill can tell "did not play" from "not recorded".
--
-- NULL is honest and backfillable. The columns become nullable with no default,
-- the write path stores NULL until the engine emits the number, and the day it
-- does, a backfill can fill exactly the rows that are NULL and no others.

alter table public.player_season_stats
  alter column snaps drop default,
  alter column snaps drop not null;

alter table public.player_season_grades
  alter column snaps drop default,
  alter column snaps drop not null;

-- Rows written before this migration under the old default are the ambiguous
-- case this change exists to prevent. There are none in any deployed database
-- (no write path existed), so they are set to NULL rather than left as a 0 the
-- comment above says must never be trusted.
update public.player_season_stats  set snaps = null where snaps = 0;
update public.player_season_grades set snaps = null where snaps = 0;

comment on column public.player_season_stats.snaps is
  'NULL until the engine emits snap counts (see the TODO in engine/boxScore.ts). A stored 0 is a real zero; unknown is NULL.';
comment on column public.player_season_grades.snaps is
  'NULL until the engine emits snap counts (see the TODO in engine/boxScore.ts). A stored 0 is a real zero; unknown is NULL.';
