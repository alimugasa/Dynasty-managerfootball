-- 0001 · Foundation: identity, save ownership, and the RLS predicate.
--
-- Every game table in this schema is save-scoped and carries `save_id`. This file
-- creates the two tables that cannot be (`profiles` is keyed by user, `saves` is
-- itself the thing save_id points at) plus the single predicate every other
-- policy reuses.
--
-- Posture: deny-by-default. Tables enable AND force RLS, clients receive SELECT
-- only, and no client-facing INSERT/UPDATE/DELETE policy exists anywhere in this
-- schema. All mutation happens in edge functions holding the service role, which
-- carries BYPASSRLS. That is ARCHITECTURE.md rule 2 ("no simulation outcome is
-- ever decided in frontend code") enforced by the database rather than by
-- convention: a tampered client cannot write a win.

create extension if not exists pgcrypto;

-- Private schema for helpers. Not exposed through PostgREST.
create schema if not exists app;
revoke all on schema app from public, anon, authenticated;

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  handle      text,
  created_at  timestamptz not null default now()
);

comment on table public.profiles is
  'One row per authenticated user. Anonymous sign-in is the default entry path, so handle is nullable until the account is upgraded to email.';

-- ---------------------------------------------------------------- saves
-- A save is the unit of ownership. It owns all mutable game state; deleting it
-- cascades the entire simulated universe for that dynasty.
create table if not exists public.saves (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users (id) on delete cascade,
  is_template    boolean not null default false,
  name           text not null,
  user_team_id   text,
  season         integer not null,
  week           integer not null default 1,
  phase          text    not null default 'PRESEASON',
  rng_seed       bigint  not null,
  engine_version text    not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint saves_phase_check check (phase in (
    'PRESEASON','REGULAR_SEASON','PLAYOFFS','AWARDS','RETIREMENTS',
    'COACHING','DRAFT','FREE_AGENCY','CAMP')),
  constraint saves_week_check check (week between 1 and 25),
  constraint saves_season_check check (season between 2026 and 2400),
  -- The template save is the imported starting world: owned by nobody, readable
  -- by everybody, never played. A player save must have an owner.
  constraint saves_template_ownership check (
    (is_template and user_id is null) or (not is_template and user_id is not null))
);

-- Exactly one template world may exist.
create unique index if not exists saves_single_template
  on public.saves ((true)) where is_template;

create index if not exists saves_user_idx on public.saves (user_id);

comment on table public.saves is
  'Root of ownership. Every other game table references this via save_id. The single is_template row holds the imported starting world that create_save() clones.';

-- ---------------------------------------------------------------- updated_at
create or replace function app.touch_updated_at()
returns trigger language plpgsql as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists saves_touch_updated_at on public.saves;
create trigger saves_touch_updated_at
  before update on public.saves
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------- RLS predicate
-- Returns the save ids the calling user may read: their own, plus the template.
--
-- SECURITY DEFINER so it is not itself filtered by the policy on `saves`, which
-- would recurse. STABLE and set-returning so `save_id in (select ...)` is
-- evaluated once per statement and hashed, rather than once per row -- the
-- difference between a 1,700-row roster scan and 1,700 function calls.
create or replace function app.readable_save_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select s.id
  from public.saves s
  where s.is_template
     or s.user_id = (select auth.uid());
$fn$;

revoke all on function app.readable_save_ids() from public, anon;
grant execute on function app.readable_save_ids() to authenticated, service_role;

-- ---------------------------------------------------------------- RLS: profiles, saves
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.saves    enable row level security;
alter table public.saves    force row level security;

create policy profiles_select_self on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

-- A profile row is the one thing a client may create for itself; it holds no
-- game state, so it cannot affect a simulation outcome.
create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy saves_select_own on public.saves
  for select to authenticated
  using (is_template or user_id = (select auth.uid()));

-- Deliberately absent: saves_insert / saves_update / saves_delete for clients.
-- Creating a save clones ~25,000 rows and must stay transactional and
-- server-side; advancing season/week/phase is a simulation outcome. Both go
-- through edge functions. Deletion is exposed later as a service-role RPC so it
-- can also purge storage, not as a client DELETE policy.

revoke all on public.profiles from anon;
revoke all on public.saves    from anon;
revoke insert, update, delete, truncate on public.profiles from authenticated;
revoke insert, update, delete, truncate on public.saves    from authenticated;
grant select on public.saves to authenticated;
grant select, insert, update on public.profiles to authenticated;
