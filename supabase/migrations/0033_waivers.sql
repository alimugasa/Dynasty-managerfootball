-- 0033 · The waiver wire, and a market that stays open all year.
--
-- A released player used to go one of two ways and only one of them existed.
-- cutPlayer already decided, correctly, that a man with fewer than four
-- accrued seasons is subject to waivers rather than free to sign anywhere --
-- and then had nowhere to put him, because there was no wire. He came off the
-- roster and out of the game. This is the missing half.
--
-- Three tables and a column:
--
--   waiver_wire      who is on it, who let him go, and when the window shuts
--   waiver_claims    who wants him
--   teams.waiver_priority   the order claims are settled in
--
-- The free-agent pool already existed and already carried an asking price, a
-- desired length, an interest level and a personality: the offseason market
-- has used all four for a year. What it lacked was a reason to stay open after
-- week one, which is a behaviour rather than a column.

-- ----------------------------------------------------------------- the wire

create table if not exists public.waiver_wire (
  save_id      uuid    not null references public.saves (id) on delete cascade,
  player_id    text    not null,
  season       integer not null,
  /** The club that let him go. Null for a player who reached the wire some
   *  other way -- there is no such route today, and a column that pretended
   *  otherwise would be inventing one. */
  from_team_id text,
  /** The week he was posted, and the week the window shuts at the end of. */
  posted_week  integer not null,
  deadline_week integer not null,
  /** OPEN while claims can be made, then one of the two ways it can end. */
  state        text    not null default 'OPEN',
  /** Set when the window has been settled: who got him, or null if nobody did
   *  and he went to the market. */
  awarded_team_id text,
  resolved_week integer,
  created_at   timestamptz not null default now(),
  primary key (save_id, player_id, season, posted_week),
  foreign key (save_id, player_id)
    references public.players (save_id, player_id) on delete cascade,
  constraint waiver_state_check check (state in ('OPEN', 'CLAIMED', 'CLEARED')),
  constraint waiver_window_check check (deadline_week >= posted_week)
);

create index if not exists waiver_wire_open_idx
  on public.waiver_wire (save_id, season, state, deadline_week);

-- ---------------------------------------------------------------- the claims

create table if not exists public.waiver_claims (
  save_id      uuid    not null references public.saves (id) on delete cascade,
  player_id    text    not null,
  season       integer not null,
  posted_week  integer not null,
  team_id      text    not null,
  /** The priority the club held when it claimed. Stored rather than looked up
   *  at resolution: priority moves, and a claim has to be settled by the order
   *  that was in force when it was made or a club can be overtaken after the
   *  fact by a result it had nothing to do with. */
  priority_at_claim integer not null,
  submitted_at timestamptz not null default now(),
  /** WON, LOST or WITHDRAWN once the window has been settled. */
  outcome      text,
  primary key (save_id, player_id, season, posted_week, team_id),
  foreign key (save_id, team_id)
    references public.teams (save_id, team_id) on delete cascade,
  constraint waiver_claim_outcome_check
    check (outcome is null or outcome in ('WON', 'LOST', 'WITHDRAWN'))
);

create index if not exists waiver_claims_player_idx
  on public.waiver_claims (save_id, season, player_id, posted_week);

-- -------------------------------------------------------------- the priority

-- 1 is first in the queue. Reverse order of standing, so the club that has
-- won least chooses first -- which is the point of a waiver system and the
-- reason it is not simply a race.
alter table public.teams
  add column if not exists waiver_priority integer;

comment on column public.teams.waiver_priority is
  'Waiver order, 1 first. Reverse standings once enough games have been played, and the previous season''s finish before that. Stored rather than derived: a claim is settled by the order in force when it was made.';

-- ------------------------------------------------------- the in-season pool

-- What a free agent wants, beyond a number. The offseason market reads the
-- four columns free_agents already had; these are the two an in-season signing
-- turns on and neither could be derived from the others.
alter table public.free_agents
  add column if not exists desired_role text,
  add column if not exists available_from_week integer;

comment on column public.free_agents.desired_role is
  'STARTER, ROTATION or DEPTH: what he believes he is. A player offered less than he thinks he is worth in snaps is a player who says no to money that would otherwise have been enough.';
comment on column public.free_agents.available_from_week is
  'The week he became available. Null for a player who was in the pool when the season opened.';

alter table public.free_agents
  drop constraint if exists free_agents_desired_role_check;
alter table public.free_agents
  add constraint free_agents_desired_role_check
  check (desired_role is null or desired_role in ('STARTER', 'ROTATION', 'DEPTH'));

alter table public.waiver_wire enable row level security;
alter table public.waiver_wire force row level security;
alter table public.waiver_claims enable row level security;
alter table public.waiver_claims force row level security;

create policy "waiver_wire_select_own_save" on public.waiver_wire
  for select to authenticated using (save_id in (select app.readable_save_ids()));
create policy "waiver_claims_select_own_save" on public.waiver_claims
  for select to authenticated using (save_id in (select app.readable_save_ids()));
