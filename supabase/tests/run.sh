#!/usr/bin/env bash
# Runs the SQL tests against a throwaway database on a local Postgres:
#   supabase/tests/run.sh            (uses psql's defaults, e.g. PGHOST / PGUSER)
# Loads a stub of Supabase's auth schema, every migration, then each *.test.sql. A test fails by
# raising an exception.
set -euo pipefail
cd "$(dirname "$0")"
db="jaartal_test_$$"
createdb "$db"
trap 'dropdb --if-exists "$db"' EXIT
psql() { command psql -X -q -v ON_ERROR_STOP=1 -d "$db" "$@"; }
psql -f supabase-stub.sql
for f in ../migrations/*.sql; do psql -f "$f"; done
for f in *.test.sql; do
  psql -f "$f"
  echo "ok $f"
done
