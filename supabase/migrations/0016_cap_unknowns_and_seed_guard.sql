-- 0016 · Unknown means NULL; one status vocabulary; no save inherits seed 0.
--
-- Three decisions from reviewing the template import, each a place where the
-- schema would otherwise let a wrong value in quietly.

-- ------------------------------------------- contract_years.guaranteed is unknown
-- The seed carries a per-contract guaranteed total and no per-year flag, so the
-- import cannot know which contract-years are guaranteed. The column defaulted
-- to false, and false is not "unknown": it makes every release's dead-money
-- and cap-hit arithmetic silently wrong. It becomes nullable with no default,
-- every imported row is set to NULL, and the accessor in
-- _shared/api/mappers.ts refuses to read a NULL. No code path reads this
-- column today; the first one -- the season-rollover handler's row-to-contract
-- mapping -- must go through that accessor. The derivation rule is a cap-design
-- decision and is deliberately not guessed here.
alter table public.contract_years
  alter column guaranteed drop default,
  alter column guaranteed drop not null;

update public.contract_years set guaranteed = null where guaranteed = false;

comment on column public.contract_years.guaranteed is
  'NULL = unknown. The seed has no per-year source. Read only through guaranteedFlag() in _shared/api/mappers.ts, which throws on NULL rather than assuming false.';

-- ------------------------------------------------- owner_goals.status: one spelling
-- 0015 let the seed's IN_PROGRESS sit beside the schema's PENDING. Two
-- spellings of the same state is a bug generator; the seed's is the one every
-- row uses, so it is the one that survives. The column default moves with it
-- or a row inserted without a status would violate its own CHECK.
alter table public.owner_goals drop constraint if exists owner_goals_status_check;
update public.owner_goals set status = 'IN_PROGRESS' where status = 'PENDING';
alter table public.owner_goals alter column status set default 'IN_PROGRESS';
alter table public.owner_goals add constraint owner_goals_status_check check (status in (
  'IN_PROGRESS', 'MET', 'MISSED'));

-- ------------------------------------------------- create_save() refuses seed 0
-- The template carries rng_seed 0 as a placeholder; it is never simulated. A
-- dynasty created with 0 would share every outcome with every other such
-- dynasty, so the function refuses it. The handler generates a fresh seed on
-- the server for every save; a client never supplies one.
create or replace function public.create_save(
  p_user_id        uuid,
  p_name           text,
  p_team_id        text,
  p_seed           bigint,
  p_engine_version text
)
returns uuid
language plpgsql
security definer
set search_path = public, app, pg_temp
as $fn$
declare
  v_template uuid;
  v_save     uuid;
  v_season   integer;
  v_table    text;
  v_cols     text;
  -- Dependency order. teams before stadiums and owners; players before every
  -- table that references a player. Reordering this list breaks foreign keys.
  v_world_tables constant text[] := array[
    'leagues','league_conferences','league_divisions','teams','stadiums','owners',
    'colleges','coaches','coach_attributes','team_coaching_staff','team_schemes',
    'players','player_attributes','player_traits','player_morale','player_injuries',
    'team_rosters','team_depth_charts','player_contracts','contract_years',
    'salary_cap','franchise_finances','free_agents','team_needs','owner_goals',
    'season_schedule','team_bye_weeks','draft_picks','draft_classes',
    'scouting_reports','data_provenance'
  ];
begin
  if p_seed is null or p_seed = 0 then
    raise exception 'rng_seed must be a non-zero value; 0 is the template placeholder'
      using errcode = 'invalid_parameter_value';
  end if;

  select id, season into v_template, v_season
  from public.saves where is_template;

  if v_template is null then
    raise exception 'No template world has been imported. Run the seed import first.'
      using errcode = 'no_data_found';
  end if;

  -- ARCHITECTURE.md rule 3: report missing data, never substitute a plausible
  -- value. A bad team id fails loudly instead of silently picking a franchise.
  if not exists (select 1 from public.teams
                 where save_id = v_template and team_id = p_team_id) then
    raise exception 'Unknown team_id %', p_team_id using errcode = 'foreign_key_violation';
  end if;

  insert into public.saves (user_id, is_template, name, user_team_id,
                            season, week, phase, rng_seed, engine_version)
  values (p_user_id, false, p_name, p_team_id,
          v_season, 1, 'PRESEASON', p_seed, p_engine_version)
  returning id into v_save;

  -- Column lists are read from the catalogue rather than written out, so a
  -- column added by a later migration is cloned without anyone remembering to
  -- edit this function. Forgetting would not raise an error -- it would silently
  -- create saves missing a field, which is exactly the failure this avoids.
  foreach v_table in array v_world_tables loop
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
      into v_cols
    from information_schema.columns
    where table_schema = 'public'
      and table_name = v_table
      and column_name <> 'save_id'
      and is_generated = 'NEVER';

    if v_cols is null then
      raise exception 'Table public.% has no cloneable columns', v_table;
    end if;

    execute format(
      'insert into public.%I (save_id, %s) select $1, %s from public.%I where save_id = $2',
      v_table, v_cols, v_cols, v_table
    ) using v_save, v_template;
  end loop;

  return v_save;
end;
$fn$;
