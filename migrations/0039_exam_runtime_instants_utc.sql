-- Exam runtime start/expiry values are created by the server as JavaScript
-- Date instants. The legacy timestamp columns stored their UTC components.
-- submitted_at is intentionally excluded because callers may supply it.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exam_sessions'
      AND column_name = 'started_at' AND data_type = 'timestamp without time zone'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exam_sessions'
      AND column_name = 'expires_at' AND data_type = 'timestamp without time zone'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exam_submissions'
      AND column_name = 'started_at' AND data_type = 'timestamp without time zone'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exam_submissions'
      AND column_name = 'expires_at' AND data_type = 'timestamp without time zone'
  ) THEN
    RAISE EXCEPTION 'one or more exam runtime columns are not legacy timestamps';
  END IF;
  IF to_regclass('time_migration.exam_sessions_runtime_before_utc') IS NOT NULL
    OR to_regclass('time_migration.exam_submissions_runtime_before_utc') IS NOT NULL THEN
    RAISE EXCEPTION 'an exam runtime backup already exists; inspect before proceeding';
  END IF;
END
$guard$;

CREATE SCHEMA IF NOT EXISTS time_migration;
CREATE TABLE time_migration.exam_sessions_runtime_before_utc AS
  SELECT id, started_at, expires_at FROM public.exam_sessions;
ALTER TABLE time_migration.exam_sessions_runtime_before_utc ADD PRIMARY KEY (id);
CREATE TABLE time_migration.exam_submissions_runtime_before_utc AS
  SELECT id, started_at, expires_at FROM public.exam_submissions;
ALTER TABLE time_migration.exam_submissions_runtime_before_utc ADD PRIMARY KEY (id);

DO $guard$
BEGIN
  IF (SELECT count(*) FROM time_migration.exam_sessions_runtime_before_utc)
       <> (SELECT count(*) FROM public.exam_sessions)
    OR (SELECT count(*) FROM time_migration.exam_submissions_runtime_before_utc)
       <> (SELECT count(*) FROM public.exam_submissions) THEN
    RAISE EXCEPTION 'an exam runtime backup row count does not match';
  END IF;
END
$guard$;

ALTER TABLE public.exam_sessions
  ALTER COLUMN started_at TYPE timestamp with time zone
    USING started_at AT TIME ZONE 'UTC',
  ALTER COLUMN expires_at TYPE timestamp with time zone
    USING expires_at AT TIME ZONE 'UTC';
ALTER TABLE public.exam_submissions
  ALTER COLUMN started_at TYPE timestamp with time zone
    USING started_at AT TIME ZONE 'UTC',
  ALTER COLUMN expires_at TYPE timestamp with time zone
    USING expires_at AT TIME ZONE 'UTC';
COMMIT;

-- Manual rollback (do not run as part of the forward migration):
-- BEGIN;
-- ALTER TABLE public.exam_sessions
--   ALTER COLUMN started_at TYPE timestamp without time zone
--     USING started_at AT TIME ZONE 'UTC',
--   ALTER COLUMN expires_at TYPE timestamp without time zone
--     USING expires_at AT TIME ZONE 'UTC';
-- ALTER TABLE public.exam_submissions
--   ALTER COLUMN started_at TYPE timestamp without time zone
--     USING started_at AT TIME ZONE 'UTC',
--   ALTER COLUMN expires_at TYPE timestamp without time zone
--     USING expires_at AT TIME ZONE 'UTC';
-- UPDATE public.exam_sessions e SET started_at = b.started_at, expires_at = b.expires_at
-- FROM time_migration.exam_sessions_runtime_before_utc b WHERE e.id = b.id;
-- UPDATE public.exam_submissions e SET started_at = b.started_at, expires_at = b.expires_at
-- FROM time_migration.exam_submissions_runtime_before_utc b WHERE e.id = b.id;
-- COMMIT;
-- Keep both backups until auditing ends.