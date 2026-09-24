-- These 67 created_at fields have one current in-repo source: the PostgreSQL
-- database clock in the development session timezone Asia/Ho_Chi_Minh. Most
-- writers omit created_at and use DEFAULT now(); exam_sessions uses SQL NOW()
-- explicitly. Store stock transactions are excluded because some writers
-- copy a parent timestamp or accept a caller-supplied value.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '900s';

CREATE SCHEMA IF NOT EXISTS time_migration;

DO $migrate_cohort$
DECLARE
  target_table text;
  backup_table text;
  legacy_type text;
  legacy_default text;
  source_count bigint;
  backup_count bigint;
  mismatch_count bigint;
  key_column text;
  key_is_primary_key boolean;
  target_tables text[] := ARRAY[
    'bidv_reconciliation_files',
    'bidv_reconciliation_records',
    'bidv_reconciliation_sessions',
    'bidv_transactions',
    'bidv_virtual_accounts',
    'center_notification_settings',
    'center_notification_templates',
    'class_grade_book_scores',
    'class_grade_book_student_comments',
    'class_grade_books',
    'class_session_exclusions',
    'classes',
    'commission_configs',
    'crm_custom_fields',
    'customer_activity_logs',
    'database_backups',
    'database_restores',
    'exam_sessions',
    'exams',
    'finance_promotions',
    'finance_vouchers',
    'free_class_registrations',
    'invoice_commissions',
    'invoice_items',
    'invoice_session_allocations',
    'leave_requests',
    'news_feed_posts',
    'news_feed_reactions',
    'notification_logs',
    'notification_templates',
    'public_holidays',
    'salary_sheet_employees',
    'salary_sheets',
    'session_contents',
    'shift_assignments',
    'short_links',
    'staff',
    'staff_attendances',
    'store_inventory_reservations',
    'store_issue_receipt_audit_logs',
    'store_issue_receipt_items',
    'store_issue_receipts',
    'store_receipt_audit_logs',
    'store_receipt_items',
    'store_receipts',
    'store_transfer_audit_logs',
    'store_transfer_items',
    'store_transfers',
    'student_classes',
    'student_comments',
    'student_leave_requests',
    'student_notification_channels',
    'student_session_contents',
    'student_star_transactions',
    'student_wallet_transactions',
    'students',
    'teacher_attendance',
    'teacher_availability',
    'teacher_salary_row_packages',
    'teacher_salary_session_packages',
    'teacher_salary_tables',
    'test_sessions',
    'tuition_package_change_operations',
    'tuition_package_change_requests',
    'tuition_package_session_adjustments',
    'user_tenant_map',
    'users'
  ];
BEGIN
  -- Fail before taking locks or creating any backup if the live schema differs
  -- from the audited legacy cohort or a backup name has already been used.
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

    key_column := CASE WHEN target_table = 'short_links' THEN 'code' ELSE 'id' END;
    SELECT EXISTS (
      SELECT 1
      FROM pg_constraint pk
      JOIN pg_class rel ON rel.oid = pk.conrelid
      JOIN pg_namespace ns ON ns.oid = rel.relnamespace
      JOIN pg_attribute att
        ON att.attrelid = rel.oid
       AND att.attname = key_column
       AND att.attnum > 0
      WHERE ns.nspname = 'public'
        AND rel.relname = target_table
        AND pk.contype = 'p'
        AND pk.conkey = ARRAY[att.attnum]::smallint[]
    ) INTO key_is_primary_key;
    IF NOT key_is_primary_key THEN
      RAISE EXCEPTION 'public.% must have a single-column primary key on %', target_table, key_column;
    END IF;

    backup_table := target_table || '_created_at_before_utc';
    IF to_regclass(format('time_migration.%I', backup_table)) IS NOT NULL THEN
      RAISE EXCEPTION 'backup time_migration.% already exists; inspect before proceeding', backup_table;
    END IF;
  END LOOP;

  -- Hold a consistent snapshot against concurrent inserts/updates while
  -- creating backups and changing the type. Any lock timeout aborts all work.
  FOREACH target_table IN ARRAY target_tables LOOP
    EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE', target_table);
  END LOOP;

  FOREACH target_table IN ARRAY target_tables LOOP
    backup_table := target_table || '_created_at_before_utc';
    key_column := CASE WHEN target_table = 'short_links' THEN 'code' ELSE 'id' END;
    EXECUTE format(
      'CREATE TABLE time_migration.%I AS SELECT %I AS key_value, created_at FROM public.%I',
      backup_table, key_column, target_table
    );
    EXECUTE format('ALTER TABLE time_migration.%I ADD PRIMARY KEY (key_value)', backup_table);

    EXECUTE format('SELECT count(*) FROM public.%I', target_table) INTO source_count;
    EXECUTE format('SELECT count(*) FROM time_migration.%I', backup_table) INTO backup_count;
    IF source_count <> backup_count THEN
      RAISE EXCEPTION 'backup row count mismatch for public.%: source %, backup %',
        target_table, source_count, backup_count;
    END IF;
  END LOOP;

  FOREACH target_table IN ARRAY target_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN created_at DROP DEFAULT', target_table);
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN created_at TYPE timestamp with time zone USING created_at AT TIME ZONE %L',
      target_table, 'Asia/Ho_Chi_Minh'
    );
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN created_at SET DEFAULT now()', target_table);
  END LOOP;

  -- Check row identity and the complete wall-clock round trip before commit.
  FOREACH target_table IN ARRAY target_tables LOOP
    backup_table := target_table || '_created_at_before_utc';
    key_column := CASE WHEN target_table = 'short_links' THEN 'code' ELSE 'id' END;
    EXECUTE format(
      'SELECT count(*) FROM public.%I AS target FULL OUTER JOIN time_migration.%I AS backup ON target.%I = backup.key_value WHERE target.%I IS NULL OR backup.key_value IS NULL OR backup.created_at IS DISTINCT FROM (target.created_at AT TIME ZONE %L)',
      target_table, backup_table, key_column, key_column, 'Asia/Ho_Chi_Minh'
    ) INTO mismatch_count;
    IF mismatch_count <> 0 THEN
      RAISE EXCEPTION 'round-trip mismatch for public.%: % rows', target_table, mismatch_count;
    END IF;
  END LOOP;
