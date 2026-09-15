-- 0012 · Pre-aggregated season summaries, and the indexes the screens read by.
--
-- A fifty-season save holds roughly 300,000 statistical rows (measured: see
-- docs/PERFORMANCE.md). Nothing in the schema was wrong for one season and
-- several things were wrong for fifty, all of the same shape: a screen that
-- wants one summary number had no way to get it without reading every row that
-- number was computed from.
--
-- Three separate problems, and they need three different answers. Adding a
-- table where an index would do is as much a mistake as the reverse.
--
--   1. Aggregates over history. "This club's fifty-year record", "this player's
--      career totals". Unbounded by construction: the work grows with the age of
--      the save, every time the screen opens. These get summary tables.
--   2. Ordered reads of one season. Leaderboards, standings, a week's fixtures.
--      Already bounded by a WHERE on season; they need the right index so the
--      sort does not read the whole season and discard it.
--   3. Long lists. Transactions, news, a roster. Bounded only by paging, which
--      is the data layer's job (src/data/), not the schema's. What the schema
--      owes them is an index whose order matches the page order, so that
--      keyset pagination can seek instead of counting.
--
-- The summary tables here are DERIVED. They are not a second source of truth:
-- every column is a fold of rows that remain in place, and refresh_* functions
-- rebuild them from those rows. If a summary ever disagrees with its source,
-- the source wins and the summary is rebuilt. They are written by the server on
-- the season rollover, which is the only moment their inputs change.

-- ---------------------------------------------------------- team_season_summary
-- One row per club per season: what the club did that year, already folded.
--
-- The read this exists for is a club's history page, which shows fifty rows and
-- previously had to touch 288 game_results rows per season to build each one --
-- 14,400 rows scanned to display 50. Standings already holds the win-loss
-- record, so this table deliberately does NOT duplicate it; it holds the
-- per-game aggregates that only game_results can answer.
create table if not exists public.team_season_summary (
  save_id      uuid not null references public.saves (id) on delete cascade,
  season       integer not null,
  team_id      text not null,
  competition  text not null,

  games        integer not null default 0,
  points_for   integer not null default 0,
  points_against integer not null default 0,
  pass_yards   integer not null default 0,
  rush_yards   integer not null default 0,
  yards_allowed integer not null default 0,
  turnovers    integer not null default 0,

  -- Per-game rates, stored rather than computed on read. ARCHITECTURE.md rule 2
  -- keeps derived football numbers out of frontend code, and storing them means
  -- the club page and the league table cannot disagree about the same season.
  points_per_game numeric,
  yards_per_game  numeric,

  primary key (save_id, season, team_id, competition),
  foreign key (save_id, team_id)
    references public.teams (save_id, team_id) on delete cascade,
  constraint tss_competition_check check (competition in ('REGULAR','PLAYOFF'))
);

-- The club history read: one club, every season, newest first.
create index if not exists tss_team_idx
  on public.team_season_summary (save_id, team_id, season desc);

-- ---------------------------------------------------------- player_career_totals
-- One row per player: every season folded into a career line.
--
-- The worst unbounded read in the schema before this table existed. A player
-- page showed career totals by summing player_season_stats for that player,
-- which is fine at season three and reads twenty-odd rows at season fifty --
-- but the career leaderboards ("most passing yards, all time") summed the whole
-- table, 300,000 rows, to rank 1,700 players. That is the query that does not
-- survive a long save.
--
-- seasons_played is stored because "how many years did he play" is otherwise a
-- count over the same rows this table exists to avoid reading.
create table if not exists public.player_career_totals (
  save_id      uuid not null references public.saves (id) on delete cascade,
  player_id    text not null,
  competition  text not null,

  first_season integer,
  last_season  integer,
  seasons_played integer not null default 0,
  games_played integer not null default 0,
  games_started integer not null default 0,

  pass_att integer not null default 0, completions integer not null default 0,
  pass_yards integer not null default 0, pass_tds integer not null default 0,
  interceptions integer not null default 0,
  rushes integer not null default 0, rush_yards integer not null default 0,
  rush_tds integer not null default 0,
  targets integer not null default 0, receptions integer not null default 0,
  rec_yards integer not null default 0, rec_tds integer not null default 0,
  tackles integer not null default 0, sacks numeric not null default 0,

  -- Career averages of a per-season judgement. Not a fold of the stat columns.
  best_grade   numeric,
  mean_grade   numeric,

  primary key (save_id, player_id, competition),
  foreign key (save_id, player_id)
    references public.players (save_id, player_id) on delete cascade,
  constraint pct_competition_check check (competition in ('REGULAR','PLAYOFF'))
);

