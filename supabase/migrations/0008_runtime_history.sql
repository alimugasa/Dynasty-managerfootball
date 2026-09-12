-- 0008 · Runtime: transactions, awards, honours, records, coach history, news.
--
-- Everything here is permanent record. The governing design decision is that
-- history rows carry snapshots of the names and clubs involved at the moment the
-- event happened, rather than only foreign keys resolved at read time.
--
-- The reason is not query convenience, it is correctness. A fifty-season save
-- reaches a state where the player who won the 2031 passing title is retired,
-- his club has a different roster and his contract rows are long gone. A record
-- book that renders "2031 · passing yards · <join to players>" is one cascade
-- away from an empty cell, and the join itself grows to six tables. The keys are
-- kept alongside the snapshots so an EntityLink can still route to the profile
-- when the entity survives; the snapshot is what guarantees the line renders at
-- all. This is the only place in the schema where duplication is preferred for
-- durability rather than for speed.

-- ---------------------------------------------------------------- transactions
create table if not exists public.transactions (
  save_id      uuid not null references public.saves (id) on delete cascade,
  transaction_id bigint generated always as identity,
  season       integer not null,
  week         integer,
  phase        text not null,
  occurred_at  timestamptz not null default now(),
  kind         text not null,
  team_id      text,
  counterparty_team_id text,
  player_id    text,
  -- Snapshots. See the header note.
  player_name  text,
  team_abbr    text,
  detail       text,
  cap_impact   bigint,
  contract_id  text,
  pick_id      text,
  primary key (save_id, transaction_id),
  foreign key (save_id, team_id)
    references public.teams (save_id, team_id) on delete set null,
  foreign key (save_id, player_id)
    references public.players (save_id, player_id) on delete set null,
  constraint transactions_kind_check check (kind in (
    'DRAFT_SELECTION','ROOKIE_SIGNING','FREE_AGENT_SIGNING','RE_SIGNING',
    'RELEASE','TRADE','WAIVER_CLAIM','IR_PLACEMENT','IR_RETURN',
    'PRACTICE_SQUAD_SIGNING','RETIREMENT','CONTRACT_EXTENSION',
    'COACH_HIRE','COACH_FIRE'))
);

create index if not exists transactions_team_idx
  on public.transactions (save_id, team_id, season);
create index if not exists transactions_feed_idx
  on public.transactions (save_id, season, transaction_id desc);
create index if not exists transactions_player_idx
  on public.transactions (save_id, player_id);

-- ---------------------------------------------------------------- awards
create table if not exists public.awards (
  save_id     uuid not null references public.saves (id) on delete cascade,
  season      integer not null,
  award_code  text not null,
  -- Original award names only; no real honour is referenced. See docs/IP-POLICY.md.
  award_name  text not null,
  player_id   text,
  coach_id    text,
  team_id     text,
  player_name text,
  team_abbr   text,
  vote_share  numeric,
  primary key (save_id, season, award_code),
  foreign key (save_id, player_id)
    references public.players (save_id, player_id) on delete set null,
  foreign key (save_id, coach_id)
    references public.coaches (save_id, coach_id) on delete set null,
  constraint awards_recipient_check check (player_id is not null or coach_id is not null)
);

-- ---------------------------------------------------------------- award_ballots
-- The losing candidates. Kept because a ballot is the thing that makes an award
-- feel adjudicated rather than announced, and because "finished second in 2033"
-- is a career-page line the winner-only table cannot answer.
create table if not exists public.award_ballots (
  save_id     uuid not null references public.saves (id) on delete cascade,
  season      integer not null,
  award_code  text not null,
  finish_rank integer not null,
  player_id   text,
  coach_id    text,
  player_name text,
  team_abbr   text,
  vote_share  numeric,
  primary key (save_id, season, award_code, finish_rank),
  foreign key (save_id, season, award_code)
    references public.awards (save_id, season, award_code) on delete cascade
);

