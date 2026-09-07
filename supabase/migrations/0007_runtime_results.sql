-- 0007 · Runtime: results, season statistics, season grades, standings.
--
-- Everything in this file is written by the engine and read by the app. No
-- client policy in 0009 grants INSERT or UPDATE on any of it.
--
-- The `competition` column appears on all three per-season tables and is part of
-- every primary key. src/domain/competition.ts types CompetitionSplit<T> with no
-- combined field, and ARCHITECTURE.md names regular-season/playoff separation as
-- an invariant that must survive every future change. Here that invariant is a
-- key column: there is no row that means "both", so no query can accidentally
-- produce one by forgetting a filter. A missing WHERE returns duplicated rows
-- loudly rather than silently summing a career.

-- ---------------------------------------------------------------- game_results
-- One row per played game, holding both team boxes.
--
-- Denormalization chosen: home_/away_ prefixed columns in a single wide row
-- rather than two rows in a team_game_stats table. sim_game() produces hbox and
-- abox as one indivisible result, standings are computed by walking games and
-- comparing two scores, and every results list, schedule row and box score in
-- the UI shows both sides at once. Two rows would make the dominant read a
-- self-join on game_id to put a scoreline back together. The cost is that a
-- single team's season totals need a UNION over home and away, which is why the
-- v_team_game_stats view at the bottom of this file exists: aggregation gets the
-- long shape, the hot path keeps the wide one.
create table if not exists public.game_results (
  save_id      uuid not null references public.saves (id) on delete cascade,
  game_id      text not null,
  season       integer not null,
  week         integer not null,
  competition  text not null,
  home_team_id text not null,
  away_team_id text not null,
  home_score   integer not null,
  away_score   integer not null,
  overtime     boolean not null default false,

  home_plays integer, home_pass_att integer, home_completions integer,
  home_pass_yards integer, home_pass_tds integer, home_interceptions integer,
  home_sacks_allowed integer, home_rushes integer, home_rush_yards integer,
  home_rush_tds integer, home_field_goals integer, home_turnovers integer,

  away_plays integer, away_pass_att integer, away_completions integer,
  away_pass_yards integer, away_pass_tds integer, away_interceptions integer,
  away_sacks_allowed integer, away_rushes integer, away_rush_yards integer,
  away_rush_tds integer, away_field_goals integer, away_turnovers integer,

  weather_wind   integer, weather_cold integer, weather_precip numeric,
  simulated_at   timestamptz not null default now(),

  primary key (save_id, game_id),
  foreign key (save_id, game_id)
    references public.season_schedule (save_id, game_id) on delete cascade,
  foreign key (save_id, home_team_id)
    references public.teams (save_id, team_id) on delete cascade,
  foreign key (save_id, away_team_id)
    references public.teams (save_id, team_id) on delete cascade,
  constraint game_results_competition_check check (competition in ('REGULAR','PLAYOFF')),
  constraint game_results_scores_nonneg check (home_score >= 0 and away_score >= 0),
  -- A playoff game cannot end level.
  constraint game_results_no_playoff_tie check (
    competition = 'REGULAR' or home_score <> away_score)
);

create index if not exists game_results_week_idx
  on public.game_results (save_id, season, week);

-- ---------------------------------------------------------------- player_season_stats
-- Season-level only. legacy/ENGINE.md is explicit that the engine produces no
-- game logs, and this schema does not invent a table the simulation cannot fill.
-- When game logs are built, they arrive as their own migration with their own
-- engine change; a per-game table sitting empty would be a standing invitation
-- to populate it with plausible numbers, which ARCHITECTURE.md rule 3 forbids.
create table if not exists public.player_season_stats (
  save_id     uuid not null references public.saves (id) on delete cascade,
  season      integer not null,
  competition text not null,
  player_id   text not null,
  team_id     text,
  position    text,
  games_played integer not null default 0,
  games_started integer not null default 0,

  pass_att integer not null default 0, completions integer not null default 0,
  pass_yards integer not null default 0, pass_tds integer not null default 0,
  interceptions integer not null default 0, sacks_taken integer not null default 0,
  -- Derived from the five columns above by the standard formula. Stored, not
  -- computed on read: ARCHITECTURE.md rule 2 keeps derived football numbers out
  -- of frontend code, and storing it guarantees the leaderboard, the player page
  -- and the record book cannot disagree about the same season.
  passer_rating numeric,

  rushes integer not null default 0, rush_yards integer not null default 0,
  rush_tds integer not null default 0, fumbles integer not null default 0,

  targets integer not null default 0, receptions integer not null default 0,
  rec_yards integer not null default 0, rec_tds integer not null default 0,

  tackles integer not null default 0, sacks numeric not null default 0,
  tackles_for_loss integer not null default 0, ints_caught integer not null default 0,
  passes_defended integer not null default 0, forced_fumbles integer not null default 0,

  fg_made integer not null default 0, fg_att integer not null default 0,
  xp_made integer not null default 0, xp_att integer not null default 0,
  punts integer not null default 0, punt_yards integer not null default 0,

  snaps integer not null default 0,

  primary key (save_id, season, competition, player_id),
  foreign key (save_id, player_id)
    references public.players (save_id, player_id) on delete cascade,
  foreign key (save_id, team_id)
    references public.teams (save_id, team_id) on delete set null,
  constraint pss_competition_check check (competition in ('REGULAR','PLAYOFF')),
  constraint pss_completions_check check (completions <= pass_att),
  constraint pss_fg_check check (fg_made <= fg_att),
  constraint pss_receptions_check check (receptions <= targets)
);

