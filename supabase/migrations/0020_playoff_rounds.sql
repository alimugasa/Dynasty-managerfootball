-- 0020 · The postseason, in the league's own words.
--
-- Fourteen clubs, seven a conference, four rounds: the Opening Round (seeds
-- two to seven, the top seed resting), the Quarterfinals, the Conference
-- Final, and the League Final on neutral ground. The round vocabulary the
-- schema shipped with was another league's; these are this one's. Nothing
-- has been written under the old values -- no playoff game has ever been
-- played -- so the constraints are simply replaced.
alter table public.season_schedule drop constraint if exists season_schedule_playoff_round_check;
alter table public.season_schedule drop constraint if exists season_schedule_check;
alter table public.season_schedule add constraint season_schedule_playoff_round_check check (
  (competition = 'REGULAR' and playoff_round is null)
  or (competition = 'PLAYOFF' and playoff_round in ('OPENING', 'QUARTERFINAL', 'CONFERENCE_FINAL', 'LEAGUE_FINAL')));

alter table public.league_history drop constraint if exists league_history_result_check;
alter table public.league_history drop constraint if exists league_history_playoff_result_check;
alter table public.league_history add constraint league_history_playoff_result_check check (
  playoff_result is null or playoff_result in (
    'MISSED', 'OPENING', 'QUARTERFINAL', 'CONFERENCE_FINAL', 'RUNNER_UP', 'CHAMPION'));

-- One club per seed per conference. The index 0007 shipped was per season,
-- which would let only one club in the league hold seed one; standings does
-- not carry the conference, so the per-conference rule cannot be an index
-- here. The engine assigns the seeds (playoffs.ts, seedLeague) and is the
-- only writer; the range check stays.
drop index if exists public.standings_unique_seed;

comment on column public.standings.conference_seed is
  'Set when the regular season ends: 1-7 for the fourteen qualifiers, NULL for the rest.';
