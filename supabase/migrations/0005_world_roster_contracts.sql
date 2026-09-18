-- 0005 · Starting world: roster membership, depth charts, contracts, cap, needs.

-- ---------------------------------------------------------------- team_rosters
-- Authority for roster membership and its metadata. The seed had no primary key,
-- so a player could appear on two rosters at once; he holds one job.
create table if not exists public.team_rosters (
  save_id          uuid not null references public.saves (id) on delete cascade,
  player_id        text not null,
  team_id          text not null,
  position         text not null,
  jersey_number    integer,
  roster_status    text not null,
  designation      text,
  depth_rank       integer,
  acquisition_type text,
  acquisition_year integer,
  active_status    boolean not null default true,
  data_class       text,
  primary key (save_id, player_id),
  foreign key (save_id, player_id)
    references public.players (save_id, player_id) on delete cascade,
  foreign key (save_id, team_id)
    references public.teams (save_id, team_id) on delete cascade,
  constraint team_rosters_status_check check (roster_status in
    ('ACTIVE','INACTIVE','IR','PUP','PRACTICE_SQUAD','SUSPENDED','NFI'))
);

create index if not exists team_rosters_team_idx on public.team_rosters (save_id, team_id);

-- Jersey numbers are unique within an active roster.
create unique index if not exists team_rosters_jersey_unique
  on public.team_rosters (save_id, team_id, jersey_number)
  where jersey_number is not null and roster_status = 'ACTIVE';

-- players.team_id duplicates team_rosters.team_id. This is the one duplication
-- kept on purpose. "Which team employs this player" is read on nearly every
-- query in the app -- leaderboards, news, awards, draft history, career pages --
-- most of which have no reason to touch roster metadata, and the join is pure
-- overhead there. Consistency is guaranteed the way legacy/ENGINE.md describes
-- fixing the same class of bug in the Python engine: a single mutation point.
-- Nothing writes either column directly; both move together inside set_team().
-- The trigger below makes that structural rather than a rule people remember.
create or replace function app.sync_player_team()
returns trigger language plpgsql as $fn$
begin
  update public.players p
     set team_id = new.team_id
   where p.save_id = new.save_id
     and p.player_id = new.player_id
     and p.team_id is distinct from new.team_id;
  return new;
end;
$fn$;

drop trigger if exists team_rosters_sync_player_team on public.team_rosters;
create trigger team_rosters_sync_player_team
  after insert or update of team_id on public.team_rosters
  for each row execute function app.sync_player_team();

-- ---------------------------------------------------------------- team_depth_charts
create table if not exists public.team_depth_charts (
  save_id         uuid not null references public.saves (id) on delete cascade,
  team_id         text not null,
  unit            text not null,
  slot            text not null,
  depth_order     integer not null,
  slot_position   text,
  player_id       text,
  player_position text,
  is_starter      boolean not null default false,
  data_class      text,
  primary key (save_id, team_id, unit, slot, depth_order),
  foreign key (save_id, team_id)
    references public.teams (save_id, team_id) on delete cascade,
  foreign key (save_id, player_id)
    references public.players (save_id, player_id) on delete set null,
  constraint team_depth_charts_unit_check check (unit in ('OFFENSE','DEFENSE','SPECIAL_TEAMS')),
  constraint team_depth_charts_order_check check (depth_order >= 1)
);

create index if not exists team_depth_charts_team_idx
  on public.team_depth_charts (save_id, team_id);
create index if not exists team_depth_charts_player_idx
  on public.team_depth_charts (save_id, player_id);

comment on table public.team_depth_charts is
  'Set by the user through the team-action edge function, read by the engine to build unit ratings. A null player_id is an unfilled slot and is reported as MissingData, never silently treated as a replacement-level player.';

-- ---------------------------------------------------------------- player_contracts
-- The seed stored base_salary_2026, bonus_proration_2026, roster_bonus_2026,
-- cap_hit_2026 and dead_cap_if_cut_2026 as columns. In a game whose whole point
-- is playing thirty consecutive seasons, a column named for a year is a bug with
-- a delivery date: the 2027 offseason has nowhere to write. Per-season money
-- moves to the child table below, which is the one structural change in this
-- schema that the seed CSVs cannot round-trip without a transform.
create table if not exists public.player_contracts (
  save_id               uuid not null references public.saves (id) on delete cascade,
  contract_id           text not null,
  player_id             text not null,
  team_id               text not null,
  contract_type         text,
  start_year            integer not null,
  end_year              integer not null,
  years_total           integer not null,
  years_remaining       integer not null,
  total_value           bigint,
  average_annual_value  bigint,
  signing_bonus_total   bigint,
  guaranteed_money      bigint,
  no_trade_clause       boolean not null default false,
  contract_status       text not null default 'ACTIVE',
  data_class            text,
  primary key (save_id, contract_id),
  foreign key (save_id, player_id)
    references public.players (save_id, player_id) on delete cascade,
  foreign key (save_id, team_id)
    references public.teams (save_id, team_id) on delete cascade,
  constraint player_contracts_years_check check (end_year >= start_year),
  constraint player_contracts_status_check check (contract_status in
    ('ACTIVE','EXPIRED','VOIDED','TERMINATED'))
);

create index if not exists player_contracts_team_idx
  on public.player_contracts (save_id, team_id);

-- A player holds at most one active contract.
create unique index if not exists player_contracts_one_active
  on public.player_contracts (save_id, player_id)
  where contract_status = 'ACTIVE';

