-- Every player gets a face, including the ones who do not exist yet.
--
-- 0036 added players.avatar_seed NOT NULL and backfilled every row that
-- existed. What it did not do is say anything about the rows that arrive
-- afterwards -- and a draft class arrives every rollover, through the one
-- insert in project/players.ts, which knew nothing about a column that was not
-- there when it was written. The first season rollover after 0036 therefore
-- failed outright on the not-null constraint. The API suite caught it; nothing
-- in the avatar code could have, because the avatar code is never on that path.
--
-- The fix is a trigger rather than a column added to that insert, for the
-- reason this project has now learned three times with roster moves: a value
-- that must always be set is safest when exactly one thing sets it. An insert
-- site is a place to forget; a trigger is not, and a second insert site added
-- next year inherits the rule for free.
--
-- The formula is 0036's backfill verbatim. A seed is a hash of the save and
-- the player, so it is a derivation rather than a default -- it does not
-- invent a value that could be mistaken for a real one, it computes the only
-- value this row could have. A commissioner who sets a seed explicitly keeps
-- it: the trigger only fills a NULL.

create or replace function public.players_avatar_seed()
returns trigger
language plpgsql
as $$
begin
  if new.avatar_seed is null then
    new.avatar_seed := encode(
      digest(new.save_id::text || ':' || new.player_id, 'sha256'), 'hex');
  end if;
  return new;
end;
$$;

drop trigger if exists players_avatar_seed_trg on public.players;
create trigger players_avatar_seed_trg
  before insert on public.players
  for each row
  execute function public.players_avatar_seed();
