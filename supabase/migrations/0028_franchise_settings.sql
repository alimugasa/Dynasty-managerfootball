-- 0028 · The rules a franchise is played under.
--
-- Eight settings the player chooses before the dynasty is created: how often
-- players get hurt, whether the cap is enforced, how hard trades are, how
-- strong draft classes come out, how fast players develop, how much of a
-- prospect's rating is visible, whether other clubs' games sim themselves, and
-- whether the editing tools are unlocked.
--
-- Stored as one jsonb document rather than eight columns. They are read and
-- written together -- a franchise is played under all of them at once -- and a
-- ninth setting should not need a migration to add. The shape is validated in
-- _shared/api/franchiseOptions.ts, which refuses an unknown key or an unknown
-- value rather than storing it, so the CHECK here only has to guarantee that
-- what landed is an object.
--
-- NOTHING IN THE SIMULATION READS THIS COLUMN YET. It is stored because the
-- screen asks for it, and a question the save discards is a question that
-- should not have been asked. The screen says as much on itself: these settings
-- promise specific behaviour, and a promise the engine does not keep is worse
-- than an absent control.

alter table public.saves
  add column if not exists franchise_settings jsonb;

-- No default and no backfill. A save created before this migration was made by
-- a player who was never asked, and the Normal preset is an answer they did not
-- give: the screens report it as not recorded. Defaulting it would put a value
-- in the column indistinguishable from a real one.
alter table public.saves drop constraint if exists saves_franchise_settings_object;
alter table public.saves add constraint saves_franchise_settings_object check (
  franchise_settings is null or jsonb_typeof(franchise_settings) = 'object');

comment on column public.saves.franchise_settings is
  'The eight rules the franchise is played under, as chosen on Franchise '
  'Settings. Keys and values are those in _shared/api/franchiseOptions.ts. '
  'Null on a save made before the question was asked; never a placeholder. '
  'Not read by the simulation yet.';
