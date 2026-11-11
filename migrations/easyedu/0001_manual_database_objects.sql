-- Objects used by EasyEdu that are intentionally not represented by
-- shared/schema.ts. This file is part of the Drizzle migration journal.

-- The application allows invoice-only virtual accounts without a student.
ALTER TABLE "bidv_virtual_accounts"
  ALTER COLUMN "student_id" DROP NOT NULL;--> statement-breakpoint

-- Partial indexes and legacy sequences are maintained outside Drizzle schema.
CREATE UNIQUE INDEX "idx_bidv_va_invoice_id"
  ON "bidv_virtual_accounts" ("invoice_id")
  WHERE "invoice_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_bidv_va_schedule_id"
  ON "bidv_virtual_accounts" ("schedule_id")
  WHERE "schedule_id" IS NOT NULL;--> statement-breakpoint
CREATE SEQUENCE "bidv_invoice_va_seq" START 1;--> statement-breakpoint
CREATE SEQUENCE "invoice_pt_seq" START 1;--> statement-breakpoint
CREATE SEQUENCE "invoice_pc_seq" START 1;--> statement-breakpoint

-- Preserve the nullable Tinode identifiers while enforcing uniqueness.
-- This fails rather than deleting or rewriting duplicate values.
CREATE UNIQUE INDEX "users_tinode_user_id_uidx"
  ON "users" ("tinode_user_id")
  WHERE "tinode_user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "classes_tinode_topic_id_uidx"
  ON "classes" ("tinode_topic_id")
  WHERE "tinode_topic_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_groups_tinode_topic_id_uidx"
  ON "chat_groups" ("tinode_topic_id")
  WHERE "tinode_topic_id" IS NOT NULL;--> statement-breakpoint

-- Indexes created by startup code but not declared in shared/schema.ts.
CREATE INDEX "tasks_subject_ids_gin_idx" ON "tasks" USING GIN ("subject_ids");--> statement-breakpoint
CREATE INDEX "student_sessions_student_class_id_idx"
  ON "student_sessions" ("student_class_id");--> statement-breakpoint
CREATE INDEX "student_sessions_student_class_session_idx"
  ON "student_sessions" ("student_class_id", "class_session_id");--> statement-breakpoint
CREATE INDEX "invoice_audit_logs_invoice_id_idx" ON "invoice_audit_logs" ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_audit_logs_created_at_idx" ON "invoice_audit_logs" ("created_at" DESC);--> statement-breakpoint
CREATE INDEX "invoice_audit_logs_location_id_idx" ON "invoice_audit_logs" ("location_id");--> statement-breakpoint
CREATE INDEX "store_receipt_audit_logs_receipt_id_idx"
  ON "store_receipt_audit_logs" ("receipt_id");--> statement-breakpoint
CREATE INDEX "store_receipt_audit_logs_created_at_idx"
  ON "store_receipt_audit_logs" ("created_at" DESC);--> statement-breakpoint
CREATE INDEX "store_receipt_audit_logs_location_id_idx"
  ON "store_receipt_audit_logs" ("location_id");--> statement-breakpoint
CREATE INDEX "store_issue_receipt_audit_logs_receipt_id_idx"
  ON "store_issue_receipt_audit_logs" ("receipt_id");--> statement-breakpoint
CREATE INDEX "store_issue_receipt_audit_logs_created_at_idx"
  ON "store_issue_receipt_audit_logs" ("created_at" DESC);--> statement-breakpoint
CREATE INDEX "store_issue_receipt_audit_logs_location_id_idx"
  ON "store_issue_receipt_audit_logs" ("location_id");--> statement-breakpoint
CREATE INDEX "idx_reservations_expires" ON "store_inventory_reservations" ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_sst_product_warehouse"
  ON "store_stock_transactions" ("product_id", "warehouse_id");--> statement-breakpoint
CREATE INDEX "idx_sst_receipt_id" ON "store_stock_transactions" ("receipt_id");--> statement-breakpoint
CREATE INDEX "idx_transfer_audit_logs_transfer_id"
  ON "store_transfer_audit_logs" ("transfer_id");--> statement-breakpoint
CREATE INDEX "idx_transfer_audit_logs_created_at"
  ON "store_transfer_audit_logs" ("created_at" DESC);--> statement-breakpoint
CREATE INDEX "idx_store_transfers_status" ON "store_transfers" ("status");--> statement-breakpoint
CREATE INDEX "idx_store_transfer_items_transfer" ON "store_transfer_items" ("transfer_id");--> statement-breakpoint
CREATE INDEX "idx_exam_submissions_exam_id" ON "exam_submissions" ("exam_id");--> statement-breakpoint
CREATE INDEX "idx_exam_submissions_student_id" ON "exam_submissions" ("student_id");--> statement-breakpoint
CREATE INDEX "idx_exam_submissions_submitted_at" ON "exam_submissions" ("submitted_at" DESC);--> statement-breakpoint
CREATE INDEX "idx_exam_submissions_exam_student"
  ON "exam_submissions" ("exam_id", "student_id");--> statement-breakpoint
CREATE INDEX "idx_exam_submissions_exam_class"
  ON "exam_submissions" ("exam_id", "class_id");--> statement-breakpoint
CREATE INDEX "idx_esq_section_id" ON "exam_section_questions" ("section_id");--> statement-breakpoint
CREATE INDEX "idx_esq_section_order"
  ON "exam_section_questions" ("section_id", "order_index");--> statement-breakpoint
CREATE INDEX "idx_exam_sections_exam_id" ON "exam_sections" ("exam_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_relationships_one_system_default_idx"
  ON "crm_relationships" ("is_system_default")
  WHERE "is_system_default" = TRUE;--> statement-breakpoint

-- student_status is maintained by a trigger in the current application.
CREATE OR REPLACE FUNCTION update_student_status()
RETURNS TRIGGER AS $$
BEGIN
  NEW.student_status := CASE
    WHEN NEW.start_date > CURRENT_DATE THEN 'Chờ lịch'
    WHEN NEW.start_date <= CURRENT_DATE AND CURRENT_DATE <= NEW.end_date THEN 'Đang học'
    WHEN NEW.end_date < CURRENT_DATE THEN 'Kết thúc'
    ELSE 'Không xác định'
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DROP TRIGGER IF EXISTS student_status_trigger ON "student_classes";--> statement-breakpoint
CREATE TRIGGER student_status_trigger
BEFORE INSERT OR UPDATE ON "student_classes"
FOR EACH ROW
EXECUTE FUNCTION update_student_status();--> statement-breakpoint