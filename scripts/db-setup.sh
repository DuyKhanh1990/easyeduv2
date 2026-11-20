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

# Tạo database nếu chưa có (role trong DATABASE_URL cần quyền CREATEDB).
# Chỉ tạo khi tên DB trùng CENTER_ID.
if ! psql "$DB_URL" -tAc "SELECT 1" >/dev/null 2>&1; then
  DB_NAME="${DB_URL##*/}"
  DB_NAME="${DB_NAME%%\?*}"
  MAINT_URL="${DB_URL%/*}/postgres"
  case "$DB_NAME" in
    ""|*[!a-z0-9]*)
      echo "[db-setup] ERROR: invalid database name"
      exit 1
      ;;
  esac
  if [ "$DB_NAME" != "${CENTER_ID:-}" ]; then
    echo "[db-setup] ERROR: cannot connect to database '$DB_NAME' and it differs from CENTER_ID; refusing to create it"
    exit 1
  fi
  if [ "$(psql "$MAINT_URL" -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'")" = "1" ]; then
    echo "[db-setup] ERROR: database '$DB_NAME' exists but cannot be connected to"
    exit 1
  fi
  echo "[db-setup] Creating database $DB_NAME"
  psql "$MAINT_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$DB_NAME\""
fi

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
if [ "$TABLE_COUNT" != "0" ] && [ "$HAS_CORE" = "t" ]; then
  ./node_modules/.bin/tsx scripts/sync-schema-additive.ts
fi

USER_COUNT=$(psql "$DB_URL" -tAc "SELECT count(*) FROM public.users")
if [ "$USER_COUNT" = "0" ]; then
  echo "[seed] DB chưa có user; chạy seed dữ liệu mặc định"
  npx tsx scripts/seed-default.ts
else
  echo "[seed] skip: DB đã có user"
fi

./node_modules/.bin/tsx scripts/check-schema.ts
echo "[db-setup] Done"
