-- 0026 · Room in the honours key for two all-star rosters.
--
-- The league already picks two all-league teams. It has never picked an
-- all-star roster, and the table could not have held one: the key is
-- (save_id, season, honour_type, position, slot), and an all-star selection is
-- made per conference, so both conferences' second quarterback would be
-- ALL_STAR / QB / 2 and the second would overwrite the first.
--
-- `team_unit` is the column that should have said which roster a row belongs
-- to. It was being written as a copy of `position`, which told nobody anything
-- -- the same value in two columns. It now names the roster: 'LEAGUE' for a
-- selection the whole league makes as one, and the conference id for a
-- selection each conference makes for itself.

-- Every honour written so far is an all-league row, and every all-league team
-- is picked league-wide. Saying so is reading the rows, not inventing a value
-- for them.
update public.honours set team_unit = 'LEAGUE'
 where team_unit is null or team_unit <> 'LEAGUE';

alter table public.honours alter column team_unit set default 'LEAGUE';
alter table public.honours alter column team_unit set not null;

-- The key gains the roster. Dropped and recreated rather than extended,
-- because a primary key is not alterable in place.
alter table public.honours drop constraint if exists honours_pkey;
alter table public.honours
  add constraint honours_pkey
  primary key (save_id, season, honour_type, team_unit, position, slot);

comment on column public.honours.team_unit is
  'Which roster the selection belongs to: LEAGUE for an all-league team, or the conference id for an all-star roster.';
comment on column public.honours.honour_type is
  'ALL_LEAGUE_FIRST, ALL_LEAGUE_SECOND, ALL_STAR or HALL_OF_FAME. The first two are the league''s own vote on the best season at each position; ALL_STAR is the showcase roster each conference picks.';
