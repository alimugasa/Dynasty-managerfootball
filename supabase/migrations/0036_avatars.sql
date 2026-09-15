-- 0036 · A face for every player.
--
-- Three columns, and the reasoning behind each is worth writing down because
-- two of them look like they could have been avoided.
--
--   avatar_seed       the identity. Everything about a player's face is a pure
--                     function of this, so the face is the same in a roster
--                     row, a draft board, an award and a retirement notice --
--                     and the same after a reload, because nothing is rolled
--                     at render time.
--
--   avatar_overrides  what a commissioner changed by hand, and only that. Kept
--                     apart from the seed so an edited player is still the
--                     generated person plus a decision, rather than a frozen
--                     blob that stops tracking the rest of the system.
--
--   heritage          this league stores no nationality, birthplace or
--                     demographic data at all -- there is nowhere for an
--                     appearance system to read ancestry from. So ancestry is
--                     part of the generated fictional identity rather than a
--                     claim about a nationality the game does not have, and it
--                     is stored rather than re-derived so that a future editor
--                     can set it and so that nothing has to guess.
--
-- The seed could have been derived from player_id without a column at all.
-- Stored instead because a derived identity cannot be edited, cannot survive a
-- player id changing, and cannot be inspected -- and because a face a
-- commissioner can change is one of the things this is for.

alter table public.players
  add column if not exists avatar_seed text,
  add column if not exists avatar_overrides jsonb,
  add column if not exists heritage text[];

-- Every existing player gets a seed now rather than at first render.
--
-- Derived from the save and the player id so the backfill is deterministic:
-- run it twice and every player keeps the face he already had. A random
-- backfill would have given the same player a different face on a rebuilt
-- database, which is exactly the failure the seed exists to prevent.
update public.players
   set avatar_seed = encode(digest(save_id::text || ':' || player_id, 'sha256'), 'hex')
 where avatar_seed is null;

alter table public.players
  alter column avatar_seed set not null;

comment on column public.players.avatar_seed is
  'The player''s visual identity. Every facial characteristic is a pure function of this value, so a face is stable across saves, launches, seasons and screens. Never regenerated at render time.';
comment on column public.players.avatar_overrides is
  'What a commissioner changed by hand, as a sparse object of trait names. Null means nothing was edited -- which is different from an empty object, and reads that way.';
comment on column public.players.heritage is
  'Generated ancestry influences, one or more. This game stores no nationality or birthplace, so this is part of the fictional identity rather than a statement about a real place. Influences probability distributions; never a template.';

-- The seed is what every avatar read joins on.
create index if not exists players_avatar_seed_idx on public.players (save_id, avatar_seed);