END
$migrate_cohort$;
COMMIT;

-- Manual rollback (do not run as part of the forward migration):
-- BEGIN;
-- SET LOCAL lock_timeout = '10s';
-- SET LOCAL statement_timeout = '900s';
-- DO $rollback_cohort$
-- DECLARE
--   target_table text;
--   backup_table text;
--   key_column text;
--   target_tables text[] := ARRAY[
--     'bidv_reconciliation_files','bidv_reconciliation_records',
--     'bidv_reconciliation_sessions','bidv_transactions','bidv_virtual_accounts',
--     'center_notification_settings','center_notification_templates',
--     'class_grade_book_scores','class_grade_book_student_comments','class_grade_books',
--     'class_session_exclusions','classes','commission_configs','crm_custom_fields',
--     'customer_activity_logs','database_backups','database_restores','exam_sessions',
--     'exams','finance_promotions','finance_vouchers','free_class_registrations',
--     'invoice_commissions','invoice_items','invoice_session_allocations','leave_requests',
--     'news_feed_posts','news_feed_reactions','notification_logs','notification_templates',
--     'public_holidays','salary_sheet_employees','salary_sheets','session_contents',
--     'shift_assignments','short_links','staff','staff_attendances',
--     'store_inventory_reservations','store_issue_receipt_audit_logs',
--     'store_issue_receipt_items','store_issue_receipts','store_receipt_audit_logs',
--     'store_receipt_items','store_receipts','store_transfer_audit_logs',
--     'store_transfer_items','store_transfers','student_classes','student_comments',
--     'student_leave_requests','student_notification_channels','student_session_contents',
--     'student_star_transactions','student_wallet_transactions','students',
--     'teacher_attendance','teacher_availability','teacher_salary_row_packages',
--     'teacher_salary_session_packages','teacher_salary_tables','test_sessions',
--     'tuition_package_change_operations','tuition_package_change_requests',
--     'tuition_package_session_adjustments','user_tenant_map','users'
--   ];
-- BEGIN
--   FOREACH target_table IN ARRAY target_tables LOOP
--     backup_table := target_table || '_created_at_before_utc';
--     key_column := CASE WHEN target_table = 'short_links' THEN 'code' ELSE 'id' END;
--     EXECUTE format('ALTER TABLE public.%I ALTER COLUMN created_at DROP DEFAULT', target_table);
--     EXECUTE format(
--       'ALTER TABLE public.%I ALTER COLUMN created_at TYPE timestamp without time zone USING created_at AT TIME ZONE %L',
--       target_table, 'Asia/Ho_Chi_Minh'
--     );
--     EXECUTE format(
--       'UPDATE public.%I AS target SET created_at = backup.created_at FROM time_migration.%I AS backup WHERE target.%I = backup.key_value',
--       target_table, backup_table, key_column
--     );
--     EXECUTE format('ALTER TABLE public.%I ALTER COLUMN created_at SET DEFAULT now()', target_table);
--   END LOOP;
-- END
-- $rollback_cohort$;
-- COMMIT;
-- Keep all backups until the full timestamp audit is complete.