-- 0022 · Save schema 4: the staffs a dynasty now carries.
--
-- The save document gained coaches (format 4). Nothing in the rows has to
-- change for that: a dynasty created before staffs existed already holds the
-- coach rows cloned from the template, and the server rehydrates its staffs
-- from those rows the first time it opens the save.
--
-- The step is not a no-op, though. team_coaching_staff came from a seed with
-- no primary key on it, and a staff row can name a club the coach row does not
-- agree with. The engine reads the coach row for the club and the staff row
-- for the job, so a disagreement gives a coach a job at a club he does not
-- work for. Those rows are removed rather than guessed at.
create or replace function public.save_migrate_to_4(p_save_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  delete from public.team_coaching_staff st
   using public.coaches c
   where st.save_id = p_save_id
     and c.save_id = st.save_id and c.coach_id = st.coach_id
     and (c.team_id is null or c.team_id <> st.team_id);
end $fn$;

create or replace function public.current_save_schema_version()
returns integer language sql immutable as $$ select 4 $$;

create or replace function public.apply_save_migrations(p_save_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_current integer;
  v_target  integer := public.current_save_schema_version();
  v_summary text;
begin
  select schema_version into v_current
    from public.saves where id = p_save_id for update;

  if v_current is null then
    raise exception 'No save with id %', p_save_id using errcode = 'no_data_found';
  end if;

  if v_current > v_target then
    raise exception
      'Save % is at schema version %, newer than this build understands (%). Update the app.',
      p_save_id, v_current, v_target using errcode = 'feature_not_supported';
  end if;

  while v_current < v_target loop
    case v_current
      when 1 then
        perform public.save_migrate_to_2(p_save_id);
        v_summary := 'Backfilled player_season_stats.team_id from the player''s club.';
      when 2 then
        perform public.save_migrate_to_3(p_save_id);
        v_summary := 'Removed expired contracts still counting against the cap.';
      when 3 then
        perform public.save_migrate_to_4(p_save_id);
        v_summary := 'Dropped staff rows naming a club the coach row disagrees with.';
      else
        raise exception 'No migration step from schema version %', v_current;
    end case;

    insert into public.save_migrations (save_id, from_version, to_version, summary)
    values (p_save_id, v_current, v_current + 1, v_summary)
    on conflict (save_id, to_version) do nothing;

    v_current := v_current + 1;
    update public.saves set schema_version = v_current, updated_at = now()
     where id = p_save_id;
  end loop;

  return v_current;
end $fn$;

revoke all on function public.save_migrate_to_4(uuid) from public, anon, authenticated;
grant execute on function public.save_migrate_to_4(uuid) to service_role;

-- New saves are stamped at the current version rather than migrated: a clone
-- of the template is at that version by construction.
do $$
begin
  execute format(
    'alter table public.saves alter column schema_version set default %s',
    public.current_save_schema_version());
end $$;
