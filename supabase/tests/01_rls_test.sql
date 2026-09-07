-- Proves the security posture of 0009 rather than assuming it. Run against the
-- local shim cluster. Every check raises on failure, so a clean run is a pass.
--
-- Save ids travel in session settings rather than psql variables: psql does not
-- interpolate its variables inside dollar-quoted blocks, and every assertion
-- here lives in one.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');

set role service_role;

insert into public.saves (id, user_id, is_template, name, season, week, phase, rng_seed, engine_version)
values ('00000000-0000-0000-0000-000000000000', null, true, 'Template World',
        2026, 1, 'PRESEASON', 20260825, 'test');

insert into public.leagues values           ('00000000-0000-0000-0000-000000000000','DMP','Dynasty Manager Pro','DMP',1960,'GENERATED');
insert into public.league_conferences values('00000000-0000-0000-0000-000000000000','AC','American Conference','DMP','GENERATED');
insert into public.league_divisions values  ('00000000-0000-0000-0000-000000000000','AC-E','AC','AC East','East','GENERATED');
insert into public.teams (save_id, team_id, metro_area, nickname, division_id, conference_id, primary_color, secondary_color)
values ('00000000-0000-0000-0000-000000000000','BUF','Buffalo','Stampede','AC-E','AC','#12376B','#C8102E'),
       ('00000000-0000-0000-0000-000000000000','MIA','Miami','Barracuda','AC-E','AC','#00857D','#F26522');
insert into public.colleges (save_id, college_id, name) values
       ('00000000-0000-0000-0000-000000000000','COL0245','Talbot State Tech');
insert into public.players (save_id, player_id, display_name, team_id, position, position_group, age, college_id, overall_rating, potential_rating)
values ('00000000-0000-0000-0000-000000000000','BUF_QB_01','Emeka Isbell','BUF','QB','Quarterback',38,'COL0245',82,88);
insert into public.draft_classes (save_id, prospect_id, draft_year, display_name, position, position_group, true_overall, scout_grade)
values ('00000000-0000-0000-0000-000000000000','P0001',2027,'Rookie Prospect','QB','Quarterback',91,7.4);

-- ---------------------------------------------------------------- clone
select set_config('test.save_a',
  public.create_save('11111111-1111-1111-1111-111111111111','A dynasty','BUF',101,'test')::text, false);
select set_config('test.save_b',
  public.create_save('22222222-2222-2222-2222-222222222222','B dynasty','MIA',102,'test')::text, false);

do $$
declare a uuid := current_setting('test.save_a')::uuid;
begin
  if (select count(*) from public.players) <> 3 then
    raise exception 'clone failed: expected 3 player rows, got %',
      (select count(*) from public.players);
  end if;
  if (select team_id from public.players where save_id = a) <> 'BUF' then
    raise exception 'clone did not copy player team';
  end if;
  if (select count(*) from public.teams where save_id = a) <> 2 then
    raise exception 'clone did not copy all teams';
  end if;
end $$;

-- An unknown team must fail loudly, never silently pick a franchise.
do $$
begin
  begin
    perform public.create_save('11111111-1111-1111-1111-111111111111','bad','ZZZ',1,'test');
    raise exception 'FAIL: create_save accepted an unknown team_id';
  exception when foreign_key_violation then null;
  end;
end $$;

-- ---------------------------------------------------------------- cross-save FK
-- A player that exists only in save A cannot be referenced from save B.
do $$
declare a uuid := current_setting('test.save_a')::uuid;
        b uuid := current_setting('test.save_b')::uuid;
begin
  insert into public.players (save_id, player_id, display_name, position, position_group, age, overall_rating, potential_rating)
  values (a, 'ONLY_IN_A', 'Solo Player', 'QB', 'Quarterback', 24, 70, 80);
  begin
    insert into public.team_depth_charts (save_id, team_id, unit, slot, depth_order, player_id)
    values (b, 'MIA', 'OFFENSE', 'QB', 2, 'ONLY_IN_A');
    raise exception 'FAIL: depth chart referenced a player from another save';
  exception when foreign_key_violation then null;
  end;
end $$;

-- The roster trigger keeps players.team_id in step with team_rosters.
do $$
declare a uuid := current_setting('test.save_a')::uuid;
begin
  insert into public.team_rosters (save_id, player_id, team_id, position, roster_status)
  values (a, 'ONLY_IN_A', 'MIA', 'QB', 'ACTIVE');
  if (select team_id from public.players where save_id = a and player_id = 'ONLY_IN_A') <> 'MIA' then
    raise exception 'FAIL: players.team_id drifted from team_rosters.team_id';
  end if;
