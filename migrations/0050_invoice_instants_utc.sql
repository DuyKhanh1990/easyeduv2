-- Development-only invoice-domain conversion. The old columns contain mixed
-- wall-clock conventions. Current application writers use DB-local time for
-- default created_at, UTC-naive Date values for updates/automatic payments,
-- and local calendar midnight for manually selected invoice dates.
--
-- This is an audited assumption for historical rows, NOT proof of their
-- individual provenance. Both original values and chosen classifications are
-- retained in time_migration for review/rollback. Do not apply to production.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '900s';
SET LOCAL TIME ZONE 'UTC';

CREATE SCHEMA IF NOT EXISTS time_migration;
LOCK TABLE public.invoices, public.invoice_payment_schedule IN ACCESS EXCLUSIVE MODE;

DO $migrate_invoice_instants$
DECLARE
  target record;
  backup_name text;
  field_name text;
  column_type text;
  column_default text;
  key_is_primary boolean;
  source_count bigint;
  backup_count bigint;
  mismatch_count bigint;
  assumed_count bigint;
BEGIN
  FOR target IN
    SELECT * FROM (VALUES
      ('invoices', 'invoices_before_utc_0050'),
      ('invoice_payment_schedule', 'invoice_payment_schedule_before_utc_0050')
    ) AS targets(table_name, backup_table)
  LOOP
    backup_name := target.backup_table;
    IF to_regclass(format('time_migration.%I', backup_name)) IS NOT NULL THEN
      RAISE EXCEPTION 'Backup time_migration.% already exists', backup_name;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM pg_constraint pk
      JOIN pg_class rel ON rel.oid = pk.conrelid
      JOIN pg_namespace ns ON ns.oid = rel.relnamespace
      JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attname = 'id'
      WHERE ns.nspname = 'public' AND rel.relname = target.table_name
        AND pk.contype = 'p' AND pk.conkey = ARRAY[att.attnum]::smallint[]
    ) INTO key_is_primary;
    IF NOT key_is_primary THEN
      RAISE EXCEPTION 'public.% needs a single-column id primary key', target.table_name;
    END IF;

    FOREACH field_name IN ARRAY ARRAY['created_at', 'updated_at', 'paid_at']
    LOOP
      SELECT c.data_type, c.column_default
        INTO column_type, column_default
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = target.table_name
        AND c.column_name = field_name;
      IF column_type IS DISTINCT FROM 'timestamp without time zone' THEN
        RAISE EXCEPTION 'public.%.% is not a legacy timestamp', target.table_name, field_name;
      END IF;
      IF field_name <> 'paid_at' AND column_default IS DISTINCT FROM 'now()' THEN
        RAISE EXCEPTION 'Unexpected default for public.%.%', target.table_name, field_name;
      END IF;
      IF field_name = 'paid_at' AND column_default IS NOT NULL THEN
        RAISE EXCEPTION 'Unexpected paid_at default on public.%', target.table_name;
      END IF;
    END LOOP;

    EXECUTE format($sql$
      CREATE TABLE time_migration.%I AS
      SELECT id, created_at AS created_original,
             updated_at AS updated_original, paid_at AS paid_original,
             CASE
               WHEN abs(extract(epoch FROM updated_at - created_at)) < 60
                 THEN 'local_near_created'
               ELSE 'assumed_utc'
             END AS updated_source,
             CASE WHEN paid_at IS NULL THEN 'null'
                  WHEN paid_at::time = time '00:00:00' THEN 'local_manual_date'
                  ELSE 'assumed_utc'
             END AS paid_source
      FROM public.%I
    $sql$, backup_name, target.table_name);
    EXECUTE format('ALTER TABLE time_migration.%I ADD PRIMARY KEY (id)', backup_name);
    EXECUTE format('SELECT count(*) FROM public.%I', target.table_name) INTO source_count;
    EXECUTE format('SELECT count(*) FROM time_migration.%I', backup_name) INTO backup_count;
    IF source_count <> backup_count THEN
      RAISE EXCEPTION 'Backup count mismatch for %: % vs %',
        target.table_name, source_count, backup_count;
    END IF;
  END LOOP;

  FOR target IN
    SELECT * FROM (VALUES
      ('invoices', 'invoices_before_utc_0050'),
      ('invoice_payment_schedule', 'invoice_payment_schedule_before_utc_0050')
    ) AS targets(table_name, backup_table)
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN created_at DROP DEFAULT, ALTER COLUMN updated_at DROP DEFAULT',
      target.table_name
    );
    -- Order matters: updated_at classification still needs the original
    -- timestamp-without-time-zone created_at in this USING expression.
    EXECUTE format($sql$
      ALTER TABLE public.%I ALTER COLUMN updated_at TYPE timestamptz
      USING CASE
        WHEN abs(extract(epoch FROM updated_at - created_at)) < 60
          THEN updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh'
        ELSE updated_at AT TIME ZONE 'UTC'
      END
    $sql$, target.table_name);
    EXECUTE format($sql$
      ALTER TABLE public.%I ALTER COLUMN paid_at TYPE timestamptz
      USING CASE
        WHEN paid_at::time = time '00:00:00'
          THEN paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh'
        ELSE paid_at AT TIME ZONE 'UTC'
      END
    $sql$, target.table_name);
    EXECUTE format($sql$
      ALTER TABLE public.%I ALTER COLUMN created_at TYPE timestamptz
      USING created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'
    $sql$, target.table_name);
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN created_at SET DEFAULT now(), ALTER COLUMN updated_at SET DEFAULT now()',
      target.table_name
    );

    EXECUTE format($sql$
      SELECT count(*) FROM public.%I row
      FULL JOIN time_migration.%I backup ON row.id = backup.id
      WHERE row.id IS NULL OR backup.id IS NULL
         OR row.created_at IS DISTINCT FROM
            (backup.created_original AT TIME ZONE 'Asia/Ho_Chi_Minh')
         OR row.updated_at IS DISTINCT FROM
            (backup.updated_original AT TIME ZONE
              CASE WHEN backup.updated_source = 'local_near_created'
                THEN 'Asia/Ho_Chi_Minh' ELSE 'UTC' END)
         OR row.paid_at IS DISTINCT FROM
            (backup.paid_original AT TIME ZONE
              CASE WHEN backup.paid_source = 'local_manual_date'
                THEN 'Asia/Ho_Chi_Minh' ELSE 'UTC' END)
    $sql$, target.table_name, target.backup_table) INTO mismatch_count;
    IF mismatch_count <> 0 THEN
      RAISE EXCEPTION 'Invoice time round-trip mismatch for %: % rows',
        target.table_name, mismatch_count;
    END IF;

    EXECUTE format('SELECT count(*) FROM public.%I', target.table_name) INTO source_count;
    EXECUTE format(
      'SELECT count(*) FROM time_migration.%I WHERE updated_source = %L',
      target.backup_table, 'assumed_utc'
    ) INTO assumed_count;
    RAISE NOTICE '%: % rows converted; % updated_at rows inferred as UTC-naive (review backup)',
      target.table_name, source_count, assumed_count;
  END LOOP;
END
$migrate_invoice_instants$;
COMMIT;

-- Rollback requires a maintenance window. Restore each legacy timestamp from
-- the matching time_migration backup, including its original source flags.
-- Do not discard the backups or blindly roll back after new records have been
-- written to the TIMESTAMPTZ columns.