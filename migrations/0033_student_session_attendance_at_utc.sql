-- Convert the student-session attendance instant from a UTC-naive timestamp
-- to a true instant. The two application writers both pass server new Date().
-- Run this migration only against the database whose current writers were
-- audited; it does not apply to unrelated timestamp columns.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'student_sessions'
      AND column_name = 'attendance_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    RAISE EXCEPTION 'student_sessions.attendance_at is not a legacy timestamp';
  END IF;
  IF to_regclass('time_migration.student_sessions_attendance_at_before_utc') IS NOT NULL THEN
    RAISE EXCEPTION 'attendance_at backup already exists; inspect it before proceeding';
  END IF;
END
$guard$;

CREATE SCHEMA IF NOT EXISTS time_migration;
CREATE TABLE time_migration.student_sessions_attendance_at_before_utc AS
  SELECT id, attendance_at FROM public.student_sessions;
ALTER TABLE time_migration.student_sessions_attendance_at_before_utc
  ADD PRIMARY KEY (id);

DO $guard$
BEGIN
  IF (SELECT count(*) FROM time_migration.student_sessions_attendance_at_before_utc)
     <> (SELECT count(*) FROM public.student_sessions) THEN
    RAISE EXCEPTION 'attendance_at backup row count does not match';
  END IF;
END
$guard$;

ALTER TABLE public.student_sessions
  ALTER COLUMN attendance_at TYPE timestamp with time zone
  USING attendance_at AT TIME ZONE 'UTC';
COMMIT;

-- Manual rollback (do not run as part of the forward migration):
-- BEGIN;
-- ALTER TABLE public.student_sessions
--   ALTER COLUMN attendance_at TYPE timestamp without time zone
--   USING attendance_at AT TIME ZONE 'UTC';
-- UPDATE public.student_sessions s SET attendance_at = b.attendance_at
--   FROM time_migration.student_sessions_attendance_at_before_utc b
--   WHERE s.id = b.id;
-- COMMIT;
-- Keep the backup while historical timestamps are still audited.