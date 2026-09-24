-- These four timestamp fields use DEFAULT now() on all current application
-- INSERT paths. Historical values are interpreted as Asia/Ho_Chi_Minh wall
-- time, the development database session timezone. Development only.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '900s';

CREATE SCHEMA IF NOT EXISTS time_migration;

DO $migrate_db_default_named_instants$
DECLARE
  target record;
  backup_table text;
  legacy_type text;
  legacy_default text;
  null_count bigint;
  source_count bigint;
  backup_count bigint;
  mismatch_count bigint;
  key_is_primary_key boolean;
BEGIN
  -- Fail before locking or creating backups if the audited schema changed.
  FOR target IN
    SELECT *
    FROM (VALUES
      ('center_registry', 'registered_at', 'center_id'),
      ('database_backups', 'requested_at', 'id'),
      ('free_class_registrations', 'registered_at', 'id'),
      ('teacher_salary_published_rows', 'published_at', 'id')
    ) AS targets(table_name, column_name, key_column)
  LOOP
    SELECT c.data_type, c.column_default
      INTO legacy_type, legacy_default
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = target.table_name
      AND c.column_name = target.column_name;

    IF legacy_type IS DISTINCT FROM 'timestamp without time zone' THEN
      RAISE EXCEPTION 'public.%.% is not a legacy timestamp', target.table_name, target.column_name;
    END IF;
    IF legacy_default IS DISTINCT FROM 'now()' THEN
      RAISE EXCEPTION 'public.%.% does not have the expected now() default',
        target.table_name, target.column_name;
    END IF;

    EXECUTE format(
      'SELECT count(*) FROM public.%I WHERE %I IS NULL',
      target.table_name, target.column_name
    ) INTO null_count;
    IF null_count <> 0 THEN
      RAISE EXCEPTION 'public.%.% has % null rows',
        target.table_name, target.column_name, null_count;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM pg_constraint pk
      JOIN pg_class rel ON rel.oid = pk.conrelid
      JOIN pg_namespace ns ON ns.oid = rel.relnamespace
      JOIN pg_attribute att
        ON att.attrelid = rel.oid
       AND att.attname = target.key_column
       AND att.attnum > 0
      WHERE ns.nspname = 'public'
        AND rel.relname = target.table_name
        AND pk.contype = 'p'
        AND pk.conkey = ARRAY[att.attnum]::smallint[]
    ) INTO key_is_primary_key;
    IF NOT key_is_primary_key THEN
      RAISE EXCEPTION 'public.% must have a single-column primary key on %',
        target.table_name, target.key_column;
    END IF;

    backup_table := target.table_name || '_' || target.column_name || '_before_utc';
    IF to_regclass(format('time_migration.%I', backup_table)) IS NOT NULL THEN
      RAISE EXCEPTION 'backup time_migration.% already exists; inspect before proceeding',
        backup_table;
    END IF;
  END LOOP;

  -- Keep a consistent snapshot across backups and type changes.
  FOR target IN
    SELECT *
    FROM (VALUES
      ('center_registry', 'registered_at', 'center_id'),
      ('database_backups', 'requested_at', 'id'),
      ('free_class_registrations', 'registered_at', 'id'),
      ('teacher_salary_published_rows', 'published_at', 'id')
    ) AS targets(table_name, column_name, key_column)
  LOOP
    EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE', target.table_name);
  END LOOP;

  FOR target IN
    SELECT *
    FROM (VALUES
      ('center_registry', 'registered_at', 'center_id'),
      ('database_backups', 'requested_at', 'id'),
      ('free_class_registrations', 'registered_at', 'id'),
      ('teacher_salary_published_rows', 'published_at', 'id')
    ) AS targets(table_name, column_name, key_column)
  LOOP
    backup_table := target.table_name || '_' || target.column_name || '_before_utc';
    EXECUTE format(
      'CREATE TABLE time_migration.%I AS SELECT %I AS key_value, %I AS timestamp_value FROM public.%I',
      backup_table, target.key_column, target.column_name, target.table_name
    );
    EXECUTE format('ALTER TABLE time_migration.%I ADD PRIMARY KEY (key_value)', backup_table);

    EXECUTE format('SELECT count(*) FROM public.%I', target.table_name) INTO source_count;
    EXECUTE format('SELECT count(*) FROM time_migration.%I', backup_table) INTO backup_count;
    IF source_count <> backup_count THEN
      RAISE EXCEPTION 'backup row count mismatch for public.%.%: source %, backup %',
        target.table_name, target.column_name, source_count, backup_count;
    END IF;
  END LOOP;

  FOR target IN
    SELECT *
    FROM (VALUES
      ('center_registry', 'registered_at', 'center_id'),
      ('database_backups', 'requested_at', 'id'),
      ('free_class_registrations', 'registered_at', 'id'),
      ('teacher_salary_published_rows', 'published_at', 'id')
    ) AS targets(table_name, column_name, key_column)
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN %I DROP DEFAULT',
      target.table_name, target.column_name
    );
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN %I TYPE timestamp with time zone USING %I AT TIME ZONE %L',
      target.table_name, target.column_name, target.column_name, 'Asia/Ho_Chi_Minh'
    );
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN %I SET DEFAULT now()',
      target.table_name, target.column_name
    );
  END LOOP;

  -- Verify every key and original wall-clock value before commit.
  FOR target IN
    SELECT *
    FROM (VALUES
      ('center_registry', 'registered_at', 'center_id'),
      ('database_backups', 'requested_at', 'id'),
      ('free_class_registrations', 'registered_at', 'id'),
      ('teacher_salary_published_rows', 'published_at', 'id')
    ) AS targets(table_name, column_name, key_column)
  LOOP
    backup_table := target.table_name || '_' || target.column_name || '_before_utc';
    EXECUTE format(
      'SELECT count(*) FROM public.%I AS target FULL OUTER JOIN time_migration.%I AS backup ON target.%I = backup.key_value WHERE target.%I IS NULL OR backup.key_value IS NULL OR backup.timestamp_value IS DISTINCT FROM (target.%I AT TIME ZONE %L)',
      target.table_name, backup_table, target.key_column, target.key_column,
      target.column_name, 'Asia/Ho_Chi_Minh'
    ) INTO mismatch_count;
    IF mismatch_count <> 0 THEN
      RAISE EXCEPTION 'round-trip mismatch for public.%.%: % rows',
        target.table_name, target.column_name, mismatch_count;
    END IF;
  END LOOP;
