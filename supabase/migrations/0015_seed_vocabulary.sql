-- 0015 · The schema adopts the seed's vocabulary.
--
-- Four CHECK constraints were written narrower than the data they exist to
-- hold. The frozen seed is the only producer of these rows, and the importer is
-- forbidden from transforming its values, so the constraints move rather than
-- the data. Every value below was found by sweeping all twenty CHECKs on the
-- world tables against the CSVs before this migration was written; nothing
-- else in the seed is rejected by any constraint, range or cast.
--
-- Three sets are EXTENDED: the schema's original values stay, because the
-- engine may write them at runtime (a player placed on IR, a goal that is MET),
-- and the seed's values join them. One set is REPLACED: team_depth_charts.unit
-- held an upper-case spelling nothing in the codebase reads, and the seed's
-- title-case spelling is the only one that has ever existed in a row.

-- coaches.role: the seed names position coaches by position. 'Position Coach'
-- is kept for anything that still uses the generic label.
alter table public.coaches drop constraint if exists coaches_role_check;
alter table public.coaches add constraint coaches_role_check check (role in (
  'Head Coach', 'Assistant Head Coach',
  'Offensive Coordinator', 'Defensive Coordinator', 'Special Teams Coordinator',
  'Position Coach', 'Quarterbacks Coach', 'Running Backs Coach',
  'Wide Receivers Coach', 'Tight Ends Coach', 'Offensive Line Coach',
  'Defensive Line Coach', 'Linebackers Coach', 'Outside Linebackers Coach',
  'Defensive Backs Coach', 'Strength & Conditioning', 'Scouting Director'));

-- owner_goals.status: the seed's IN_PROGRESS sits beside the schema's PENDING.
-- They are near-synonyms and are deliberately NOT merged here: collapsing one
-- into the other would be the importer deciding what the seed meant.
alter table public.owner_goals drop constraint if exists owner_goals_status_check;
alter table public.owner_goals add constraint owner_goals_status_check check (status in (
  'PENDING', 'IN_PROGRESS', 'MET', 'MISSED'));

-- team_rosters.roster_status: two preseason states the schema did not model.
alter table public.team_rosters drop constraint if exists team_rosters_status_check;
alter table public.team_rosters add constraint team_rosters_status_check check (roster_status in (
  'ACTIVE', 'INACTIVE', 'IR', 'PUP', 'NFI', 'SUSPENDED', 'PRACTICE_SQUAD',
  'PRACTICE_SQUAD_CANDIDATE', 'CAMP_BODY'));

-- team_depth_charts.unit: replaced with the seed's spelling.
alter table public.team_depth_charts drop constraint if exists team_depth_charts_unit_check;
alter table public.team_depth_charts add constraint team_depth_charts_unit_check check (unit in (
  'Offense', 'Defense', 'Special Teams'));

comment on constraint team_depth_charts_unit_check on public.team_depth_charts is
  'Title-case, as the seed writes it. Migration 0015 replaced an upper-case set no row had ever held.';
