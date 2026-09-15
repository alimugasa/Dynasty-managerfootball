-- 0034 · A category for the stories the wire writes.
--
-- news_category_check has carried a TRANSACTIONS chip with nothing behind it
-- since the News tab was built, and newsFilters.ts says so in as many words:
-- "Trades, signings and releases are not written to the feed yet." The waiver
-- wire is the first thing in this game that moves a player between clubs
-- during a season anybody is watching, so the chip stops being a promise.
--
-- One category rather than three. A claim, a signing and a release are the
-- same kind of news to a reader -- somebody changed clubs -- and the story
-- itself says which it was. Three categories would put three chips on a tab
-- that already has seven.

alter table public.news drop constraint if exists news_category_check;
alter table public.news add constraint news_category_check
  check (category in (
    'UPSET', 'STREAK', 'MILESTONE', 'INJURY', 'HOT_SEAT', 'AWARD_RACE',
    'FRANCHISE', 'OWNER', 'CAMP', 'MATCHUP', 'RESULT', 'TRANSACTION'));
