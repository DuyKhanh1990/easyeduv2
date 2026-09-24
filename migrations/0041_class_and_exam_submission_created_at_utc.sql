-- Both columns are omitted by the current application insert paths and use
-- the database now() default in the Asia/Ho_Chi_Minh session timezone.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'class_sessions'
      AND column_name = 'created_at' AND data_type = 'timestamp without time zone'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exam_submissions'
      AND column_name = 'created_at' AND data_type = 'timestamp without time zone'
  ) THEN
    RAISE EXCEPTION 'one or more created_at columns are not legacy timestamps';
  END IF;
  IF to_regclass('time_migration.class_sessions_created_at_before_utc') IS NOT NULL
    OR to_regclass('time_migration.exam_submissions_created_at_before_utc') IS NOT NULL THEN
    RAISE EXCEPTION 'a created_at backup already exists; inspect before proceeding';
  END IF;
END
$guard$;

CREATE SCHEMA IF NOT EXISTS time_migration;
CREATE TABLE time_migration.class_sessions_created_at_before_utc AS
  SELECT id, created_at FROM public.class_sessions;
ALTER TABLE time_migration.class_sessions_created_at_before_utc ADD PRIMARY KEY (id);
CREATE TABLE time_migration.exam_submissions_created_at_before_utc AS
  SELECT id, created_at FROM public.exam_submissions;
ALTER TABLE time_migration.exam_submissions_created_at_before_utc ADD PRIMARY KEY (id);

DO $guard$
BEGIN
  IF (SELECT count(*) FROM time_migration.class_sessions_created_at_before_utc)
       <> (SELECT count(*) FROM public.class_sessions)
    OR (SELECT count(*) FROM time_migration.exam_submissions_created_at_before_utc)
       <> (SELECT count(*) FROM public.exam_submissions) THEN
    RAISE EXCEPTION 'a created_at backup row count does not match';
  END IF;
END
$guard$;

ALTER TABLE public.class_sessions ALTER COLUMN created_at DROP DEFAULT;
ALTER TABLE public.class_sessions
  ALTER COLUMN created_at TYPE timestamp with time zone
  USING created_at AT TIME ZONE 'Asia/Ho_Chi_Minh';
ALTER TABLE public.class_sessions ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.exam_submissions ALTER COLUMN created_at DROP DEFAULT;
ALTER TABLE public.exam_submissions
  ALTER COLUMN created_at TYPE timestamp with time zone
  USING created_at AT TIME ZONE 'Asia/Ho_Chi_Minh';
ALTER TABLE public.exam_submissions ALTER COLUMN created_at SET DEFAULT now();
COMMIT;

-- Manual rollback (do not run as part of the forward migration):
-- BEGIN;
-- ALTER TABLE public.class_sessions ALTER COLUMN created_at DROP DEFAULT;
-- ALTER TABLE public.exam_submissions ALTER COLUMN created_at DROP DEFAULT;
-- ALTER TABLE public.class_sessions
--   ALTER COLUMN created_at TYPE timestamp without time zone
--   USING created_at AT TIME ZONE 'Asia/Ho_Chi_Minh';
-- ALTER TABLE public.exam_submissions
--   ALTER COLUMN created_at TYPE timestamp without time zone
--   USING created_at AT TIME ZONE 'Asia/Ho_Chi_Minh';
-- UPDATE public.class_sessions c SET created_at = b.created_at
-- FROM time_migration.class_sessions_created_at_before_utc b WHERE c.id = b.id;
-- UPDATE public.exam_submissions e SET created_at = b.created_at
-- FROM time_migration.exam_submissions_created_at_before_utc b WHERE e.id = b.id;
-- ALTER TABLE public.class_sessions ALTER COLUMN created_at SET DEFAULT now();
-- ALTER TABLE public.exam_submissions ALTER COLUMN created_at SET DEFAULT now();
-- COMMIT;
-- Keep both backups until auditing ends.