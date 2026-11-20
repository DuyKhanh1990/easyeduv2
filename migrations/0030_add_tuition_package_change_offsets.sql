CREATE TABLE IF NOT EXISTS "tuition_package_change_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "operation_key" varchar(80) NOT NULL,
  "request_hash" text NOT NULL,
  "created_by" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "tuition_package_change_requests_operation_key_unique" UNIQUE("operation_key"),
  CONSTRAINT "tuition_package_change_requests_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
);

CREATE TABLE IF NOT EXISTS "tuition_package_change_operations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "request_id" uuid NOT NULL,
  "student_class_id" uuid NOT NULL,
  "old_total" numeric(15,2) NOT NULL,
  "new_total" numeric(15,2) NOT NULL,
  "difference" numeric(15,2) NOT NULL,
  "adjustment_invoice_id" uuid,
  "created_by" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "tuition_package_change_operations_request_id_fk"
    FOREIGN KEY ("request_id") REFERENCES "public"."tuition_package_change_requests"("id") ON DELETE CASCADE,
  CONSTRAINT "tuition_package_change_operations_student_class_id_fk"
    FOREIGN KEY ("student_class_id") REFERENCES "public"."student_classes"("id") ON DELETE CASCADE,
  CONSTRAINT "tuition_package_change_operations_adjustment_invoice_id_fk"
    FOREIGN KEY ("adjustment_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE SET NULL,
  CONSTRAINT "tuition_package_change_operations_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tuition_package_change_operation_student_unique"
  ON "tuition_package_change_operations" USING btree ("request_id", "student_class_id");

CREATE TABLE IF NOT EXISTS "tuition_package_session_adjustments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "operation_id" uuid NOT NULL,
  "student_session_id" uuid NOT NULL,
  "effective_amount" numeric(15,2) NOT NULL,
  "applied_sequence" serial NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "tuition_package_session_adjustments_operation_id_fk"
    FOREIGN KEY ("operation_id") REFERENCES "public"."tuition_package_change_operations"("id") ON DELETE CASCADE,
  CONSTRAINT "tuition_package_session_adjustments_student_session_id_fk"
    FOREIGN KEY ("student_session_id") REFERENCES "public"."student_sessions"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "tuition_package_session_adjustment_unique"
  ON "tuition_package_session_adjustments" USING btree ("operation_id", "student_session_id");

CREATE INDEX IF NOT EXISTS "tuition_package_session_adjustment_session_idx"
  ON "tuition_package_session_adjustments" USING btree ("student_session_id", "applied_sequence");