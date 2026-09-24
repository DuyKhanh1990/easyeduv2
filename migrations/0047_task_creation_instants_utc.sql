-- Task and task-comment creation timestamps are omitted from every current
-- application insert path and use the database now() default. The development
-- database session timezone is Asia/Ho_Chi_Minh, so preserve that wall time.
-- updated_at and due_date are intentionally excluded: they have different
-- write/semantic rules.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE SCHEMA IF NOT EXISTS time_migration;

DO $guard_and_backup$
DECLARE
  target_table text;
  backup_table text;
  legacy_type text;
  legacy_default text;
  source_count bigint;
  backup_count bigint;
  target_tables text[] := ARRAY['tasks', 'task_comments'];
BEGIN
  FOREACH target_table IN ARRAY target_tables LOOP
    SELECT c.data_type, c.column_default
      INTO legacy_type, legacy_default
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = target_table
      AND c.column_name = 'created_at';
    IF legacy_type IS DISTINCT FROM 'timestamp without time zone' THEN
      RAISE EXCEPTION 'public.%.created_at is not a legacy timestamp', target_table;
    END IF;
    IF legacy_default IS DISTINCT FROM 'now()' THEN
      RAISE EXCEPTION 'public.%.created_at does not have the expected now() default', target_table;
    END IF;

    backup_table := target_table || '_created_at_before_utc';
    IF to_regclass(format('time_migration.%I', backup_table)) IS NOT NULL THEN
      RAISE EXCEPTION 'backup time_migration.% already exists; inspect before proceeding', backup_table;
    END IF;

    EXECUTE format(
      'CREATE TABLE time_migration.%I AS SELECT id, created_at FROM public.%I',
      backup_table, target_table
    );
    EXECUTE format('ALTER TABLE time_migration.%I ADD PRIMARY KEY (id)', backup_table);
    EXECUTE format('SELECT count(*) FROM public.%I', target_table) INTO source_count;
    EXECUTE format('SELECT count(*) FROM time_migration.%I', backup_table) INTO backup_count;
    IF source_count <> backup_count THEN
      RAISE EXCEPTION 'backup row count mismatch for public.%', target_table;
    END IF;
  END LOOP;
END
$guard_and_backup$;

DO $convert$
DECLARE
  target_table text;
  target_tables text[] := ARRAY['tasks', 'task_comments'];
BEGIN
  FOREACH target_table IN ARRAY target_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN created_at DROP DEFAULT', target_table);
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN created_at TYPE timestamp with time zone USING created_at AT TIME ZONE %L',
      target_table, 'Asia/Ho_Chi_Minh'
    );
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN created_at SET DEFAULT now()', target_table);
  END LOOP;
END
$convert$;
COMMIT;

-- Manual rollback (do not run as part of the forward migration):
-- BEGIN;
-- DO $rollback$
-- DECLARE
--   target_table text;
--   backup_table text;
--   target_tables text[] := ARRAY['tasks', 'task_comments'];
-- BEGIN
--   FOREACH target_table IN ARRAY target_tables LOOP
--     backup_table := target_table || '_created_at_before_utc';
--     EXECUTE format('ALTER TABLE public.%I ALTER COLUMN created_at DROP DEFAULT', target_table);
--     EXECUTE format(
--       'ALTER TABLE public.%I ALTER COLUMN created_at TYPE timestamp without time zone USING created_at AT TIME ZONE %L',
--       target_table, 'Asia/Ho_Chi_Minh'
--     );
--     EXECUTE format(
--       'UPDATE public.%I AS target SET created_at = backup.created_at FROM time_migration.%I AS backup WHERE target.id = backup.id',
--       target_table, backup_table
--     );
--     EXECUTE format('ALTER TABLE public.%I ALTER COLUMN created_at SET DEFAULT now()', target_table);
--   END LOOP;
-- END
-- $rollback$;
-- COMMIT;
-- Keep the backup tables until the broader time audit is complete.