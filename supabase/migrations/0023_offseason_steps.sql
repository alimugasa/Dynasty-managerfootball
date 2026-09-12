-- 0023 · An offseason a manager plays through rather than watches.
--
-- The engine's offseason was one call: press the button, read what happened.
-- It is now five stages, and between two of them the browser can be closed for
-- a week. That needs somewhere to keep what the manager has decided but not
-- yet committed -- the free-agency offers he has made, the draft order the
-- draft opened with, the pick it is waiting on.
--
-- It lives beside the engine document rather than in it: none of it is league
-- state. The document is what the league is; this is what the manager is in
-- the middle of doing to it, and it is discarded when the offseason ends.
alter table public.save_documents
  add column if not exists offseason jsonb;

comment on column public.save_documents.offseason is
  'Decisions in flight during a stepped offseason: free-agency offers, the draft order and the pick it is waiting on. Null outside an offseason. Not league state -- the document is.';

-- The draft's own record. draft_picks already holds the slots; a pick made by
-- the manager rather than by the engine is marked so a later screen can say
-- which ones were his.
alter table public.draft_picks
  add column if not exists made_by_user boolean not null default false;

comment on column public.draft_picks.made_by_user is
  'True for a pick the manager made himself in a stepped draft.';
