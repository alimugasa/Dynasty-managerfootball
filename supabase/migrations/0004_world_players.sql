-- 0004 · Starting world: players, ratings, traits, morale, injuries.

-- ---------------------------------------------------------------- players
create table if not exists public.players (
  save_id            uuid not null references public.saves (id) on delete cascade,
  player_id          text not null,
  display_name       text not null,
  -- Null team_id means free agent or retired. See roster_status on team_rosters
  -- for employment detail; this column answers only "who holds his rights".
  team_id            text,
  position           text not null,
  position_group     text not null,
  jersey_number      integer,
  height_inches      integer,
  weight_lbs         integer,
  age                integer not null,
  experience_years   integer not null default 0,
  college_id         text,
  -- Denormalized from colleges.name. Kept because every player row rendered in a
  -- roster, draft board or leaderboard shows the school, and because a drafted
  -- player's school must remain correct in the record book even if the college
  -- pipeline is ever regenerated. Written once at creation, never updated.
  college_name       text,
  draft_year         integer,
  draft_round        integer,
  draft_pick_in_round integer,
  draft_overall_pick integer,
  draft_status       text,
  rookie_flag        boolean not null default false,
  role_tier          text,
  overall_rating     integer not null,
  potential_rating   integer not null,
  -- Retirement is a state, not a deletion: the record book, career stats and
  -- hall of fame all keep reading these rows for the life of the save.
  retired_season     integer,
  data_class         text,
  primary key (save_id, player_id),
  foreign key (save_id, team_id)
    references public.teams (save_id, team_id) on delete set null,
  foreign key (save_id, college_id)
    references public.colleges (save_id, college_id) on delete set null,
  constraint players_overall_range   check (overall_rating   between 0 and 99),
  constraint players_potential_range check (potential_rating between 0 and 99),
  constraint players_age_range       check (age between 18 and 50)
);

create index if not exists players_team_idx     on public.players (save_id, team_id);
create index if not exists players_position_idx on public.players (save_id, position);
create index if not exists players_active_idx
  on public.players (save_id, team_id) where retired_season is null;

-- REMOVED from the seed's players table: roster_status, designation, depth_rank.
-- All three also live on team_rosters, describing the same mutable facts. Two
-- writable copies of one fact is the drift bug legacy/ENGINE.md already records
-- fixing once, in the roster index. team_rosters is the single authority; the
-- generated domain interface in src/domain/players.ts drops these three fields.

-- ---------------------------------------------------------------- player_attributes
-- 66 columns, deliberately wide rather than key/value. Every rating is read
-- together when the engine computes unit ratings, the set is fixed by position
-- and never sparse in practice, and an EAV shape would turn one row fetch into a
-- 66-row pivot on the hottest path in the simulation.
create table if not exists public.player_attributes (
  save_id  uuid not null references public.saves (id) on delete cascade,
  player_id text not null,
  position  text,
  speed integer, acceleration integer, agility integer, strength integer,
  stamina integer, durability integer, awareness integer, football_iq integer,
  work_ethic integer, consistency integer, anchor integer, ball_skills integer,
  blitzing integer, block_shedding integer, break_tackle integer, carrying integer,
  catch_in_traffic integer, catching integer, clutch integer, contact_balance integer,
  coverage integer, decision_making integer, deep_accuracy integer, directional integer,
  elusiveness integer, finesse_move integer, hang_time integer, kick_accuracy integer,
  kick_power integer, kickoff_power integer, lead_block integer, line_calls integer,
  man_coverage integer, medium_accuracy integer, pass_block integer, pass_protection integer,
  pass_rush integer, play_action integer, play_recognition integer, pocket_presence integer,
  power integer, power_move integer, press integer, pressure_handling integer,
  punt_accuracy integer, punt_power integer, pursuit integer, receiving integer,
  release integer, route_running integer, run_block integer, run_defense integer,
  run_support integer, scrambling integer, second_level integer, separation integer,
  short_accuracy integer, snap_accuracy integer, snap_speed integer, spectacular_catch integer,
  tackling integer, technique integer, throw_on_run integer, throw_power integer,
  vision integer, zone_coverage integer,
  data_class text,
  primary key (save_id, player_id),
  foreign key (save_id, player_id)
    references public.players (save_id, player_id) on delete cascade
);

-- ---------------------------------------------------------------- player_traits
create table if not exists public.player_traits (
  save_id   uuid not null references public.saves (id) on delete cascade,
  player_id text not null,
  trait     text not null,
  data_class text,
  primary key (save_id, player_id, trait),
  foreign key (save_id, player_id)
    references public.players (save_id, player_id) on delete cascade
);

-- ---------------------------------------------------------------- player_morale
create table if not exists public.player_morale (
  save_id                   uuid not null references public.saves (id) on delete cascade,
  player_id                 text not null,
  team_id                   text,
  morale                    integer,
  playing_time_satisfaction integer,
  contract_satisfaction     integer,
  coach_trust               integer,
  locker_room_influence     integer,
  trade_request             boolean not null default false,
  holdout_risk              integer,
  data_class                text,
  primary key (save_id, player_id),
  foreign key (save_id, player_id)
    references public.players (save_id, player_id) on delete cascade
);

-- ---------------------------------------------------------------- player_injuries
-- Current injury state, one row per injured player, deleted when he returns.
-- The engine carries no injury history and this schema does not invent one; a
-- notable injury reaches the permanent record as a transaction and a news item.
create table if not exists public.player_injuries (
  save_id             uuid not null references public.saves (id) on delete cascade,
  player_id           text not null,
  team_id             text,
  designation         text,
  injury_type         text,
  weeks_out_estimate  integer,
  season_ending       boolean not null default false,
  injured_season      integer,
  injured_week        integer,
  data_class          text,
  primary key (save_id, player_id),
  foreign key (save_id, player_id)
    references public.players (save_id, player_id) on delete cascade
);

create index if not exists player_injuries_team_idx
  on public.player_injuries (save_id, team_id);
