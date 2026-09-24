-- online_clicked_at and online_ended_at are written from server JavaScript
-- Date values. Legacy timestamp columns therefore contain UTC wall-clock
-- components and must be interpreted as UTC when migrated.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'student_sessions'
      AND column_name = 'online_clicked_at' AND data_type = 'timestamp without time zone'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'student_sessions'
      AND column_name = 'online_ended_at' AND data_type = 'timestamp without time zone'
  ) THEN
    RAISE EXCEPTION 'student session online timestamps are not legacy timestamps';
  END IF;
  IF to_regclass('time_migration.student_sessions_online_times_before_utc') IS NOT NULL THEN
    RAISE EXCEPTION 'student session online timestamp backup already exists; inspect it before proceeding';
  END IF;
END
$guard$;

CREATE SCHEMA IF NOT EXISTS time_migration;
CREATE TABLE time_migration.student_sessions_online_times_before_utc AS
  SELECT id, online_clicked_at, online_ended_at FROM public.student_sessions;
ALTER TABLE time_migration.student_sessions_online_times_before_utc ADD PRIMARY KEY (id);

DO $guard$
BEGIN
  IF (SELECT count(*) FROM time_migration.student_sessions_online_times_before_utc)
     <> (SELECT count(*) FROM public.student_sessions) THEN
    RAISE EXCEPTION 'student session online timestamp backup row count does not match';
  END IF;
END
$guard$;

ALTER TABLE public.student_sessions
  ALTER COLUMN online_clicked_at TYPE timestamp with time zone
    USING online_clicked_at AT TIME ZONE 'UTC',
  ALTER COLUMN online_ended_at TYPE timestamp with time zone
    USING online_ended_at AT TIME ZONE 'UTC';
COMMIT;

-- Manual rollback (do not run as part of the forward migration):
-- BEGIN;
-- ALTER TABLE public.student_sessions
--   ALTER COLUMN online_clicked_at TYPE timestamp without time zone
--     USING online_clicked_at AT TIME ZONE 'UTC',
--   ALTER COLUMN online_ended_at TYPE timestamp without time zone
--     USING online_ended_at AT TIME ZONE 'UTC';
-- UPDATE public.student_sessions s
-- SET online_clicked_at = b.online_clicked_at, online_ended_at = b.online_ended_at
-- FROM time_migration.student_sessions_online_times_before_utc b
-- WHERE s.id = b.id;
-- COMMIT;
-- Keep the backup until auditing ends.