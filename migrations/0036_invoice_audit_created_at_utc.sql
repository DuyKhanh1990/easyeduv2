-- Invoice audit log created_at is omitted by its application writer and is
-- supplied by the DB default in the Asia/Ho_Chi_Minh session timezone.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invoice_audit_logs'
      AND column_name = 'created_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    RAISE EXCEPTION 'invoice_audit_logs.created_at is not a legacy timestamp';
  END IF;
  IF to_regclass('time_migration.invoice_audit_logs_created_at_before_utc') IS NOT NULL THEN
    RAISE EXCEPTION 'invoice audit backup already exists; inspect it before proceeding';
  END IF;
END
$guard$;

CREATE SCHEMA IF NOT EXISTS time_migration;
CREATE TABLE time_migration.invoice_audit_logs_created_at_before_utc AS
  SELECT id, created_at FROM public.invoice_audit_logs;
ALTER TABLE time_migration.invoice_audit_logs_created_at_before_utc
  ADD PRIMARY KEY (id);

DO $guard$
BEGIN
  IF (SELECT count(*) FROM time_migration.invoice_audit_logs_created_at_before_utc)
     <> (SELECT count(*) FROM public.invoice_audit_logs) THEN
    RAISE EXCEPTION 'invoice audit backup row count does not match';
  END IF;
END
$guard$;

ALTER TABLE public.invoice_audit_logs
  ALTER COLUMN created_at DROP DEFAULT;
ALTER TABLE public.invoice_audit_logs
  ALTER COLUMN created_at TYPE timestamp with time zone
  USING created_at AT TIME ZONE 'Asia/Ho_Chi_Minh';
ALTER TABLE public.invoice_audit_logs
  ALTER COLUMN created_at SET DEFAULT now();
COMMIT;

-- Manual rollback (do not run as part of the forward migration):
-- BEGIN;
-- ALTER TABLE public.invoice_audit_logs ALTER COLUMN created_at DROP DEFAULT;
-- ALTER TABLE public.invoice_audit_logs
--   ALTER COLUMN created_at TYPE timestamp without time zone
--   USING created_at AT TIME ZONE 'Asia/Ho_Chi_Minh';
-- UPDATE public.invoice_audit_logs a SET created_at = b.created_at
--   FROM time_migration.invoice_audit_logs_created_at_before_utc b
--   WHERE a.id = b.id;
-- ALTER TABLE public.invoice_audit_logs ALTER COLUMN created_at SET DEFAULT now();
-- COMMIT;