-- Leaderboards: "top 50 by pass yards, this season, regular season".
create index if not exists pss_leaderboard_idx
  on public.player_season_stats (save_id, season, competition, pass_yards desc);
create index if not exists pss_player_idx
  on public.player_season_stats (save_id, player_id, season);
create index if not exists pss_team_idx
  on public.player_season_stats (save_id, season, competition, team_id);

comment on table public.player_season_stats is
  'team_id is the team the player accumulated these stats for, captured at season end. It is not a live pointer: a player traded next March keeps this row attached to the club he played for, which is what a career page must show.';

-- ---------------------------------------------------------------- player_season_grades
-- Held as a separate concern from statistics on purpose. A grade is the engine's
-- z-scored judgement of performance; a stat line is a count of events. They have
-- different lifecycles (grades are recomputed when the grading model changes,
-- counts never are), different consumers, and the UI renders them with
-- deliberately different geometry -- PerformanceChip for grades, plain tabular
-- figures for counts. Merging them would invite a screen to average a grade with
-- a yardage total.
create table if not exists public.player_season_grades (
  save_id      uuid not null references public.saves (id) on delete cascade,
  season       integer not null,
  competition  text not null,
  player_id    text not null,
  team_id      text,
  position     text,
  snaps        integer not null default 0,
  grade        numeric not null,
  grade_z      numeric,
  grade_letter text,
  position_rank integer,
  primary key (save_id, season, competition, player_id),
  foreign key (save_id, player_id)
    references public.players (save_id, player_id) on delete cascade,
  constraint psg_competition_check check (competition in ('REGULAR','PLAYOFF')),
  constraint psg_grade_range check (grade between 0 and 100)
);

create index if not exists psg_leaderboard_idx
  on public.player_season_grades (save_id, season, competition, position, grade desc);

-- ---------------------------------------------------------------- standings
-- A table, not a view.
--
-- The seed shipped v_standings, which recomputed wins and losses in SQL. That is
-- wrong twice over. It cannot express a tie, and more seriously it makes the
-- database a second, independent implementation of a rule the engine already
-- owns -- ARCHITECTURE.md rule 2. Seeding is decided by tiebreakers (division
-- record, head-to-head, common games, conference record, strength of victory)
-- that the engine applies in order; a view that ranks by win percentage would
-- disagree with the bracket the engine actually produced, and the UI would show
-- a seventh seed that did not make the playoffs. The engine writes this table,
-- including the tiebreak ordering it used.
create table if not exists public.standings (
  save_id        uuid not null references public.saves (id) on delete cascade,
  season         integer not null,
  team_id        text not null,
  wins           integer not null default 0,
  losses         integer not null default 0,
  ties           integer not null default 0,
  win_pct        numeric not null default 0,
  points_for     integer not null default 0,
  points_against integer not null default 0,
  division_wins  integer not null default 0,
  division_losses integer not null default 0,
  division_ties  integer not null default 0,
  conference_wins integer not null default 0,
  conference_losses integer not null default 0,
  conference_ties integer not null default 0,
  streak         text,
  -- Engine-assigned, in the order its tiebreakers produced. Null until seeding.
  division_rank  integer,
  conference_seed integer,
  playoff_status text,
  eliminated     boolean not null default false,
  primary key (save_id, season, team_id),
  foreign key (save_id, team_id)
    references public.teams (save_id, team_id) on delete cascade,
  constraint standings_playoff_status_check check (playoff_status is null or
    playoff_status in ('CLINCHED_DIVISION','CLINCHED_BYE','CLINCHED_PLAYOFF',
                       'IN_HUNT','ELIMINATED')),
  constraint standings_seed_range check (conference_seed is null or
    conference_seed between 1 and 16)
);

-- One team per conference seed per season.
create unique index if not exists standings_unique_seed
  on public.standings (save_id, season, conference_seed)
  where conference_seed is not null;

-- ---------------------------------------------------------------- v_team_game_stats
-- The long counterpart to game_results' wide shape. Team season aggregates and
-- opponent-adjusted metrics read this; scorelines read the table directly.
-- security_invoker is not optional here. A Postgres view runs with its owner's
-- privileges by default, so without this the view would happily return every
-- save in the database to any authenticated caller, straight past the RLS on
-- game_results. With it, the underlying policy applies to the querying user.
create or replace view public.v_team_game_stats
with (security_invoker = true) as
select save_id, game_id, season, week, competition,
       home_team_id as team_id, away_team_id as opponent_id, true as is_home,
       home_score as points_for, away_score as points_against,
       home_pass_yards as pass_yards, home_rush_yards as rush_yards,
       home_turnovers as turnovers
from public.game_results
union all
select save_id, game_id, season, week, competition,
       away_team_id, home_team_id, false,
       away_score, home_score,
       away_pass_yards, away_rush_yards, away_turnovers
from public.game_results;