-- The career record book, one index per column it can be ordered by. Partial on
-- a non-zero value: a career leaderboard for passing yards has no interest in
-- the 1,600 players who never threw a pass, and excluding them keeps each index
-- small enough to stay in cache.
create index if not exists pct_pass_yards_idx
  on public.player_career_totals (save_id, competition, pass_yards desc)
  where pass_yards > 0;
create index if not exists pct_rush_yards_idx
  on public.player_career_totals (save_id, competition, rush_yards desc)
  where rush_yards > 0;
create index if not exists pct_rec_yards_idx
  on public.player_career_totals (save_id, competition, rec_yards desc)
  where rec_yards > 0;
create index if not exists pct_sacks_idx
  on public.player_career_totals (save_id, competition, sacks desc)
  where sacks > 0;

-- ------------------------------------------------------------------- indexes
-- Ordered reads of one season, and pages of long lists.

-- Leaderboards other than passing. pss_leaderboard_idx covers pass_yards only,
-- so every other category sorted the season's 1,700 rows on read.
create index if not exists pss_rush_leaders_idx
  on public.player_season_stats (save_id, season, competition, rush_yards desc)
  where rush_yards > 0;
create index if not exists pss_rec_leaders_idx
  on public.player_season_stats (save_id, season, competition, rec_yards desc)
  where rec_yards > 0;
create index if not exists pss_sack_leaders_idx
  on public.player_season_stats (save_id, season, competition, sacks desc)
  where sacks > 0;

-- A club's roster stat lines for one season, which the team page reads on every
-- open. pss_team_idx leads with season, so "this club, this season" is covered,
-- but "this club, every season" -- the club's all-time roster -- was not.
create index if not exists pss_team_history_idx
  on public.player_season_stats (save_id, team_id, season desc)
  where team_id is not null;

-- The transaction feed, in the order the feed actually reads it.
--
-- transactions_feed_idx is (save_id, season, transaction_id desc). Read
-- backward that yields season descending but transaction_id ASCENDING within
-- each season, which is not the feed's order -- so Postgres read all 901 rows
-- of the newest season and re-sorted them to return five. A mixed-direction
-- composite only serves a read whose directions match it exactly.
create index if not exists transactions_feed_desc_idx
  on public.transactions (save_id, season desc, transaction_id desc);

-- The fixture list, by club. game_results_week_idx serves "week N of season S";
-- a club's own schedule had no index and scanned the season.
create index if not exists game_results_home_idx
  on public.game_results (save_id, home_team_id, season, week);
create index if not exists game_results_away_idx
  on public.game_results (save_id, away_team_id, season, week);

-- ------------------------------------------------------------------ refresh
-- Rebuild from source. Called by the server at season rollover, and safe to
-- call at any time: they are a full recompute for one season, not an increment,
-- so a summary can never drift from the rows it summarises.

