-- 0024 · The end of a season, shown rather than filed.
--
-- The league has voted since 0021; nobody watched it happen. A season now
-- ends in two steps of its own before the offseason opens: the awards, and
-- then the year in review. AWARDS was already an allowed phase and had never
-- been used; RECAP is added beside it.
--
-- Two steps rather than one screen because they are two different things. An
-- award is a verdict on a player, argued over and won by a margin. A recap is
-- the year: who took it, what your club did, which records fell. Reading them
-- as one list makes both smaller.
alter table public.saves drop constraint if exists saves_phase_check;
alter table public.saves add constraint saves_phase_check check (phase in (
  'PRESEASON','REGULAR_SEASON','PLAYOFFS','OFFSEASON','AWARDS','RECAP',
  'RETIREMENTS','COACHING','DRAFT','FREE_AGENCY','CAMP'));

comment on column public.saves.phase is
  'Where the dynasty is. A season runs REGULAR_SEASON -> PLAYOFFS -> OFFSEASON (the season is closed) -> AWARDS -> RECAP -> RETIREMENTS -> DRAFT -> FREE_AGENCY -> CAMP -> REGULAR_SEASON.';
