#!/usr/bin/env bash
# A development database from nothing, the way a real deployment gets one:
# every migration in order, the template world through the importer, and the
# development user the shim signs requests as. Nothing is hand-seeded.
#
#   DB=dmp_dev scripts/db-fresh.sh
#
# Requires a running Postgres; PGHOST/PGPORT/PGUSER select it. The local shim
# (supabase/tests/00_local_shim.sql) stands in for the auth schema and roles a
# Supabase project provides; it is never applied to a real project.
set -euo pipefail
PGHOST="${PGHOST:-/tmp}"; PGPORT="${PGPORT:-55432}"; PGUSER="${PGUSER:-postgres}"
DB="${DB:-dmp_dev}"
DEV_USER_ID="${DEV_USER_ID:-00000000-0000-0000-0000-000000000001}"
export PGHOST PGPORT PGUSER

psql -q -d postgres -c "drop database if exists $DB"
psql -q -d postgres -c "create database $DB"
psql -q -d "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/00_local_shim.sql
for f in supabase/migrations/0*.sql; do
  printf '%-45s' "$(basename "$f")"
  psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$f" && echo "OK"
done

# PGPASSWORD, when the cluster wants one (CI does; the local socket does not).
AUTH="$PGUSER${PGPASSWORD:+:$PGPASSWORD}"
export DATABASE_URL="postgres://$AUTH@localhost/$DB?host=$PGHOST&port=$PGPORT"
node scripts/import-seed.ts
psql -q -d "$DB" -v ON_ERROR_STOP=1 -v uid="'$DEV_USER_ID'" -f supabase/dev/dev_user.sql
echo "ready: DATABASE_URL=$DATABASE_URL DEV_USER_ID=$DEV_USER_ID"
