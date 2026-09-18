-- 0002 · Starting world: league structure, venues, ownership, colleges.
--
-- Keying convention for every table from here on:
--   primary key (save_id, <natural_id>)
--   foreign keys carry save_id in the composite
--
-- The composite FK is the important half. With a plain `player_id` reference, a
-- depth chart row in save A could legally point at a player in save B, and the
-- corruption would be invisible until a lineup rendered someone else's roster.
-- Carrying save_id through every reference makes that unrepresentable rather
-- than merely unlikely.
--
-- Natural text ids ('BUF', 'BUF_QB_01', 'CCH0001') are kept from the seed rather
-- than replaced with surrogate uuids: 25,187 CSV rows already use them, they are
-- readable in logs and parity goldens, and (save_id, text) indexes fine.

-- ---------------------------------------------------------------- leagues
create table if not exists public.leagues (
  save_id     uuid not null references public.saves (id) on delete cascade,
  league_id   text not null,
  name        text not null,
  abbreviation text not null,
  founded_year integer,
  data_class  text,
  primary key (save_id, league_id)
);

-- ---------------------------------------------------------------- conferences
create table if not exists public.league_conferences (
  save_id       uuid not null references public.saves (id) on delete cascade,
  conference_id text not null,
  name          text not null,
  league_id     text not null,
  data_class    text,
  primary key (save_id, conference_id),
  foreign key (save_id, league_id)
    references public.leagues (save_id, league_id) on delete cascade
);

-- ---------------------------------------------------------------- divisions
create table if not exists public.league_divisions (
  save_id       uuid not null references public.saves (id) on delete cascade,
  division_id   text not null,
  conference_id text not null,
  name          text not null,
  region        text,
  data_class    text,
  primary key (save_id, division_id),
  foreign key (save_id, conference_id)
    references public.league_conferences (save_id, conference_id) on delete cascade
);

create index if not exists league_divisions_conf_idx
  on public.league_divisions (save_id, conference_id);

-- ---------------------------------------------------------------- teams
create table if not exists public.teams (
  save_id         uuid not null references public.saves (id) on delete cascade,
  team_id         text not null,
  metro_area      text not null,
  nickname        text not null,
  division_id     text not null,
  -- conference_id is derivable through division_id. Denormalized deliberately:
  -- conference standings, conference leaders, playoff seeding and the
  -- CompetitionToggle screens all filter by conference, and every one of those
  -- queries would otherwise carry a join purely to reach a value that cannot
  -- change during a save. Realignment is not a feature; if it ever becomes one,
  -- this column becomes engine-maintained rather than static.
  conference_id   text not null,
  primary_color   text not null,
  secondary_color text not null,
  founded_year    integer,
  market_size     integer,
  -- No FK on stadium_id / owner_id: stadiums and owners both reference teams
  -- back, and a mutual FK pair cannot be satisfied by a plain INSERT ordering.
  -- The seed resolves this the same way. These are 1:1 partners, enforced by the
  -- unique constraints on the far side rather than here.
  stadium_id      text,
  owner_id        text,
  data_class      text,
  primary key (save_id, team_id),
  foreign key (save_id, division_id)
    references public.league_divisions (save_id, division_id) on delete cascade,
  foreign key (save_id, conference_id)
    references public.league_conferences (save_id, conference_id) on delete cascade,
  constraint teams_primary_color_hex   check (primary_color   ~ '^#[0-9A-Fa-f]{6}$'),
  constraint teams_secondary_color_hex check (secondary_color ~ '^#[0-9A-Fa-f]{6}$')
);

create index if not exists teams_division_idx   on public.teams (save_id, division_id);
create index if not exists teams_conference_idx on public.teams (save_id, conference_id);

comment on column public.teams.primary_color is
  'Team identity is metro area + original nickname + two colours. Marks are generated procedurally from these. See docs/IP-POLICY.md.';

-- ---------------------------------------------------------------- stadiums
create table if not exists public.stadiums (
  save_id     uuid not null references public.saves (id) on delete cascade,
  stadium_id  text not null,
  team_id     text not null,
  name        text not null,
  capacity    integer,
  roof_type   text,
  surface     text,
  opened_year integer,
  city        text,
  state       text,
  data_class  text,
  primary key (save_id, stadium_id),
  foreign key (save_id, team_id)
    references public.teams (save_id, team_id) on delete cascade,
  constraint stadiums_one_per_team unique (save_id, team_id)
);

-- ---------------------------------------------------------------- owners
create table if not exists public.owners (
  save_id              uuid not null references public.saves (id) on delete cascade,
  owner_id             text not null,
  team_id              text not null,
  owner_name           text not null,
  ownership_type       text,
  archetype            text,
  tenure_years         integer,
  patience             integer,
  spending_willingness integer,
  meddling             integer,
  win_now_bias         numeric,
  market_size          integer,
  franchise_value_musd bigint,
  data_class           text,
  primary key (save_id, owner_id),
  foreign key (save_id, team_id)
    references public.teams (save_id, team_id) on delete cascade,
  constraint owners_one_per_team unique (save_id, team_id)
);

comment on column public.owners.win_now_bias is
  'Consumed by the draft engine to weight need against best-available, and by the coaching carousel. Not a display field.';

-- ---------------------------------------------------------------- colleges
create table if not exists public.colleges (
  save_id           uuid not null references public.saves (id) on delete cascade,
  college_id        text not null,
  name              text not null,
  abbreviation      text,
  conference        text,
  conference_abbr   text,
  division_tier     integer,
  talent_level      integer,
  -- Renamed from the seed's `nfl_pipeline_rate`. The old name embeds a real
  -- league abbreviation in a commercially shipped schema, and it survives the
  -- IP linter only because \bnfl\b does not match before an underscore. That is
  -- luck, not compliance. See docs/IP-POLICY.md.
  pro_pipeline_rate numeric,
  data_class        text,
  primary key (save_id, college_id)
);
