-- A signed-in user for development, where there is no auth server.
--
-- The dev shim trusts DEV_USER_ID as the current user; saves.user_id has a
-- foreign key to auth.users, so that user must exist. Idempotent. NEVER run
-- against a production database: production users come from Supabase Auth.
--
--   psql "$DATABASE_URL" -v uid="'00000000-0000-0000-0000-000000000001'" -f supabase/dev/dev_user.sql

insert into auth.users (id) values (:uid::uuid) on conflict (id) do nothing;
insert into public.profiles (user_id, handle) values (:uid::uuid, 'dev')
  on conflict (user_id) do nothing;
