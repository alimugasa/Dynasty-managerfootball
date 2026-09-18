-- 0017 · The server loop.
--
-- The browser used to host the engine and keep a dynasty in localStorage. From
-- here the engine runs in a handler and every outcome lands in these tables.
-- Five things the loop needs that the schema did not have:
--
--   1. save_documents  the engine's own state (the versioned save document from
--                      _shared/save/) and the season's news ledger. Engine-only:
--                      it carries true potential and dev rates the client may
--                      never read, so it has RLS forced and no SELECT policy.
--   2. player_game_stats  one stat line per player per game, which the box score
--                      screen reads. The largest table in the schema, so it
--                      carries a retention function: full lines for the current
--                      season plus N prior (default 3), older seasons living on
--                      only as the player_season_stats totals already rolled
--                      from them.
--   3. game_results    the five team fields the engine emits and the table had
--                      no home for (first downs, third downs, possession,
--                      drives). Nullable: a row written before this migration
--                      does not know them, and NULL says so.
--   4. saves.phase     OFFSEASON. The engine's offseason is one step, not the
--                      seven the column enumerated; the finer values stay for
--                      the day the engine grows them.
--   5. refresh_team_season_summary wrote yards_allowed = 0 for every club. It
--                      is computed now, and NULL when a game's opponent yards
--                      are unknown, never zero.
--   6. player_season_stats  five counting columns the engine does not emit
--                      (starts, fumbles, tackles for loss, passes defended,
--                      forced fumbles) were `not null default 0`. A roll-up
--                      would have written zeros nobody counted. They are
--                      nullable now and written NULL, as 0014 did for snaps.

-- ------------------------------------------------------------ save_documents
create table if not exists public.save_documents (
  save_id    uuid primary key references public.saves (id) on delete cascade,
  document   jsonb not null,
  ledger     jsonb not null,
  updated_at timestamptz not null default now()
);

comment on table public.save_documents is
  'The engine''s state for a save: the versioned save document (_shared/save/) and the season''s news ledger. Never readable by a client; the relational tables are the projection it reads.';

alter table public.save_documents enable row level security;
alter table public.save_documents force row level security;
revoke all on public.save_documents from public, anon, authenticated;

drop trigger if exists save_documents_touch_updated_at on public.save_documents;
create trigger save_documents_touch_updated_at
  before update on public.save_documents
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------- player_game_stats
-- Every column the engine emits on a stat line, and nothing it does not. No
-- defaults on the counting columns: a line is written whole or not at all, so
-- a missing value fails the insert rather than becoming a zero.
create table if not exists public.player_game_stats (
  save_id      uuid not null references public.saves (id) on delete cascade,
  game_id      text not null,
  season       integer not null,
  week         integer not null,
  competition  text not null,
  player_id    text not null,
  team_id      text not null,
  -- NULL until the engine counts snaps. See boxScore.ts and migration 0014.
  snaps        integer,
  pass_att     integer not null,
  completions  integer not null,
  pass_yards   integer not null,
  pass_tds     integer not null,
  interceptions integer not null,
  sacks_taken  integer not null,
  rushes       integer not null,
  rush_yards   integer not null,
  rush_tds     integer not null,
  targets      integer not null,
  receptions   integer not null,
  rec_yards    integer not null,
  rec_tds      integer not null,
  tackles      integer not null,
  sacks        numeric not null,
  ints_caught  integer not null,
  fg_made      integer not null,
  fg_att       integer not null,
  xp_made      integer not null,
  xp_att       integer not null,
  punts        integer not null,
  punt_yards   integer not null,

  primary key (save_id, game_id, player_id),
  foreign key (save_id, game_id)
    references public.game_results (save_id, game_id) on delete cascade,
  foreign key (save_id, player_id)
    references public.players (save_id, player_id) on delete cascade,
  foreign key (save_id, team_id)
    references public.teams (save_id, team_id) on delete cascade,
  constraint pgs_competition_check check (competition in ('REGULAR', 'PLAYOFF')),
  constraint pgs_completions_check check (completions <= pass_att),
  constraint pgs_receptions_check check (receptions <= targets),
  constraint pgs_fg_check check (fg_made <= fg_att)
);

comment on table public.player_game_stats is
  'One stat line per player per game, as the engine emitted it. Retained for the current season plus N prior by prune_player_game_stats(); older seasons survive as player_season_stats totals.';

