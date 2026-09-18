-- 0027 · The kind of general manager you say you are.
--
-- The Create GM screen asks one optional question beyond the name: how this
-- manager sees the job. Architect builds rosters over years; Talent Scout
-- trusts the draft and development; Negotiator works contracts and trades;
-- Culture Builder manages the room; Strategist lives in the gameplan.
--
-- Nothing in the simulation reads this column yet, and that is deliberate --
-- the screen offers the choice and the save keeps it, so that when the engine
-- does start reading it, every save made from today has an honest answer to
-- give. A choice the player makes and the database then discards would be a
-- control that lies about itself, which is worse than no control.
--
-- It is a fact about the manager rather than about the world, so it sits here
-- with the GM's name and not in the engine document: the screens that show it
-- read it without opening a 12MB save.

alter table public.saves
  add column if not exists gm_style text;

-- No default, and no backfill. A save created before this migration was made
-- by a player who was never asked the question, and "Architect" is an answer
-- they did not give: the screens report it as not recorded. Defaulting it
-- would put a value in the column indistinguishable from a real one.
alter table public.saves drop constraint if exists saves_gm_style_known;
alter table public.saves add constraint saves_gm_style_known check (
  gm_style is null or gm_style in
    ('ARCHITECT', 'TALENT_SCOUT', 'NEGOTIATOR', 'CULTURE_BUILDER', 'STRATEGIST'));

comment on column public.saves.gm_style is
  'How the player said their GM sees the job. One of the five keys in '
  '_shared/api/gmStyles.ts. Null on a save made before the question was asked, '
  'or where the player skipped it; never a placeholder.';
