-- 0030 · Read state on a story, and the five categories the franchise writes.
--
-- Read state is one nullable timestamp rather than a boolean: null means nobody
-- has opened it, and a time says when they did. That is the only shape that
-- lets a row written before this migration and a row nobody has read be the
-- same fact, which they are -- so there is no backfill, and no default that
-- would make an unread story indistinguishable from one marked read at the
-- moment it was written (ARCHITECTURE.md rule 3).
--
-- Read state is the player's, not the world's. The engine never looks at it,
-- no simulation turns on it, and clearing it changes nothing about the save
-- beyond which dots the feed draws.

alter table public.news
  add column if not exists read_at timestamptz;

-- "How many are unread" is asked every time the tab opens, and is answered
-- from this index rather than from a scan of the season.
create index if not exists news_unread_idx
  on public.news (save_id, season)
  where read_at is null;

-- The vocabulary widens rather than opening up. 0011 constrained it because an
-- unconstrained column lets a typo in a future detector reach a screen with no
-- label for it, and that is still true; these five are the stories the front
-- office writes about itself, which the engine's weekly detectors do not cover.
--
--   FRANCHISE  a change in who runs the club
--   OWNER      what the man upstairs has asked for
--   CAMP       the calendar: camp, preseason, the season opening
--   MATCHUP    the week ahead, before it is played
--   RESULT     the club's own game, after it is
alter table public.news
  drop constraint if exists news_category_check;

alter table public.news
  add constraint news_category_check check (category in (
    'UPSET', 'STREAK', 'MILESTONE', 'INJURY', 'HOT_SEAT', 'AWARD_RACE',
    'FRANCHISE', 'OWNER', 'CAMP', 'MATCHUP', 'RESULT'));

comment on column public.news.category is
  'One of eleven values, constrained: the engine''s six (UPSET, STREAK, MILESTONE, INJURY, HOT_SEAT, AWARD_RACE) and the front office''s five (FRANCHISE, OWNER, CAMP, MATCHUP, RESULT). Mirrored by NewsCategory in the engine''s news module and by FRANCHISE_CATEGORIES in the API''s franchiseNews module.';

comment on column public.news.read_at is
  'When the player opened this story, or null if they have not. Null is also what a row written before 0030 reads as, which is the same fact.';
