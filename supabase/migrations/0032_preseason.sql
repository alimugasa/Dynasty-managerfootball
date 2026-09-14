-- 0032 · Preseason: a third competition, and what camp is for.
--
-- The season had two competitions, REGULAR and PLAYOFF, and every check that
-- mentions one names them both. Preseason is a third, and it behaves like the
-- regular season rather than like the playoffs: it has no rounds, and its games
-- may end level.
--
-- Nothing here invents a roster. The world already ships 90 players a club --
-- 53 ACTIVE, 17 practice-squad candidates and 20 camp bodies -- which is the
-- roster camp opens with and the reason cuts are a decision rather than a
-- formality. What was missing was somewhere to put what camp produces.

-- ---------------------------------------------------------------- competition

alter table public.season_schedule
  drop constraint if exists season_schedule_competition_check;
alter table public.season_schedule
  add constraint season_schedule_competition_check
  check (competition in ('PRESEASON', 'REGULAR', 'PLAYOFF'));

-- Rounds belong to the bracket alone. Spelled out per competition rather than
-- as "not PLAYOFF implies null", so adding a fourth competition later is a
-- decision somebody has to make here rather than one that defaults itself.
alter table public.season_schedule
  drop constraint if exists season_schedule_playoff_round_check;
alter table public.season_schedule
  add constraint season_schedule_playoff_round_check
  check (
    (competition in ('PRESEASON', 'REGULAR') and playoff_round is null)
    or (competition = 'PLAYOFF' and playoff_round in
        ('OPENING', 'QUARTERFINAL', 'CONFERENCE_FINAL', 'LEAGUE_FINAL'))
  );

alter table public.game_results
  drop constraint if exists game_results_competition_check;
alter table public.game_results
  add constraint game_results_competition_check
  check (competition in ('PRESEASON', 'REGULAR', 'PLAYOFF'));

-- A bracket game cannot end level because somebody has to advance. A preseason
-- game has nobody to advance and every reason to end 17-17.
alter table public.game_results
  drop constraint if exists game_results_no_playoff_tie;
alter table public.game_results
  add constraint game_results_no_playoff_tie
  check (competition <> 'PLAYOFF' or home_score <> away_score);

alter table public.player_season_stats
  drop constraint if exists pss_competition_check;
alter table public.player_season_stats
  add constraint pss_competition_check
  check (competition in ('PRESEASON', 'REGULAR', 'PLAYOFF'));

alter table public.player_game_stats
  drop constraint if exists pgs_competition_check;
alter table public.player_game_stats
  add constraint pgs_competition_check
  check (competition in ('PRESEASON', 'REGULAR', 'PLAYOFF'));

comment on column public.player_season_stats.competition is
  'PRESEASON, REGULAR or PLAYOFF. Preseason totals are kept apart from the record books for good: nothing that reads a career, a leader board or a league record may count them.';

-- ---------------------------------------------------------- camp evaluations

-- What camp learned about a player, which is not the same as what he is rated.
--
-- A separate table rather than columns on players, because this is an opinion
-- about a season and the player row is the player: it resets every August, it
-- is scoped to a season, and a club that never ran camp should have no row
-- rather than a column full of defaults that read like measurements.
create table if not exists public.camp_evaluations (
  save_id     uuid    not null references public.saves (id) on delete cascade,
  season      integer not null,
  player_id   text    not null,
  team_id     text    not null,
  -- 0-100. What the coaching staff has seen on the practice field, which
  -- exists before a preseason snap has been played.
  practice_grade integer not null,
  -- 0-100, or null until this player has actually been on the field in a
  -- preseason game. Null is "not seen yet", never "seen and rated zero".
  preseason_grade integer,
  -- Games, not snaps. The engine does not model snap counts -- the projection
  -- writes player_game_stats.snaps as NULL and is right to -- so a per-snap
  -- grade would have been dividing by a number nobody measured. Appearances
  -- are what this league can actually count.
  preseason_games integer not null default 0,
  -- 0-100: how likely this player is to be on the 53 at the end of it.
  roster_probability integer not null,
  status      text    not null,
  /** How far the staff's read has moved since camp opened, in grade points.
   *  Positive is a riser. This is what a Development Movers list reads. */
  grade_delta integer not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (save_id, season, player_id),
  foreign key (save_id, player_id)
    references public.players (save_id, player_id) on delete cascade,
  foreign key (save_id, team_id)
    references public.teams (save_id, team_id) on delete cascade,
  constraint camp_status_check check (status in (
    'LOCK', 'LIKELY', 'BUBBLE', 'LONG_SHOT', 'ROOKIE_WATCH', 'INJURED', 'CUT_CANDIDATE')),
  constraint camp_practice_range check (practice_grade between 0 and 100),
  constraint camp_preseason_range check (preseason_grade is null or preseason_grade between 0 and 100),
  constraint camp_probability_range check (roster_probability between 0 and 100)
);

create index if not exists camp_evaluations_team_idx
  on public.camp_evaluations (save_id, season, team_id, roster_probability);

alter table public.camp_evaluations enable row level security;
alter table public.camp_evaluations force row level security;

create policy "camp_evaluations_select_own_save" on public.camp_evaluations
  for select to authenticated
  using (save_id in (select app.readable_save_ids()));

-- --------------------------------------------------------------- the deadline

-- When the roster has to be legal, and whether it has been signed off.
--
-- On the save rather than derived, because "the manager has finalised his 53"
-- is a decision somebody made, not a fact about the rows: a roster can sit at
-- 53 all through camp without anybody having said it is the one they want.
alter table public.saves
  add column if not exists roster_finalized_season integer;

comment on column public.saves.roster_finalized_season is
  'The season whose 53 the manager has signed off. Null until they do, and the regular season will not start before it matches the current season.';

-- ------------------------------------------------------------- save phases

-- The phase check already admitted PRESEASON -- the schema anticipated one
-- years before anything wrote it -- and the two either side of it are new.
-- COACHING is listed here because it is in the constraint being replaced;
-- dropping a value in a migration that is about adding two would retire a
-- phase by accident.
alter table public.saves drop constraint if exists saves_phase_check;
alter table public.saves add constraint saves_phase_check check (phase in (
  'TRAINING_CAMP', 'PRESEASON', 'FINAL_CUTS',
  'REGULAR_SEASON', 'PLAYOFFS',
  'OFFSEASON', 'AWARDS', 'RECAP', 'RETIREMENTS', 'COACHING', 'DRAFT',
  'FREE_AGENCY', 'CAMP'));