END
$migrate_db_default_named_instants$;
COMMIT;

-- Manual rollback (do not run as part of the forward migration):
-- BEGIN;
-- SET LOCAL lock_timeout = '10s';
-- SET LOCAL statement_timeout = '900s';
-- DO $rollback_db_default_named_instants$
-- DECLARE
--   target record;
--   backup_table text;
-- BEGIN
--   FOR target IN
--     SELECT * FROM (VALUES
--       ('center_registry', 'registered_at', 'center_id'),
--       ('database_backups', 'requested_at', 'id'),
--       ('free_class_registrations', 'registered_at', 'id'),
--       ('teacher_salary_published_rows', 'published_at', 'id')
--     ) AS targets(table_name, column_name, key_column)
--   LOOP
--     backup_table := target.table_name || '_' || target.column_name || '_before_utc';
--     EXECUTE format(
--       'ALTER TABLE public.%I ALTER COLUMN %I DROP DEFAULT',
--       target.table_name, target.column_name
--     );
--     EXECUTE format(
--       'ALTER TABLE public.%I ALTER COLUMN %I TYPE timestamp without time zone USING %I AT TIME ZONE %L',
--       target.table_name, target.column_name, target.column_name, 'Asia/Ho_Chi_Minh'
--     );
--     EXECUTE format(
--       'UPDATE public.%I AS target SET %I = backup.timestamp_value FROM time_migration.%I AS backup WHERE target.%I = backup.key_value',
--       target.table_name, target.column_name, backup_table, target.key_column
--     );
--     EXECUTE format(
--       'ALTER TABLE public.%I ALTER COLUMN %I SET DEFAULT now()',
--       target.table_name, target.column_name
--     );
--   END LOOP;
-- END
-- $rollback_db_default_named_instants$;
-- COMMIT;
-- Keep backups until the full timestamp audit is complete.