create or replace function public.refresh_team_season_summary(
  p_save_id uuid, p_season integer
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $fn$
  delete from public.team_season_summary
   where save_id = p_save_id and season = p_season;

  insert into public.team_season_summary (
    save_id, season, team_id, competition, games, points_for, points_against,
    pass_yards, rush_yards, yards_allowed, turnovers,
    points_per_game, yards_per_game)
  select v.save_id, v.season, v.team_id, v.competition,
         count(*),
         sum(v.points_for), sum(v.points_against),
         sum(coalesce(v.pass_yards, 0)), sum(coalesce(v.rush_yards, 0)),
         0, sum(coalesce(v.turnovers, 0)),
         round(sum(v.points_for)::numeric / greatest(count(*), 1), 2),
         round((sum(coalesce(v.pass_yards, 0)) + sum(coalesce(v.rush_yards, 0)))::numeric
               / greatest(count(*), 1), 2)
    from public.v_team_game_stats v
   where v.save_id = p_save_id and v.season = p_season
   group by v.save_id, v.season, v.team_id, v.competition;
$fn$;

create or replace function public.refresh_player_career_totals(p_save_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $fn$
  delete from public.player_career_totals where save_id = p_save_id;

  insert into public.player_career_totals (
    save_id, player_id, competition, first_season, last_season, seasons_played,
    games_played, games_started, pass_att, completions, pass_yards, pass_tds,
    interceptions, rushes, rush_yards, rush_tds, targets, receptions, rec_yards,
    rec_tds, tackles, sacks, best_grade, mean_grade)
  select s.save_id, s.player_id, s.competition,
         s.first_season, s.last_season, s.seasons_played,
         s.games_played, s.games_started,
         s.pass_att, s.completions, s.pass_yards, s.pass_tds,
         s.interceptions, s.rushes, s.rush_yards, s.rush_tds,
         s.targets, s.receptions, s.rec_yards, s.rec_tds,
         s.tackles, s.sacks,
         g.best_grade, g.mean_grade
    from (
      select save_id, player_id, competition,
             min(season) as first_season, max(season) as last_season,
             count(*) as seasons_played,
             sum(games_played) as games_played, sum(games_started) as games_started,
             sum(pass_att) as pass_att, sum(completions) as completions,
             sum(pass_yards) as pass_yards, sum(pass_tds) as pass_tds,
             sum(interceptions) as interceptions,
             sum(rushes) as rushes, sum(rush_yards) as rush_yards,
             sum(rush_tds) as rush_tds,
             sum(targets) as targets, sum(receptions) as receptions,
             sum(rec_yards) as rec_yards, sum(rec_tds) as rec_tds,
             sum(tackles) as tackles, sum(sacks) as sacks
        from public.player_season_stats
       where save_id = p_save_id
       group by save_id, player_id, competition
    ) s
    -- Grades are aggregated once and joined, not fetched per player. Written
    -- first as a lateral subquery, this function took 53 seconds on a
    -- fifty-season save: a correlated aggregate per group is an N+1 that
    -- happens to be spelled in SQL.
    left join (
      select save_id, player_id, competition,
             max(grade) as best_grade, round(avg(grade), 1) as mean_grade
        from public.player_season_grades
       where save_id = p_save_id
       group by save_id, player_id, competition
    ) g
      on g.save_id = s.save_id
     and g.player_id = s.player_id
     and g.competition = s.competition;
$fn$;

revoke all on function public.refresh_team_season_summary(uuid, integer) from public, anon, authenticated;
revoke all on function public.refresh_player_career_totals(uuid) from public, anon, authenticated;
grant execute on function public.refresh_team_season_summary(uuid, integer) to service_role;
grant execute on function public.refresh_player_career_totals(uuid) to service_role;

-- ---------------------------------------------------------------------- RLS
-- Both new tables carry save-scoped data, so they take the same deny-by-default
-- treatment as the other 45. Migration 0009 loops the tables that existed then;
-- these two are enabled explicitly here rather than by rerunning that loop.
alter table public.team_season_summary enable row level security;
alter table public.team_season_summary force row level security;
alter table public.player_career_totals enable row level security;
alter table public.player_career_totals force row level security;

drop policy if exists team_season_summary_select on public.team_season_summary;
create policy team_season_summary_select on public.team_season_summary
  for select to authenticated
  using (save_id in (select app.readable_save_ids()));

drop policy if exists player_career_totals_select on public.player_career_totals;
create policy player_career_totals_select on public.player_career_totals
  for select to authenticated
  using (save_id in (select app.readable_save_ids()));

-- Writes are the server's. No INSERT, UPDATE or DELETE policy exists for
-- authenticated, so the client cannot write a summary even for its own save.
revoke insert, update, delete on public.team_season_summary from authenticated, anon;
revoke insert, update, delete on public.player_career_totals from authenticated, anon;

-- Self-verification: a summary table without forced RLS is a data leak between
-- saves, so the migration fails rather than shipping one.
do $$
declare v_bad text;
begin
  select string_agg(c.relname, ', ') into v_bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('team_season_summary', 'player_career_totals')
     and not (c.relrowsecurity and c.relforcerowsecurity);
  if v_bad is not null then
    raise exception 'RLS not forced on: %', v_bad;
  end if;
end $$;
