-- 0029 · What the manager has been shown, and what they have actually done.
--
-- The franchise dashboard opens on a checklist: review the roster, set the
-- depth chart, check the cap, look at the opponent, play the game. It is the
-- first five minutes of a dynasty, and it is worthless if it forgets itself
-- the moment the app is closed -- a checklist that resets is a checklist
-- nobody trusts twice.
--
-- So the marks live on the save rather than in the browser. A dynasty opened
-- on a second device is the same dynasty, and "I have already looked at my
-- roster" is a fact about this franchise's manager, not about this browser.
-- The one thing that does live in localStorage -- which save is open -- is a
-- convenience for a reload; this is not that.
--
-- One jsonb document rather than five columns, for the same reason
-- franchise_settings is one: the marks are read and written together, and a
-- sixth item should not need a migration. The shape is validated in
-- _shared/api/checklist.ts, which refuses an unknown item or an unknown mark
-- rather than storing it, so the CHECK here only has to guarantee an object
-- landed.
--
-- Only what the save cannot work out for itself is stored. Whether a week has
-- been played is a question game_results already answers, and recording it
-- here as well would be a second copy free to disagree with the first.

alter table public.saves
  add column if not exists checklist jsonb;

-- No default and no backfill. An empty object and a null are different facts:
-- null is a save from before the checklist existed, and the screen treats it
-- exactly as it treats a manager who has not tapped anything yet -- which is
-- the same thing, and costs nothing to get right.
alter table public.saves drop constraint if exists saves_checklist_object;
alter table public.saves add constraint saves_checklist_object check (
  checklist is null or jsonb_typeof(checklist) = 'object');

comment on column public.saves.checklist is
  'What the manager has opened and finished on the dashboard checklist. Keys '
  'and marks are those in _shared/api/checklist.ts. Null on a save made before '
  'the checklist existed, which reads the same as one nobody has tapped. Holds '
  'only what the save cannot derive: playing a week is read from game_results.';
