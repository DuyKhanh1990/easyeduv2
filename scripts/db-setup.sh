#!/bin/sh
set -eu
DB_URL="${TARGET_DB_URL:-${APP_DATABASE_URL:-${DATABASE_URL:-}}}"
[ -n "$DB_URL" ] || { echo "[db-setup] Missing DATABASE_URL"; exit 1; }
export TARGET_DB_URL="$DB_URL" APP_DATABASE_URL="$DB_URL"

echo "[db-setup] Waiting for database..."
i=0
until pg_isready -d "$DB_URL" >/dev/null 2>&1; do
  i=$((i+1))
  [ "$i" -gt 60 ] && { echo "[db-setup] Database not reachable"; exit 1; }
  sleep 2
done

TABLE_COUNT=$(psql "$DB_URL" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")
HAS_CORE=$(psql "$DB_URL" -tAc "SELECT to_regclass('public.students') IS NOT NULL")

if [ "$TABLE_COUNT" = "0" ]; then
  echo "[db-setup] Empty database: creating all tables from schema"
  ./node_modules/.bin/drizzle-kit push --force
  ./node_modules/.bin/tsx scripts/ensure-indexes.ts
elif [ "$HAS_CORE" = "t" ]; then
  echo "[db-setup] Existing database: skipping schema push"
else
  echo "[db-setup] ERROR: database has tables but no public.students. Refusing to push. Manual check required."
  exit 1
fi

./node_modules/.bin/tsx scripts/apply-deploy-migrations.ts
echo "[db-setup] Done"
