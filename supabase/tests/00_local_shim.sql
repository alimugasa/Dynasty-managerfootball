-- Local-only shim reproducing the parts of a Supabase database the migrations
-- depend on, so the schema can be applied and RLS exercised on a plain Postgres
-- cluster in CI. Never applied to a real project: Supabase provides all of this.
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

-- Supabase reads the verified JWT from a GUC. Same contract locally.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon')
    then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated')
    then create role authenticated nologin; end if;
  -- BYPASSRLS is what lets edge functions write engine outcomes.
  if not exists (select 1 from pg_roles where rolname = 'service_role')
    then create role service_role nologin bypassrls; end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;

-- Supabase grants broadly by default and relies on RLS as the real gate. The
-- migrations revoke from this baseline, so the baseline must be present or the
-- revokes would be testing nothing.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
