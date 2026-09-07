-- 0010 · create_save(): clone the template world into a new dynasty.
--
-- The template is a single `saves` row with is_template = true, holding the
-- imported starting world. A new save is an INSERT ... SELECT of that world
-- under a fresh save_id.
--
-- Why one set of save-scoped tables and a template row, rather than a set of
-- immutable seed tables plus parallel save_* copies:
--
--   * One shape. `players` means the same thing in every context, so the
--     generated domain interfaces, the data layer and the engine all address one
--     table name. The alternative duplicates 28 table definitions, 28 domain
--     types and every query that touches them, and leaves a permanent question
--     at each call site about which copy is authoritative.
--   * One policy. Every table takes the identical RLS predicate. With split
--     tables, seed tables need a second, different policy for "readable by
--     everyone", and the two rulesets drift.
--   * Nothing is actually immutable. A dynasty renames nothing, but it does
--     retire players, fire coaches, reassign stadium capacity after a
--     renovation and rewrite depth charts. Tables modelled as shared reference
--     data would have to migrate to per-save copies the first time any of that
--     shipped.
--
-- The cost is ~25,200 duplicated rows per save, about 12 MB. That is the correct
-- trade: it buys structural isolation between saves, and deleting a dynasty
-- becomes one cascading DELETE rather than 42 scoped ones.

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

-- Callable by the server only. The edge function that creates a dynasty holds
-- the service role; an authenticated client calling this over RPC is refused.
-- Cloning 25,000 rows is not something a client should be able to trigger in a
-- loop, and picking your own rng_seed would make the draft predictable.
revoke all on function public.create_save(uuid, text, text, bigint, text)
  from public, anon, authenticated;
grant execute on function public.create_save(uuid, text, text, bigint, text)
  to service_role;

comment on function public.create_save(uuid, text, text, bigint, text) is
  'Clones the template world into a new save. Service role only. Returns the new save id.';
