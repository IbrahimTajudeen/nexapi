#!/usr/bin/env bash
# Runs the migration and the security tests on a throwaway local Postgres. Needs Postgres 14+ binaries
# (set PGBIN if they are not on PATH). Does not touch any Supabase project.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
PGBIN="${PGBIN:-$(dirname "$(command -v postgres 2>/dev/null || ls /usr/lib/postgresql/*/bin/postgres | tail -1)")}"
dir="$(mktemp -d)"
port="${PGPORT:-54329}"
if [ "$(id -u)" = 0 ]; then
  chown postgres "$dir"
  run() { runuser -u postgres -- "$@"; }
else
  run() { "$@"; }
fi
cleanup() { run "$PGBIN/pg_ctl" -D "$dir/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$dir"; }
trap cleanup EXIT
run "$PGBIN/initdb" -D "$dir/data" -A trust >/dev/null
run "$PGBIN/pg_ctl" -D "$dir/data" -o "-p $port -k $dir -c listen_addresses=''" -l "$dir/log" -w start >/dev/null
psql_() { run psql -h "$dir" -p "$port" -U postgres -v ON_ERROR_STOP=1 -q "$@"; }
psql_ -d postgres -c "create database site" >/dev/null
psql_ -d site -f "$here/setup.sql" >/dev/null
psql_ -d site -f "$here/../migrations/0001_init.sql" >/dev/null
echo "migration applied"
if [ -f "$here/../seed.sql" ]; then psql_ -d site -f "$here/../seed.sql" >/dev/null; echo "seed applied"; fi
psql_ -d site -f "$here/rls.sql" 2>&1 | grep -E "ok |FAILED|PASSED|ERROR" || true
