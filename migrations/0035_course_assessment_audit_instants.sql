-- Both audit writers omit created_at; their DB defaults stored the
-- Asia/Ho_Chi_Minh wall clock in the legacy timestamp columns.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'course_audit_logs'
      AND column_name = 'created_at' AND data_type = 'timestamp without time zone'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assessment_audit_logs'
      AND column_name = 'created_at' AND data_type = 'timestamp without time zone'
  ) THEN
    RAISE EXCEPTION 'course/assessment audit created_at columns are not legacy timestamps';
  END IF;
  IF to_regclass('time_migration.course_audit_logs_created_at_before_utc') IS NOT NULL
    OR to_regclass('time_migration.assessment_audit_logs_created_at_before_utc') IS NOT NULL THEN
    RAISE EXCEPTION 'course/assessment audit backup already exists; inspect it before proceeding';
  END IF;
END
$guard$;

CREATE SCHEMA IF NOT EXISTS time_migration;
CREATE TABLE time_migration.course_audit_logs_created_at_before_utc AS
  SELECT id, created_at FROM public.course_audit_logs;
ALTER TABLE time_migration.course_audit_logs_created_at_before_utc
  ADD PRIMARY KEY (id);
CREATE TABLE time_migration.assessment_audit_logs_created_at_before_utc AS
  SELECT id, created_at FROM public.assessment_audit_logs;
ALTER TABLE time_migration.assessment_audit_logs_created_at_before_utc
  ADD PRIMARY KEY (id);

DO $guard$
BEGIN
  IF (SELECT count(*) FROM time_migration.course_audit_logs_created_at_before_utc)
     <> (SELECT count(*) FROM public.course_audit_logs)
     OR (SELECT count(*) FROM time_migration.assessment_audit_logs_created_at_before_utc)
     <> (SELECT count(*) FROM public.assessment_audit_logs) THEN
    RAISE EXCEPTION 'course/assessment audit backup row count does not match';
  END IF;
END
$guard$;

ALTER TABLE public.course_audit_logs
  ALTER COLUMN created_at DROP DEFAULT;
ALTER TABLE public.course_audit_logs
  ALTER COLUMN created_at TYPE timestamp with time zone
  USING created_at AT TIME ZONE 'Asia/Ho_Chi_Minh';
ALTER TABLE public.course_audit_logs
  ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.assessment_audit_logs
  ALTER COLUMN created_at DROP DEFAULT;
ALTER TABLE public.assessment_audit_logs
  ALTER COLUMN created_at TYPE timestamp with time zone
  USING created_at AT TIME ZONE 'Asia/Ho_Chi_Minh';
ALTER TABLE public.assessment_audit_logs
  ALTER COLUMN created_at SET DEFAULT now();
COMMIT;

-- Manual rollback (not part of the forward migration): in a new transaction
-- drop both defaults, change each column back to timestamp without time zone
-- USING created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', restore each pre-migration
-- row's created_at from its matching time_migration backup by id, set both
-- defaults to now(), and commit. Keep the backups during historical auditing.