-- ---------------------------------------------------------------- contract_years
create table if not exists public.contract_years (
  save_id           uuid not null references public.saves (id) on delete cascade,
  contract_id       text not null,
  season            integer not null,
  base_salary       bigint not null default 0,
  signing_bonus_proration bigint not null default 0,
  roster_bonus      bigint not null default 0,
  cap_hit           bigint not null default 0,
  dead_cap_if_cut   bigint not null default 0,
  guaranteed        boolean not null default false,
  primary key (save_id, contract_id, season),
  foreign key (save_id, contract_id)
    references public.player_contracts (save_id, contract_id) on delete cascade
);

create index if not exists contract_years_season_idx
  on public.contract_years (save_id, season);

comment on table public.contract_years is
  'One row per contract per league year. The seed carries only 2026 money, so import writes exactly that one row per contract and no more. Remaining years are materialized by the engine from the documented proration rule at load, which is a computation, not an import-time invention. See ARCHITECTURE.md rule 3.';

-- ---------------------------------------------------------------- salary_cap
create table if not exists public.salary_cap (
  save_id            uuid not null references public.saves (id) on delete cascade,
  team_id            text not null,
  season             integer not null,
  -- bigint, not the seed's integer. The engine grows the cap 6.2% a year off a
  -- $302,000,000 base, which crosses int4's 2,147,483,647 ceiling in 2062 and
  -- reaches $6.11 billion by 2076. A fifty-season dynasty is a stated goal, so
  -- the seed's integer column would overflow inside the supported lifetime.
  cap_limit          bigint not null,
  committed          bigint not null default 0,
  dead_money         bigint not null default 0,
  available          bigint not null default 0,
  contracts_counted  integer,
  -- Renamed from rollover_from_2025: same year-in-a-column-name defect.
  rollover_from_prior bigint not null default 0,
  data_class         text,
  primary key (save_id, team_id, season),
  foreign key (save_id, team_id)
    references public.teams (save_id, team_id) on delete cascade
);

-- ---------------------------------------------------------------- franchise_finances
create table if not exists public.franchise_finances (
  save_id            uuid not null references public.saves (id) on delete cascade,
  team_id            text not null,
  season             integer not null,
  salary_cap         bigint,
  top51_cap_spend    bigint,
  cap_space          bigint,
  dead_cap           bigint,
  cash_spend         bigint,
  local_revenue      bigint,
  national_revenue   bigint,
  total_revenue      bigint,
  operating_expenses bigint,
  operating_income   bigint,
  stadium_capacity   integer,
  market_size        integer,
  data_class         text,
  primary key (save_id, team_id, season),
  foreign key (save_id, team_id)
    references public.teams (save_id, team_id) on delete cascade
);

-- ---------------------------------------------------------------- free_agents
-- The open market. Columns duplicated from players (display_name, position, age,
-- experience_years, overall_rating) are the seed's shape and are kept: free
-- agency is a list screen sorted and filtered on exactly these five fields
-- across ~600 rows, and the personality-weighted bidding loop reads them once
-- per bid per team. The copies are written when a player enters the market and
-- discarded when he signs, so they cannot drift across a season boundary.
create table if not exists public.free_agents (
  save_id           uuid not null references public.saves (id) on delete cascade,
  player_id         text not null,
  display_name      text not null,
  position          text not null,
  age               integer,
  experience_years  integer,
  overall_rating    integer,
  previous_team_id  text,
  market_asking_aav bigint,
  expected_years    integer,
  interest_level    integer,
  fa_type           text,
  -- Drives the bid-scoring weights described in legacy/ENGINE.md.
  personality       text,
  data_class        text,
  primary key (save_id, player_id),
  foreign key (save_id, player_id)
    references public.players (save_id, player_id) on delete cascade,
  foreign key (save_id, previous_team_id)
    references public.teams (save_id, team_id) on delete set null,
  constraint free_agents_personality_check check (personality is null or personality in
    ('MAX_MONEY','CHAMPIONSHIP','LOYALTY','ROLE','LOCATION',
     'COACH_RELATIONSHIP','LONG_TERM_SECURITY'))
);

-- ---------------------------------------------------------------- team_needs
create table if not exists public.team_needs (
  save_id            uuid not null references public.saves (id) on delete cascade,
  team_id            text not null,
  season             integer not null,
  need_rank          integer not null,
  position           text not null,
  starter_avg_rating numeric,
  severity           text,
  data_class         text,
  primary key (save_id, team_id, season, need_rank),
  foreign key (save_id, team_id)
    references public.teams (save_id, team_id) on delete cascade
);

-- ---------------------------------------------------------------- owner_goals
create table if not exists public.owner_goals (
  save_id           uuid not null references public.saves (id) on delete cascade,
  goal_id           text not null,
  team_id           text not null,
  owner_id          text not null,
  season            integer not null,
  goal_type         text,
  description       text,
  target_value      integer,
  priority          text,
  franchise_posture text,
  patience_if_missed integer,
  reward_points     integer,
  status            text not null default 'PENDING',
  data_class        text,
  primary key (save_id, goal_id),
  foreign key (save_id, team_id)
    references public.teams (save_id, team_id) on delete cascade,
  foreign key (save_id, owner_id)
    references public.owners (save_id, owner_id) on delete cascade,
  constraint owner_goals_status_check check (status in ('PENDING','MET','MISSED'))
);

create index if not exists owner_goals_team_season_idx
  on public.owner_goals (save_id, team_id, season);
