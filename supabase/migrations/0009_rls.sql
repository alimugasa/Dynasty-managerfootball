-- 0009 · Row level security: deny by default, read-only for clients.
--
-- The posture, stated once:
--
--   1. Every game table enables AND forces RLS. Enabling alone leaves the table
--      owner exempt; forcing closes that, so a mistake in a SECURITY DEFINER
--      function cannot quietly read across saves.
--   2. A table with RLS enabled and no policy denies everything. That is the
--      default every table starts from, and it is what "deny by default" means
--      here -- not a policy that returns false, but the absence of any grant.
--   3. The only policy granted to clients is SELECT, restricted to save ids the
--      caller owns plus the read-only template world.
--   4. There is no client INSERT, UPDATE or DELETE policy anywhere in this
--      schema. Not on depth charts, not on saves, not on anything. Every write
--      is an engine outcome and goes through an edge function holding the
--      service role, which carries BYPASSRLS.
--
-- Point 4 is ARCHITECTURE.md rule 2 -- "no simulation outcome is ever decided in
-- frontend code" -- expressed as a database privilege rather than a code review
-- convention. A user editing a depth chart is proposing a lineup, and the server
-- decides what that does to a game. With no write policy, a tampered client
-- holding a valid JWT still cannot award itself a win, a draft pick or cap room.

do $$
declare
  t text;
  game_tables constant text[] := array[
    -- starting world
    'leagues','league_conferences','league_divisions','teams','stadiums','owners',
    'colleges','coaches','coach_attributes','team_coaching_staff','team_schemes',
    'players','player_attributes','player_traits','player_morale','player_injuries',
    'team_rosters','team_depth_charts','player_contracts','contract_years',
    'salary_cap','franchise_finances','free_agents','team_needs','owner_goals',
    'season_schedule','team_bye_weeks','draft_picks','draft_classes',
    'scouting_reports','data_provenance',
    -- runtime
    'game_results','player_season_stats','player_season_grades','standings',
    'transactions','awards','award_ballots','honours','league_history',
    'coach_history','league_records','news'
  ];
begin
  foreach t in array game_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force  row level security', t);

    -- Deny by default: this is the only policy the table gets.
    execute format('drop policy if exists %I on public.%I', t || '_select_own_save', t);
    execute format($p$
      create policy %I on public.%I
        for select to authenticated
        using (save_id in (select app.readable_save_ids()))
    $p$, t || '_select_own_save', t);

    -- anon is the unauthenticated role; anonymous sign-in yields `authenticated`.
    -- Nothing in this schema is public.
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------- views
revoke all on public.v_team_game_stats from anon;
grant select on public.v_team_game_stats to authenticated;

-- ---------------------------------------------------------------- hidden columns
-- A prospect's true ratings are the thing the draft is a game about. RLS is
-- row-level, so hiding them needs a column-level revoke: the client reads the
-- consensus grade and its own club's scouting estimate, never the truth.
-- Column privileges apply to PostgREST's select list, so a request naming these
-- columns is refused rather than silently nulled.
-- A column-level REVOKE cannot claw back a table-level SELECT: in Postgres the
-- table grant already implies every column, and the two are tracked separately,
-- so revoking columns while the table grant stands is silently a no-op. The
-- table grant must come off and the visible columns be granted explicitly.
revoke select on public.draft_classes from authenticated;
grant select (
  save_id, prospect_id, draft_year, display_name, position, position_group,
  college_id, college_name, age, height_inches, weight_lbs, forty_yard,
  scout_grade, projected_round, floor_rating, ceiling_rating,
  scouting_confidence, prospect_class, declared, data_class
) on public.draft_classes to authenticated;

comment on column public.draft_classes.true_overall is
  'Engine-only. Column-level revoke in 0009 keeps it out of client reads; the user sees scouting_reports.estimated_overall, which carries their club noise term.';

-- ---------------------------------------------------------------- verification
-- Fails the migration if any table in public is left unprotected. A new table
-- added in a later migration without RLS trips this on the next deploy, which is
-- the point: the check is cheap and the failure mode it prevents is a cross-save
-- data leak.
do $$
declare
  unprotected text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
    into unprotected
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not (c.relrowsecurity and c.relforcerowsecurity);

  if unprotected is not null then
    raise exception 'Tables in public without forced RLS: %', unprotected;
  end if;
end
$$;

-- Fails if any table carries a client-writable policy.
do $$
declare
  writable text;
begin
  select string_agg(format('%s.%s', schemaname, tablename) || ' -> ' || policyname, ', ')
    into writable
  from pg_policies
  where schemaname = 'public'
    and cmd <> 'SELECT'
    and 'authenticated' = any(roles)
    and tablename <> 'profiles';   -- profiles holds no game state; see 0001

  if writable is not null then
    raise exception 'Client-writable policies on game state: %', writable;
  end if;
end
$$;

-- Fails if a table-level SELECT grant ever reappears on draft_classes and
-- re-exposes the engine-only columns.
do $$
begin
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'draft_classes'
      and grantee = 'authenticated' and privilege_type = 'SELECT'
  ) then
    raise exception
      'draft_classes carries a table-level SELECT grant; true ratings are exposed';
  end if;
end
$$;
