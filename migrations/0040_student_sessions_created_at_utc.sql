-- Every application insert path constructs student_sessions rows without
-- created_at, so PostgreSQL supplies now() in the Asia/Ho_Chi_Minh session
-- timezone. Preserve the legacy wall-clock values for exact rollback.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'student_sessions'
      AND column_name = 'created_at' AND data_type = 'timestamp without time zone'
  ) THEN
    RAISE EXCEPTION 'student_sessions.created_at is not a legacy timestamp';
  END IF;
  IF to_regclass('time_migration.student_sessions_created_at_before_utc') IS NOT NULL THEN
    RAISE EXCEPTION 'student session created_at backup already exists; inspect before proceeding';
  END IF;
END
$guard$;

CREATE SCHEMA IF NOT EXISTS time_migration;
CREATE TABLE time_migration.student_sessions_created_at_before_utc AS
  SELECT id, created_at FROM public.student_sessions;
ALTER TABLE time_migration.student_sessions_created_at_before_utc ADD PRIMARY KEY (id);

DO $guard$
BEGIN
  IF (SELECT count(*) FROM time_migration.student_sessions_created_at_before_utc)
     <> (SELECT count(*) FROM public.student_sessions) THEN
    RAISE EXCEPTION 'student session created_at backup row count does not match';
  END IF;
END
$guard$;

ALTER TABLE public.student_sessions ALTER COLUMN created_at DROP DEFAULT;
ALTER TABLE public.student_sessions
  ALTER COLUMN created_at TYPE timestamp with time zone
  USING created_at AT TIME ZONE 'Asia/Ho_Chi_Minh';
ALTER TABLE public.student_sessions ALTER COLUMN created_at SET DEFAULT now();
COMMIT;

-- Manual rollback (do not run as part of the forward migration):
-- BEGIN;
-- ALTER TABLE public.student_sessions ALTER COLUMN created_at DROP DEFAULT;
-- ALTER TABLE public.student_sessions
--   ALTER COLUMN created_at TYPE timestamp without time zone
--   USING created_at AT TIME ZONE 'Asia/Ho_Chi_Minh';
-- UPDATE public.student_sessions s SET created_at = b.created_at
-- FROM time_migration.student_sessions_created_at_before_utc b WHERE s.id = b.id;
-- ALTER TABLE public.student_sessions ALTER COLUMN created_at SET DEFAULT now();
-- COMMIT;
-- Keep the backup until auditing ends.