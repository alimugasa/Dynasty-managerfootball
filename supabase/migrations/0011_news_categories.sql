-- 0011 · Constrain the news vocabulary, and index the feed.
--
-- The news table shipped with `category` as free text. The generator emits six
-- categories and the app switches on them, so an unconstrained column means a
-- typo in a future detector reaches the database and then reaches a screen that
-- has no label for it. The check turns that into a failed insert.

alter table public.news
  drop constraint if exists news_category_check;

alter table public.news
  add constraint news_category_check check (category in (
    'UPSET', 'STREAK', 'MILESTONE', 'INJURY', 'HOT_SEAT', 'AWARD_RACE'));

-- The feed reads "this save, this season, most important first, most recent
-- first". news_feed_idx already covers save and season; this covers the sort
-- the news screen actually issues.
create index if not exists news_importance_idx
  on public.news (save_id, season, importance desc, news_id desc);

-- And the per-club and per-player history a profile page reads years later.
create index if not exists news_team_idx
  on public.news (save_id, team_id, season) where team_id is not null;

create index if not exists news_player_idx
  on public.news (save_id, player_id, season) where player_id is not null;

comment on column public.news.category is
  'One of six values, constrained: UPSET, STREAK, MILESTONE, INJURY, HOT_SEAT, AWARD_RACE. Mirrored by NewsCategory in src/domain/news.ts and by the engine''s news module.';
