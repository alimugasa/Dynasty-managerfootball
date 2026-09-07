-- 0003 · Starting world: coaches, their attributes, staffs and schemes.

-- ---------------------------------------------------------------- coaches
create table if not exists public.coaches (
  save_id                  uuid not null references public.saves (id) on delete cascade,
  coach_id                 text not null,
  display_name             text not null,
  -- Nullable: the coaching carousel fires coaches, and an unemployed coach stays
  -- in the pool as a hiring candidate rather than being deleted. A coach with a
  -- null team_id is exactly the free-agent coach list the Staff screen reads.
  team_id                  text,
  role                     text not null,
  age                      integer,
  years_experience         integer,
  coaching_tree            text,
  prior_head_coach         boolean not null default false,
  contract_years_remaining integer,
  hot_seat_rating          integer,
  overall_rating           integer,
  data_class               text,
  primary key (save_id, coach_id),
  foreign key (save_id, team_id)
    references public.teams (save_id, team_id) on delete set null,
  constraint coaches_role_check check (role in (
    'Head Coach','Offensive Coordinator','Defensive Coordinator',
    'Special Teams Coordinator','Position Coach','Scouting Director'))
);

create index if not exists coaches_team_idx on public.coaches (save_id, team_id);
create index if not exists coaches_unemployed_idx
  on public.coaches (save_id) where team_id is null;

-- The seed stores prior_head_coach / play_calling_duty / is_starter / etc. as
-- integer 0/1 because CSV has no boolean. They become real booleans here; the
-- import harness casts. Integer flags invite `sum(is_starter)` arithmetic that
-- silently means something different from `count(*) filter (where is_starter)`.

-- ---------------------------------------------------------------- coach_attributes
create table if not exists public.coach_attributes (
  save_id            uuid not null references public.saves (id) on delete cascade,
  coach_id           text not null,
  play_calling       integer,
  game_management    integer,
  player_development integer,
  talent_evaluation  integer,
  leadership         integer,
  adaptability       integer,
  aggressiveness     integer,
  discipline         integer,
  motivation         integer,
  staff_management   integer,
  scheme_innovation  integer,
  clock_management   integer,
  data_class         text,
  primary key (save_id, coach_id),
  foreign key (save_id, coach_id)
    references public.coaches (save_id, coach_id) on delete cascade
);

comment on table public.coach_attributes is
  'Split from coaches rather than merged: coaches is read on every roster and news query, attributes only on the coach profile and inside the engine. talent_evaluation sets the width of the draft scouting noise term.';

-- ---------------------------------------------------------------- team_coaching_staff
-- The seed has no primary key here, so nothing stops a coach appearing twice on
-- one staff or on two staffs at once. A coach holds exactly one job.
create table if not exists public.team_coaching_staff (
  save_id           uuid not null references public.saves (id) on delete cascade,
  coach_id          text not null,
  team_id           text not null,
  role              text not null,
  side_of_ball      text,
  years_with_team   integer,
  play_calling_duty boolean not null default false,
  data_class        text,
  primary key (save_id, coach_id),
  foreign key (save_id, coach_id)
    references public.coaches (save_id, coach_id) on delete cascade,
  foreign key (save_id, team_id)
    references public.teams (save_id, team_id) on delete cascade
);

create index if not exists team_coaching_staff_team_idx
  on public.team_coaching_staff (save_id, team_id);

-- One head coach per team, and one play-caller per side of the ball.
create unique index if not exists team_coaching_staff_one_hc
  on public.team_coaching_staff (save_id, team_id)
  where role = 'Head Coach';

create unique index if not exists team_coaching_staff_one_play_caller
  on public.team_coaching_staff (save_id, team_id, side_of_ball)
  where play_calling_duty;

-- ---------------------------------------------------------------- team_schemes
create table if not exists public.team_schemes (
  save_id                uuid not null references public.saves (id) on delete cascade,
  team_id                text not null,
  offensive_scheme       text,
  offensive_identity     text,
  run_pass_balance       numeric,
  tempo                  text,
  defensive_scheme       text,
  base_front             text,
  coverage_tendency      text,
  blitz_rate             numeric,
  fourth_down_aggression integer,
  data_class             text,
  primary key (save_id, team_id),
  foreign key (save_id, team_id)
    references public.teams (save_id, team_id) on delete cascade,
  constraint team_schemes_balance_range check (run_pass_balance between 0 and 1),
  constraint team_schemes_blitz_range   check (blitz_rate       between 0 and 1)
);
