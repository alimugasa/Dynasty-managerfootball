-- 0006 · Starting world: schedule, byes, draft capital, prospects, scouting.

-- ---------------------------------------------------------------- season_schedule
-- The fixture list: who plays whom, where, when. It is written when a season is
-- created and is immutable thereafter.
--
-- home_score and away_score are GONE from this table. In the seed they were
-- declared `text`, so '10' sorted above '9' and any arithmetic needed a cast --
-- and more importantly a result is an outcome, which belongs to the runtime
-- layer under the engine's control, not to the fixture list. They now live on
-- game_results as integers. A game with no game_results row has not been played;
-- that is a clean, checkable statement, unlike a null inside a text column.
create table if not exists public.season_schedule (
  save_id        uuid not null references public.saves (id) on delete cascade,
  game_id        text not null,
  season         integer not null,
  week           integer not null,
  competition    text not null default 'REGULAR',
  playoff_round  text,
  game_date      date,
  kickoff_local  text,
  home_team_id   text not null,
  away_team_id   text not null,
  venue          text,
  venue_city     text,
  roof           text,
  surface        text,
  neutral_site   boolean not null default false,
  divisional_game boolean not null default false,
  conference_game boolean not null default false,
  primetime      boolean not null default false,
  status         text not null default 'SCHEDULED',
  data_class     text,
  primary key (save_id, game_id),
  foreign key (save_id, home_team_id)
    references public.teams (save_id, team_id) on delete cascade,
  foreign key (save_id, away_team_id)
    references public.teams (save_id, team_id) on delete cascade,
  constraint season_schedule_status_check check (status in ('SCHEDULED','FINAL')),
  constraint season_schedule_competition_check check (competition in ('REGULAR','PLAYOFF')),
  constraint season_schedule_distinct_teams check (home_team_id <> away_team_id),
  constraint season_schedule_playoff_round_check check (
    (competition = 'REGULAR' and playoff_round is null) or
    (competition = 'PLAYOFF' and playoff_round in
      ('WILD_CARD','DIVISIONAL','CONFERENCE','FINAL')))
);

create index if not exists season_schedule_week_idx
  on public.season_schedule (save_id, season, week);
create index if not exists season_schedule_home_idx
  on public.season_schedule (save_id, season, home_team_id);
create index if not exists season_schedule_away_idx
  on public.season_schedule (save_id, season, away_team_id);

-- ---------------------------------------------------------------- team_bye_weeks
create table if not exists public.team_bye_weeks (
  save_id  uuid not null references public.saves (id) on delete cascade,
  season   integer not null,
  team_id  text not null,
  bye_week integer not null,
  primary key (save_id, season, team_id),
  foreign key (save_id, team_id)
    references public.teams (save_id, team_id) on delete cascade
);

-- ---------------------------------------------------------------- draft_picks
-- Draft capital as a tradeable asset. original_team_id never changes, which is
-- what lets the UI say "via Cleveland"; current_owner_team_id is what the draft
-- reads. used_by_pick records the selection once made.
create table if not exists public.draft_picks (
  save_id               uuid not null references public.saves (id) on delete cascade,
  pick_id               text not null,
  draft_year            integer not null,
  round                 integer not null,
  pick_in_round         integer,
  overall_pick          integer,
  original_team_id      text not null,
  current_owner_team_id text not null,
  compensatory          boolean not null default false,
  selected_player_id    text,
  data_class            text,
  primary key (save_id, pick_id),
  foreign key (save_id, original_team_id)
    references public.teams (save_id, team_id) on delete cascade,
  foreign key (save_id, current_owner_team_id)
    references public.teams (save_id, team_id) on delete cascade,
  foreign key (save_id, selected_player_id)
    references public.players (save_id, player_id) on delete set null,
  constraint draft_picks_round_check check (round between 1 and 7)
);

create index if not exists draft_picks_owner_idx
  on public.draft_picks (save_id, draft_year, current_owner_team_id);

-- ---------------------------------------------------------------- draft_classes
-- Prospects. True ratings live here and are never exposed to a client: RLS
-- grants SELECT, so the honest way to hide them is to keep the user's view in
-- scouting_reports and read this table only from edge functions. See the note in
-- 0009 on the column-level revoke that enforces it.
create table if not exists public.draft_classes (
  save_id            uuid not null references public.saves (id) on delete cascade,
  prospect_id        text not null,
  draft_year         integer not null,
  display_name       text not null,
  position           text not null,
  position_group     text not null,
  college_id         text,
  college_name       text,
  age                integer,
  height_inches      integer,
  weight_lbs         integer,
  forty_yard         numeric,
  -- True values. Engine-only.
  true_overall       integer,
  true_potential     integer,
  bust_risk          integer,
  -- Public consensus values, safe to show.
  scout_grade        numeric,
  projected_round    text,
  floor_rating       integer,
  ceiling_rating     integer,
  scouting_confidence text,
  prospect_class     text,
  declared           boolean not null default true,
  data_class         text,
  primary key (save_id, prospect_id),
  foreign key (save_id, college_id)
    references public.colleges (save_id, college_id) on delete set null
);

create index if not exists draft_classes_year_idx
  on public.draft_classes (save_id, draft_year);

-- ---------------------------------------------------------------- scouting_reports
-- One club's noisy estimate of one prospect. legacy/ENGINE.md: each team scouts
-- through a noise term whose width is set by its own scouting department, sigma
-- from 11.5 down to 5.5, so 32 clubs build 32 different boards. That per-team
-- divergence is the mechanism that produces reaches and steals, so the estimate
-- is stored per team rather than derived once.
create table if not exists public.scouting_reports (
  save_id         uuid not null references public.saves (id) on delete cascade,
  team_id         text not null,
  prospect_id     text not null,
  draft_year      integer not null,
  estimated_overall   integer,
  estimated_potential integer,
  noise_sigma     numeric,
  scouting_hours  integer not null default 0,
  board_rank      integer,
  primary key (save_id, team_id, prospect_id),
  foreign key (save_id, team_id)
    references public.teams (save_id, team_id) on delete cascade,
  foreign key (save_id, prospect_id)
    references public.draft_classes (save_id, prospect_id) on delete cascade
);

create index if not exists scouting_reports_board_idx
  on public.scouting_reports (save_id, team_id, draft_year, board_rank);

-- ---------------------------------------------------------------- data_provenance
create table if not exists public.data_provenance (
  save_id              uuid not null references public.saves (id) on delete cascade,
  file                 text not null,
  data_class           text,
  notes                text,
  row_count            integer,
  contains_real_people text,
  primary key (save_id, file)
);

comment on table public.data_provenance is
  'Import audit trail. contains_real_people must read NO on every row; docs/IP-POLICY.md depends on it being checkable rather than asserted.';
