-- These created_at columns are omitted by their application writers and use
-- the database now() default. Preserve their original values for rollback.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 's3_file_logs'
      AND column_name = 'created_at' AND data_type = 'timestamp without time zone'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'web_push_subscriptions'
      AND column_name = 'created_at' AND data_type = 'timestamp without time zone'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'gateway_registry'
      AND column_name = 'created_at' AND data_type = 'timestamp without time zone'
  ) THEN
    RAISE EXCEPTION 'one or more system metadata created_at columns are not legacy timestamps';
  END IF;
  IF to_regclass('time_migration.s3_file_logs_created_at_before_utc') IS NOT NULL
    OR to_regclass('time_migration.web_push_subscriptions_created_at_before_utc') IS NOT NULL
    OR to_regclass('time_migration.gateway_registry_created_at_before_utc') IS NOT NULL THEN
    RAISE EXCEPTION 'a system metadata backup already exists; inspect before proceeding';
  END IF;
END
$guard$;

CREATE SCHEMA IF NOT EXISTS time_migration;
CREATE TABLE time_migration.s3_file_logs_created_at_before_utc AS
  SELECT url, created_at FROM public.s3_file_logs;
ALTER TABLE time_migration.s3_file_logs_created_at_before_utc ADD PRIMARY KEY (url);
CREATE TABLE time_migration.web_push_subscriptions_created_at_before_utc AS
  SELECT id, created_at FROM public.web_push_subscriptions;
ALTER TABLE time_migration.web_push_subscriptions_created_at_before_utc ADD PRIMARY KEY (id);
CREATE TABLE time_migration.gateway_registry_created_at_before_utc AS
  SELECT id, created_at FROM public.gateway_registry;
ALTER TABLE time_migration.gateway_registry_created_at_before_utc ADD PRIMARY KEY (id);

DO $guard$
BEGIN
  IF (SELECT count(*) FROM time_migration.s3_file_logs_created_at_before_utc)
      <> (SELECT count(*) FROM public.s3_file_logs)
    OR (SELECT count(*) FROM time_migration.web_push_subscriptions_created_at_before_utc)
      <> (SELECT count(*) FROM public.web_push_subscriptions)
    OR (SELECT count(*) FROM time_migration.gateway_registry_created_at_before_utc)
      <> (SELECT count(*) FROM public.gateway_registry) THEN
    RAISE EXCEPTION 'a system metadata backup row count does not match';
  END IF;
END
$guard$;

ALTER TABLE public.s3_file_logs ALTER COLUMN created_at DROP DEFAULT;
ALTER TABLE public.s3_file_logs
  ALTER COLUMN created_at TYPE timestamp with time zone
  USING created_at AT TIME ZONE 'Asia/Ho_Chi_Minh';
ALTER TABLE public.s3_file_logs ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.web_push_subscriptions ALTER COLUMN created_at DROP DEFAULT;
ALTER TABLE public.web_push_subscriptions
  ALTER COLUMN created_at TYPE timestamp with time zone
  USING created_at AT TIME ZONE 'Asia/Ho_Chi_Minh';
ALTER TABLE public.web_push_subscriptions ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.gateway_registry ALTER COLUMN created_at DROP DEFAULT;
ALTER TABLE public.gateway_registry
  ALTER COLUMN created_at TYPE timestamp with time zone
  USING created_at AT TIME ZONE 'Asia/Ho_Chi_Minh';
ALTER TABLE public.gateway_registry ALTER COLUMN created_at SET DEFAULT now();
COMMIT;

-- Manual rollback (do not run as part of the forward migration):
-- BEGIN;
-- ALTER TABLE public.s3_file_logs ALTER COLUMN created_at DROP DEFAULT;
-- ALTER TABLE public.web_push_subscriptions ALTER COLUMN created_at DROP DEFAULT;
-- ALTER TABLE public.gateway_registry ALTER COLUMN created_at DROP DEFAULT;
-- ALTER TABLE public.s3_file_logs ALTER COLUMN created_at TYPE timestamp without time zone
--   USING created_at AT TIME ZONE 'Asia/Ho_Chi_Minh';
-- ALTER TABLE public.web_push_subscriptions ALTER COLUMN created_at TYPE timestamp without time zone
--   USING created_at AT TIME ZONE 'Asia/Ho_Chi_Minh';
-- ALTER TABLE public.gateway_registry ALTER COLUMN created_at TYPE timestamp without time zone
--   USING created_at AT TIME ZONE 'Asia/Ho_Chi_Minh';
-- UPDATE public.s3_file_logs a SET created_at = b.created_at
--   FROM time_migration.s3_file_logs_created_at_before_utc b WHERE a.url = b.url;
-- UPDATE public.web_push_subscriptions a SET created_at = b.created_at
--   FROM time_migration.web_push_subscriptions_created_at_before_utc b WHERE a.id = b.id;
-- UPDATE public.gateway_registry a SET created_at = b.created_at
--   FROM time_migration.gateway_registry_created_at_before_utc b WHERE a.id = b.id;
-- ALTER TABLE public.s3_file_logs ALTER COLUMN created_at SET DEFAULT now();
-- ALTER TABLE public.web_push_subscriptions ALTER COLUMN created_at SET DEFAULT now();
-- ALTER TABLE public.gateway_registry ALTER COLUMN created_at SET DEFAULT now();
-- COMMIT;
-- Keep all three backups until auditing ends.