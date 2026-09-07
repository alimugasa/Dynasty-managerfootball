-- 0013 · Schema versioning for saves, and forward migration of existing ones.
--
-- A dynasty is meant to be played for real-world years, so the schema will
-- change underneath saves that already exist. Two distinct versions are tracked
-- because two distinct things change:
--
--   schema_version  the shape of a save's rows in this database. Raised by a
--                   forward migration that rewrites those rows.
--   engine_version  the build that last simulated. Recorded, never migrated:
--                   it explains a result, it does not change one.
--
-- The migration mechanism is deliberately per-save rather than a bare ALTER.
-- A DDL change applies to every save at once, which is right for adding a
-- column and wrong for anything that has to look at a save's data -- backfills
-- differ per dynasty, some are expensive, and a save nobody opens should not
-- pay for one. So a save carries its version, gets upgraded when opened, and
-- the applied steps are logged.
--
-- There is no downgrade path. An older build opening a newer save must refuse.

alter table public.saves
  add column if not exists schema_version integer not null default 1;

comment on column public.saves.schema_version is
  'Shape of this save''s rows. Upgraded in place by apply_save_migrations(); never lowered. Mirrored by SAVE_SCHEMA_VERSION in supabase/functions/_shared/save/version.ts.';

-- ------------------------------------------------------------ the current version
-- One function rather than a constant, so the value has exactly one home in
-- SQL and a step cannot disagree with the target it is migrating towards.
create or replace function public.current_save_schema_version()
returns integer language sql immutable as $$ select 3 $$;

-- ---------------------------------------------------------------- the log
-- What ran, against which save, and when. A save that fails halfway leaves the
-- steps that succeeded recorded, which is the difference between "resume from
-- 2" and "guess what state this is in".
create table if not exists public.save_migrations (
  save_id      uuid not null references public.saves (id) on delete cascade,
  from_version integer not null,
  to_version   integer not null,
  summary      text not null,
  applied_at   timestamptz not null default now(),
  primary key (save_id, to_version),
  constraint save_migrations_forward check (to_version = from_version + 1)
);

alter table public.save_migrations enable row level security;
alter table public.save_migrations force row level security;

drop policy if exists save_migrations_select on public.save_migrations;
create policy save_migrations_select on public.save_migrations
  for select to authenticated
  using (save_id in (select app.readable_save_ids()));

revoke insert, update, delete on public.save_migrations from authenticated, anon;

-- ------------------------------------------------------------------- steps
-- One function per version, named for the version it produces. Each is
-- idempotent: running it twice must leave the same rows, because a migration
-- that failed after its writes but before its version bump will be retried.

-- v1 -> v2. player_season_stats.team_id was nullable and was left null for
-- players whose club could not be resolved at write time. A season row that
-- does not know which club it belongs to cannot appear on a club page or a
-- career page, so it was invisible rather than wrong -- which is worse.
create or replace function public.save_migrate_to_2(p_save_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  -- Resolved from the roster the player held that season where that is
  -- recoverable, and left null where it is not. A guessed club would attach a
  -- season to a team the player never played for.
  update public.player_season_stats s
     set team_id = p.team_id
    from public.players p
   where s.save_id = p_save_id
     and s.team_id is null
     and p.save_id = s.save_id
     and p.player_id = s.player_id
     and p.team_id is not null;
end $fn$;

-- v2 -> v3. Contracts whose term had run out were left attached to the player
-- rather than removed, so they counted against the cap for ever. Deleting them
-- is the whole fix; the engine expires contracts correctly now.
create or replace function public.save_migrate_to_3(p_save_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  delete from public.player_contracts
   where save_id = p_save_id
     and years_remaining <= 0;
end $fn$;

-- --------------------------------------------------------------- the driver
-- Runs the chain for one save, in a single transaction, logging each step.
--
-- The version is read FOR UPDATE. Two clients opening the same dynasty at once
-- would otherwise both read version 1, both run the v1 step, and both try to
-- log it -- and the second would fail on the primary key after having already
-- written its half of the migration.
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

revoke all on function public.apply_save_migrations(uuid) from public, anon, authenticated;
revoke all on function public.save_migrate_to_2(uuid) from public, anon, authenticated;
revoke all on function public.save_migrate_to_3(uuid) from public, anon, authenticated;
grant execute on function public.apply_save_migrations(uuid) to service_role;
grant execute on function public.current_save_schema_version() to authenticated, service_role;

-- ------------------------------------------------------- stamp new saves
-- create_save() clones the template world; a clone is at the current version by
-- construction, so it is stamped rather than migrated. Existing saves keep the
-- default of 1 and are upgraded when opened, which is the point of the column.
do $$
begin
  execute format(
    'alter table public.saves alter column schema_version set default %s',
    public.current_save_schema_version());
end $$;

-- Saves that predate this migration are genuinely at version 1: the two steps
-- above describe exactly what was wrong with them.
update public.saves set schema_version = 1 where schema_version is null;

-- Self-verification. A driver that cannot reach the current version is a driver
-- that will strand a real dynasty, and this is the cheapest place to find out.
do $$
declare v_missing integer;
begin
  for v_missing in 1 .. public.current_save_schema_version() - 1 loop
    if to_regprocedure(format('public.save_migrate_to_%s(uuid)', v_missing + 1)) is null then
      raise exception 'No save_migrate_to_% function for the declared chain', v_missing + 1;
    end if;
  end loop;
end $$;
