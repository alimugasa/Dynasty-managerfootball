#!/usr/bin/env bash
# Applies every migration to a throwaway database and runs the RLS suite.
# Requires a running Postgres; PGHOST/PGPORT/PGUSER select it.
set -euo pipefail
PGHOST="${PGHOST:-/tmp}"; PGPORT="${PGPORT:-55432}"; PGUSER="${PGUSER:-postgres}"
DB="${DB:-dmp_test}"
export PGHOST PGPORT PGUSER
psql -q -d postgres -c "drop database if exists $DB" 
psql -q -d postgres -c "create database $DB"
psql -q -d "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/00_local_shim.sql
for f in supabase/migrations/0*.sql; do
  printf '%-45s' "$(basename "$f")"
  psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$f" && echo "OK"
done
psql -q -d "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/01_rls_test.sql