-- ---------------------------------------------------------------- honours
-- All-league and all-star selections. Separate from awards: an award has exactly
-- one winner per season, an honour has a whole team of them, and forcing both
-- into one table means either a nullable slot column or a composite award_code
-- carrying a position inside a string.
create table if not exists public.honours (
  save_id      uuid not null references public.saves (id) on delete cascade,
  season       integer not null,
  honour_type  text not null,
  team_unit    text,
  position     text not null,
  slot         integer not null default 1,
  player_id    text,
  player_name  text,
  team_abbr    text,
  primary key (save_id, season, honour_type, position, slot),
  foreign key (save_id, player_id)
    references public.players (save_id, player_id) on delete set null,
  constraint honours_type_check check (honour_type in
    ('ALL_LEAGUE_FIRST','ALL_LEAGUE_SECOND','ALL_STAR','HALL_OF_FAME'))
);

create index if not exists honours_player_idx on public.honours (save_id, player_id);

-- ---------------------------------------------------------------- league_history
-- One row per team per completed season: the spine of every history screen.
--
-- Every column here is derivable from standings plus game_results plus awards.
-- It is materialized anyway, because the screens that read it read fifty seasons
-- at once -- franchise history, the record book, a coach's tenure, playoff
-- appearance streaks -- and recomputing a half-century of tiebroken finishes on
-- each of those reads is the difference between an instant screen and a spinner.
-- Written once when a season closes and never updated, so it cannot drift.
create table if not exists public.league_history (
  save_id         uuid not null references public.saves (id) on delete cascade,
  season          integer not null,
  team_id         text not null,
  wins            integer not null,
  losses          integer not null,
  ties            integer not null,
  points_for      integer not null,
  points_against  integer not null,
  division_finish integer,
  conference_seed integer,
  playoff_result  text,
  head_coach_id   text,
  head_coach_name text,
  mean_overall    numeric,
  primary key (save_id, season, team_id),
  foreign key (save_id, team_id)
    references public.teams (save_id, team_id) on delete cascade,
  -- How far a club got, in the league's own words. 0020 restates this for
  -- databases built before the vocabulary was settled.
  constraint league_history_result_check check (playoff_result is null or
    playoff_result in ('MISSED','OPENING','QUARTERFINAL','CONFERENCE_FINAL',
                       'RUNNER_UP','CHAMPION'))
);

create index if not exists league_history_team_idx
  on public.league_history (save_id, team_id, season);

-- ---------------------------------------------------------------- coach_history
create table if not exists public.coach_history (
  save_id     uuid not null references public.saves (id) on delete cascade,
  season      integer not null,
  coach_id    text not null,
  team_id     text,
  coach_name  text,
  team_abbr   text,
  role        text,
  wins        integer,
  losses      integer,
  ties        integer,
  playoff_result text,
  outcome     text,
  primary key (save_id, season, coach_id),
  foreign key (save_id, coach_id)
    references public.coaches (save_id, coach_id) on delete cascade,
  constraint coach_history_outcome_check check (outcome is null or
    outcome in ('RETAINED','FIRED','RESIGNED','HIRED','RETIRED'))
);

-- ---------------------------------------------------------------- league_records
-- The record book: single-season and career bests, one row per record held.
create table if not exists public.league_records (
  save_id      uuid not null references public.saves (id) on delete cascade,
  record_code  text not null,
  scope        text not null,
  competition  text not null default 'REGULAR',
  record_name  text not null,
  value        numeric not null,
  player_id    text,
  player_name  text,
  team_abbr    text,
  season       integer,
  set_at_season integer,
  primary key (save_id, record_code, scope, competition),
  foreign key (save_id, player_id)
    references public.players (save_id, player_id) on delete set null,
  constraint league_records_scope_check check (scope in ('SINGLE_SEASON','CAREER')),
  constraint league_records_competition_check check (competition in ('REGULAR','PLAYOFF'))
);

-- ---------------------------------------------------------------- news
create table if not exists public.news (
  save_id   uuid not null references public.saves (id) on delete cascade,
  news_id   bigint generated always as identity,
  season    integer not null,
  week      integer,
  phase     text,
  published_at timestamptz not null default now(),
  category  text not null,
  headline  text not null,
  body      text,
  team_id   text,
  player_id text,
  game_id   text,
  importance integer not null default 3,
  primary key (save_id, news_id),
  foreign key (save_id, team_id)
    references public.teams (save_id, team_id) on delete set null,
  foreign key (save_id, player_id)
    references public.players (save_id, player_id) on delete set null,
  constraint news_importance_check check (importance between 1 and 5)
);

create index if not exists news_feed_idx
  on public.news (save_id, season, news_id desc);