end $$;

-- ---------------------------------------------------------------- isolation
reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare n integer;
        b uuid := current_setting('test.save_b')::uuid;
begin
  select count(*) into n from public.players where save_id = b;
  if n <> 0 then raise exception 'FAIL: user A can read user B save data'; end if;

  select count(*) into n from public.saves;
  if n <> 2 then raise exception 'FAIL: user A sees % saves, expected own + template', n; end if;

  select count(*) into n from public.teams where save_id = b;
  if n <> 0 then raise exception 'FAIL: user A can read user B teams'; end if;

  -- The template stays readable so the new-save screen can list clubs.
  select count(*) into n from public.teams
   where save_id = '00000000-0000-0000-0000-000000000000';
  if n <> 2 then raise exception 'FAIL: template world not readable'; end if;

  select count(*) into n from public.v_team_game_stats where save_id = b;
  if n <> 0 then raise exception 'FAIL: view leaks other saves past RLS'; end if;
end $$;

-- ---------------------------------------------------------------- writes denied
do $$
declare a uuid := current_setting('test.save_a')::uuid;
begin
  begin
    insert into public.standings (save_id, season, team_id, wins) values (a, 2026, 'BUF', 17);
    raise exception 'FAIL: client wrote a simulation outcome';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.players set overall_rating = 99 where save_id = a;
    raise exception 'FAIL: client updated a player rating';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.team_depth_charts set player_id = null where save_id = a;
    raise exception 'FAIL: client wrote a depth chart directly';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.saves set week = 18 where id = a;
    raise exception 'FAIL: client advanced the calendar';
  exception when insufficient_privilege then null;
  end;

  begin
    delete from public.saves where id = a;
    raise exception 'FAIL: client deleted a save';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------------------------------------------------------------- hidden columns
do $$
declare v integer;
begin
  begin
    select true_overall into v from public.draft_classes limit 1;
    raise exception 'FAIL: client read a prospect true rating';
  exception when insufficient_privilege then null;
  end;
  perform scout_grade from public.draft_classes limit 1;  -- consensus stays visible
end $$;

-- ---------------------------------------------------------------- privileged RPC
do $$
begin
  begin
    perform public.create_save('11111111-1111-1111-1111-111111111111','sneaky','BUF',9,'test');
    raise exception 'FAIL: client invoked create_save';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------------------------------------------------------------- summaries (0012)
-- The derived tables are save-scoped like everything else, so they get the same
-- proof rather than the same assumption: one save's summary must be invisible
-- to another, and the client must not be able to write its own.
reset role;
set role service_role;
do $$
declare a uuid := current_setting('test.save_a')::uuid;
        b uuid := current_setting('test.save_b')::uuid;
begin
  insert into public.team_season_summary (save_id, season, team_id, competition, games, points_for)
  values (a, 2026, 'BUF', 'REGULAR', 17, 380), (b, 2026, 'MIA', 'REGULAR', 17, 410);
  insert into public.player_career_totals (save_id, player_id, competition, pass_yards)
  values (a, 'BUF_QB_01', 'REGULAR', 44000);
end $$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$
declare n integer;
begin
  select count(*) into n from public.team_season_summary;
  if n <> 1 then
    raise exception 'FAIL: A sees % team_season_summary rows, expected only its own', n;
  end if;
  select count(*) into n from public.player_career_totals;
  if n <> 1 then
    raise exception 'FAIL: A sees % player_career_totals rows, expected only its own', n;
  end if;

  -- Writes are the server's. A client must not be able to fabricate a career.
  begin
    insert into public.player_career_totals (save_id, player_id, competition, pass_yards)
    values (current_setting('test.save_a')::uuid, 'BUF_QB_01', 'PLAYOFF', 99999);
    raise exception 'FAIL: client wrote a career total';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.refresh_player_career_totals(current_setting('test.save_a')::uuid);
    raise exception 'FAIL: client invoked refresh_player_career_totals';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------------------------------------------------------------- cascade
reset role;
set role service_role;
do $$
declare n integer;
        b uuid := current_setting('test.save_b')::uuid;
begin
  delete from public.saves where id = b;
  select count(*) into n from public.players where save_id = b;
  if n <> 0 then raise exception 'FAIL: deleting a save left % orphan players', n; end if;
end $$;

reset role;
select 'ALL RLS AND INTEGRITY CHECKS PASSED' as result;
