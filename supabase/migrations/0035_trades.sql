-- 0035 · Trades: packages, the block, a deadline, and morale.
--
-- The offseason has had trades since the winter was built: deals.ts prices a
-- player as an asset and evaluateTrade says yes or no. What it has never had
-- is any of the things that make trading a thing you *do* rather than a thing
-- you submit -- a package with more than players in it, a club with a stated
-- direction, a reason attached to a refusal, a counter, a deadline, or the
-- other thirty-one clubs dealing with each other while you watch.
--
-- Four tables and three columns.
--
--   trades          one row per deal, whatever its state
--   trade_assets    what is in it: players and picks, from both sides
--   trade_block     who the manager has made available
--   players.morale  how a player feels about it, where that is known
--
-- draft_picks already carries current_owner_team_id, so pick ownership was
-- always tradeable and nothing in this migration has to invent it. Three
-- draft years exist at any time, which is what makes a future pick a real
-- asset rather than a label.

-- ---------------------------------------------------------------- the deal

create table if not exists public.trades (
  save_id      uuid    not null references public.saves (id) on delete cascade,
  trade_id     bigint  generated always as identity,
  season       integer not null,
  week         integer,
  phase        text    not null,
  /** The club that made the offer, and the club it was made to. Direction
   *  matters after the fact: a counter is a new row proposed the other way,
   *  and the history reads differently depending on who opened. */
  from_team_id text    not null,
  to_team_id   text    not null,
  /** PROPOSED while it is live. ACCEPTED once executed. Everything else is a
   *  way of not happening, and they are told apart because a manager wants to
   *  know whether they were turned down or timed out. */
  state        text    not null default 'PROPOSED',
  /** Set when a CPU club answers with terms of its own: the trade this one
   *  became. Null on a deal nobody countered. */
  countered_by bigint,
  /** What the receiving club made of it, kept with the deal so the history
   *  can say why a refusal was a refusal. */
  interest     text,
  reasons      text[],
  /** The two sides of the valuation at the moment it was judged. Stored
   *  rather than recomputed: the rosters move, and a deal turned down in week
   *  6 was turned down on week 6's numbers. */
  value_offered numeric,
  value_asked   numeric,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  primary key (save_id, trade_id),
  foreign key (save_id, from_team_id)
    references public.teams (save_id, team_id) on delete cascade,
  foreign key (save_id, to_team_id)
    references public.teams (save_id, team_id) on delete cascade,
  constraint trades_state_check
    check (state in ('PROPOSED', 'ACCEPTED', 'REJECTED', 'COUNTERED', 'WITHDRAWN', 'EXPIRED')),
  constraint trades_interest_check
    check (interest is null or interest in
      ('NO_INTEREST', 'WEAK', 'FAIR', 'STRONG', 'LIKELY_ACCEPT')),
  -- A club cannot trade with itself, which is the one shape of nonsense a
  -- package builder can produce by accident.
  constraint trades_two_clubs check (from_team_id <> to_team_id)
);

create index if not exists trades_live_idx
  on public.trades (save_id, season, state, trade_id desc);
create index if not exists trades_to_team_idx
  on public.trades (save_id, to_team_id, state);

-- -------------------------------------------------------------- what is in it

create table if not exists public.trade_assets (
  save_id   uuid   not null references public.saves (id) on delete cascade,
  trade_id  bigint not null,
  asset_id  bigint generated always as identity,
  /** The club giving this asset up. Both sides live in one table because a
   *  package is symmetrical -- a three-for-two is the same shape read from
   *  either end -- and two tables would make every query a union. */
  from_team_id text not null,
  kind      text   not null,
  player_id text,
  pick_id   text,
  /** What this asset was judged to be worth when the deal was made. The whole
   *  package's value is the sum, and a manager reading a completed trade a
   *  season later sees what the clubs thought at the time rather than what
   *  the player turned out to be. */
  value     numeric,
  primary key (save_id, trade_id, asset_id),
  foreign key (save_id, trade_id)
    references public.trades (save_id, trade_id) on delete cascade,
  foreign key (save_id, player_id)
    references public.players (save_id, player_id) on delete cascade,
  foreign key (save_id, pick_id)
    references public.draft_picks (save_id, pick_id) on delete cascade,
  constraint trade_assets_kind_check check (kind in ('PLAYER', 'PICK')),
  -- Exactly one of the two, matching the kind. An asset that is neither, or
  -- both, is a package nobody can execute.
  constraint trade_assets_one_thing check (
    (kind = 'PLAYER' and player_id is not null and pick_id is null)
    or (kind = 'PICK' and pick_id is not null and player_id is null))
);

create index if not exists trade_assets_trade_idx
  on public.trade_assets (save_id, trade_id);

-- ---------------------------------------------------------------- the block

create table if not exists public.trade_block (
  save_id    uuid not null references public.saves (id) on delete cascade,
  player_id  text not null,
  team_id    text not null,
  listed_season integer not null,
  listed_week   integer,
  /** What the manager will listen to. Null means no price named, which is a
   *  real answer -- "make me an offer" -- and not the same as asking nothing. */
  asking_note text,
  created_at timestamptz not null default now(),
  primary key (save_id, player_id),
  foreign key (save_id, player_id)
    references public.players (save_id, player_id) on delete cascade,
  foreign key (save_id, team_id)
    references public.teams (save_id, team_id) on delete cascade
);

create index if not exists trade_block_team_idx
  on public.trade_block (save_id, team_id);

-- --------------------------------------------------------------- the player

-- 0-100, and null until something happens that this game can name a cause
-- for. Not 50 by default: "he is fine" and "nobody has asked" are different
-- facts, and a valuation that quietly treated an unknown as average would be
-- reading a number nobody set.
alter table public.players
  add column if not exists morale integer;

alter table public.players
  drop constraint if exists players_morale_range;
alter table public.players
  add constraint players_morale_range
  check (morale is null or (morale >= 0 and morale <= 100));

comment on column public.players.morale is
  'How the player feels about his situation, 0-100. Null until an event this game models moves it -- being put on the trade block, being traded. Never defaulted: an unknown morale and a neutral one are different facts.';

-- ------------------------------------------------------------- the deadline

-- The week trading shuts, stored on the save so a franchise can be played
-- under a different one and the screens read the same column either way.
-- Null on a save made before trading existed, and the phase model supplies
-- the league default rather than this column pretending to know.
alter table public.saves
  add column if not exists trade_deadline_week integer;

comment on column public.saves.trade_deadline_week is
  'The last week of the regular season in which a trade may be agreed. Null means the league default in _shared/api/tradeWindow.ts applies.';

alter table public.trades enable row level security;
alter table public.trades force row level security;
alter table public.trade_assets enable row level security;
alter table public.trade_assets force row level security;
alter table public.trade_block enable row level security;
alter table public.trade_block force row level security;

create policy "trades_select_own_save" on public.trades
  for select to authenticated using (save_id in (select app.readable_save_ids()));
create policy "trade_assets_select_own_save" on public.trade_assets
  for select to authenticated using (save_id in (select app.readable_save_ids()));
create policy "trade_block_select_own_save" on public.trade_block
  for select to authenticated using (save_id in (select app.readable_save_ids()));