-- A player's lines in a season (the player page), and a season's lines (the
-- weekly roll-up into player_season_stats). The primary key serves the box
-- score, which reads one game.
create index if not exists pgs_player_season_idx
  on public.player_game_stats (save_id, season, player_id);
create index if not exists pgs_season_week_idx
  on public.player_game_stats (save_id, season, week);

alter table public.player_game_stats enable row level security;
alter table public.player_game_stats force row level security;
drop policy if exists player_game_stats_select_own_save on public.player_game_stats;
create policy player_game_stats_select_own_save on public.player_game_stats
  for select to authenticated
  using (save_id in (select app.readable_save_ids()));
revoke all on public.player_game_stats from anon;
revoke insert, update, delete, truncate on public.player_game_stats from authenticated;
grant select on public.player_game_stats to authenticated;

-- Retention. Full lines for the save's current season and p_keep before it;
-- everything older is deleted. Safe to call at any time and idempotent: the
-- totals those lines fed are already in player_season_stats, which the weekly
-- roll-up writes as the lines land, so nothing is lost that a screen reads.
create or replace function public.prune_player_game_stats(
  p_save_id uuid, p_keep integer default 3
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_season integer;
  v_deleted integer;
begin
  if p_keep is null or p_keep < 0 then
    raise exception 'p_keep must be a non-negative number of prior seasons'
      using errcode = 'invalid_parameter_value';
  end if;
  select season into v_season from public.saves where id = p_save_id;
  if v_season is null then
    raise exception 'No save with id %', p_save_id using errcode = 'no_data_found';
  end if;
  delete from public.player_game_stats
   where save_id = p_save_id and season < v_season - p_keep;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end $fn$;

revoke all on function public.prune_player_game_stats(uuid, integer) from public, anon, authenticated;

-- ------------------------------------------------------- player_season_stats
alter table public.player_season_stats
  alter column games_started drop default, alter column games_started drop not null,
  alter column fumbles drop default, alter column fumbles drop not null,
  alter column tackles_for_loss drop default, alter column tackles_for_loss drop not null,
  alter column passes_defended drop default, alter column passes_defended drop not null,
  alter column forced_fumbles drop default, alter column forced_fumbles drop not null;
-- The career roll-up sums games_started; a sum over NULLs is NULL.
alter table public.player_career_totals
  alter column games_started drop default, alter column games_started drop not null;

-- ------------------------------------------------------------ game_results
alter table public.game_results
  add column if not exists home_first_downs integer,
  add column if not exists home_third_down_att integer,
  add column if not exists home_third_down_conv integer,
  add column if not exists home_possession_seconds integer,
  add column if not exists home_drives integer,
  add column if not exists away_first_downs integer,
  add column if not exists away_third_down_att integer,
  add column if not exists away_third_down_conv integer,
  add column if not exists away_possession_seconds integer,
  add column if not exists away_drives integer;

-- ------------------------------------------------------------ saves.phase
alter table public.saves drop constraint if exists saves_phase_check;
alter table public.saves add constraint saves_phase_check check (phase in (
  'PRESEASON','REGULAR_SEASON','PLAYOFFS','OFFSEASON','AWARDS','RETIREMENTS',
  'COACHING','DRAFT','FREE_AGENCY','CAMP'));

-- ------------------------------------------------ team_season_summary.yards_allowed
-- Was `not null default 0` and written as a literal 0. A club that allowed no
-- yards and a club nobody counted looked the same. NULL now means not known.
alter table public.team_season_summary
  alter column yards_allowed drop default,
  alter column yards_allowed drop not null;

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
         -- The opponent's yards in each game. NULL for the season if any game
         -- has no yardage on record: a partial sum would read as a real total.
         case when bool_or(o.pass_yards is null or o.rush_yards is null) then null
              else sum(o.pass_yards + o.rush_yards) end,
         sum(coalesce(v.turnovers, 0)),
         round(sum(v.points_for)::numeric / greatest(count(*), 1), 2),
         round((sum(coalesce(v.pass_yards, 0)) + sum(coalesce(v.rush_yards, 0)))::numeric
               / greatest(count(*), 1), 2)
    from public.v_team_game_stats v
    join public.v_team_game_stats o
      on o.save_id = v.save_id and o.game_id = v.game_id and o.team_id = v.opponent_id
   where v.save_id = p_save_id and v.season = p_season
   group by v.save_id, v.season, v.team_id, v.competition;
$fn$;
