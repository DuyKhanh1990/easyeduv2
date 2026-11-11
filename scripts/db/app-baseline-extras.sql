-- Application-only objects not represented by the Drizzle table declarations.
-- Keep these definitions versioned with the image-generated baseline.

CREATE SEQUENCE IF NOT EXISTS bidv_invoice_va_seq START 1;
CREATE SEQUENCE IF NOT EXISTS invoice_pt_seq START 1;
CREATE SEQUENCE IF NOT EXISTS invoice_pc_seq START 1;

ALTER TABLE bidv_virtual_accounts
  ALTER COLUMN student_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bidv_va_invoice_id
  ON bidv_virtual_accounts(invoice_id)
  WHERE invoice_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bidv_va_schedule_id
  ON bidv_virtual_accounts(schedule_id)
  WHERE schedule_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS crm_relationships_one_system_default_idx
  ON crm_relationships(is_system_default)
  WHERE is_system_default = TRUE;

CREATE INDEX IF NOT EXISTS idx_exam_submissions_exam_id ON exam_submissions(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_submissions_student_id ON exam_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_exam_submissions_submitted_at ON exam_submissions(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_exam_submissions_exam_student ON exam_submissions(exam_id, student_id);
CREATE INDEX IF NOT EXISTS idx_exam_submissions_exam_class ON exam_submissions(exam_id, class_id);
CREATE INDEX IF NOT EXISTS idx_esq_section_id ON exam_section_questions(section_id);
CREATE INDEX IF NOT EXISTS idx_esq_section_order ON exam_section_questions(section_id, order_index);
CREATE INDEX IF NOT EXISTS idx_exam_sections_exam_id ON exam_sections(exam_id);

CREATE INDEX IF NOT EXISTS invoice_audit_logs_invoice_id_idx ON invoice_audit_logs(invoice_id);
CREATE INDEX IF NOT EXISTS invoice_audit_logs_created_at_idx ON invoice_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS invoice_audit_logs_location_id_idx ON invoice_audit_logs(location_id);
CREATE INDEX IF NOT EXISTS store_receipt_audit_logs_receipt_id_idx ON store_receipt_audit_logs(receipt_id);
CREATE INDEX IF NOT EXISTS store_receipt_audit_logs_created_at_idx ON store_receipt_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS store_receipt_audit_logs_location_id_idx ON store_receipt_audit_logs(location_id);
CREATE INDEX IF NOT EXISTS store_issue_receipt_audit_logs_receipt_id_idx ON store_issue_receipt_audit_logs(receipt_id);
CREATE INDEX IF NOT EXISTS store_issue_receipt_audit_logs_created_at_idx ON store_issue_receipt_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS store_issue_receipt_audit_logs_location_id_idx ON store_issue_receipt_audit_logs(location_id);
