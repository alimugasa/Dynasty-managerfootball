-- 0025 · Save slots, and the manager whose name is on the save.
--
-- A dynasty had no way in and no way back out. The client opened whichever
-- save had been touched most recently, which is a reasonable guess and not an
-- answer: a player with two dynasties could not choose between them, and a
-- player with none had to find the club list on a game screen that had no game
-- behind it yet.
--
-- So a save now sits in a numbered slot the player picks, and carries the name
-- of the general manager who runs it. Both are facts about the save file rather
-- than about the world, which is why they live here and not in the engine
-- document: the slot screen has to read them without opening a 12MB save.
--
-- Two columns and a number. Nothing else was asked for and nothing else is
-- added: no difficulty, no traits, no avatar, no start date. A new game always
-- opens at week 1 of the regular season, which create-save already did.

alter table public.saves
  add column if not exists slot           smallint,
  add column if not exists gm_first_name  text,
  add column if not exists gm_last_name   text;

-- Existing saves are given slots in the order they were created. A slot is an
-- ordering the player chooses, not a fact about the world, so assigning one to
-- a save made before slots existed invents nothing -- unlike a GM name, which
-- is left null below because nobody ever entered one.
with numbered as (
  select id, row_number() over (partition by user_id order by created_at, id) as n
    from public.saves
   where not is_template and slot is null
)
update public.saves s set slot = numbered.n
  from numbered where numbered.id = s.id;

-- The template world is owned by nobody and sits in no slot. Every player save
-- has one, because create-save assigns the lowest free slot when the caller
-- names none.
--
-- Deferred, and therefore a constraint trigger rather than a CHECK: create_save()
-- inserts the row and then clones 25,000 rows of world under it, and the slot is
-- written by the handler that called it. A CHECK fires on the INSERT, which
-- would mean teaching a hundred-line cloning function about a column that has
-- nothing to do with cloning. Postgres cannot defer a CHECK; it can defer this,
-- so the rule is stated where it is actually meant -- at commit.
-- Dropped in this order because a constraint trigger owns a constraint of the
-- same name: the trigger goes first, and the ALTER then catches a plain CHECK
-- left by an earlier run of this file.
drop trigger if exists saves_slot_presence on public.saves;
alter table public.saves drop constraint if exists saves_slot_presence;

-- A save inserted without a slot takes the lowest free one. create_save() knows
-- nothing about slots -- it clones a world -- and everything that calls it
-- directly (the RLS suite, a psql session) would otherwise create a save that
-- is not in any file. The handler still names the file the player picked; this
-- only fills the gap when nobody did.
create or replace function app.saves_default_slot()
returns trigger language plpgsql as $fn$
declare
  v_slot smallint;
begin
  if new.is_template or new.slot is not null then
    return new;
  end if;
  select coalesce(min(s), 1) into v_slot
    from generate_series(1, (
      select count(*) + 1 from public.saves
       where user_id = new.user_id and not is_template
    )::int) as s
   where not exists (
     select 1 from public.saves
      where user_id = new.user_id and not is_template and slot = s
   );
  new.slot := v_slot;
  return new;
end;
$fn$;

drop trigger if exists saves_default_slot on public.saves;
create trigger saves_default_slot
  before insert on public.saves
  for each row execute function app.saves_default_slot();

-- The row is re-read rather than taken from NEW. A deferred constraint trigger
-- runs at commit but carries the row as the triggering statement left it, so
-- NEW.slot is still the null the INSERT wrote even after the handler has filled
-- it in. Reading the table is the only way to ask what is actually about to be
-- committed. A row deleted later in the same transaction is simply not there,
-- which is why this is EXISTS and not NOT FOUND.
create or replace function app.saves_require_slot()
returns trigger language plpgsql as $fn$
begin
  if exists (
    select 1 from public.saves
     where id = new.id and not is_template and slot is null
  ) then
    raise exception 'save % is not in a save file (slot is null)', new.id
      using errcode = 'check_violation';
  end if;
  return null;
end;
$fn$;

create constraint trigger saves_slot_presence
  after insert or update on public.saves
  deferrable initially deferred
  for each row execute function app.saves_require_slot();

alter table public.saves drop constraint if exists saves_slot_check;
alter table public.saves add constraint saves_slot_check check (slot is null or slot >= 1);

-- One save per slot per player. This is the constraint the slot screen's whole
-- promise rests on, so it is an index and not a check in application code: two
-- tabs starting a new game in the same slot at the same moment is exactly the
-- race a pre-flight query cannot see.
create unique index if not exists saves_user_slot
  on public.saves (user_id, slot) where not is_template;

-- A GM has both names or neither. Neither is what a save made before this
-- migration has, and the screens report that rather than inventing a name --
-- there is no such person as "Unknown Unknown".
alter table public.saves drop constraint if exists saves_gm_name_pair;
alter table public.saves add constraint saves_gm_name_pair check (
  (gm_first_name is null and gm_last_name is null)
  or (length(btrim(gm_first_name)) > 0 and length(btrim(gm_last_name)) > 0));

comment on column public.saves.slot is
  'The save file the player chose, 1-based. Unique per player. Null on the template only.';
comment on column public.saves.gm_first_name is
  'The general manager the player named at creation. Null on a save made before slots existed; never a placeholder.';
comment on column public.saves.gm_last_name is
  'See gm_first_name. Both names are present or both are absent.';
