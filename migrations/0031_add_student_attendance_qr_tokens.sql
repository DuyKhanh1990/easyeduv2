CREATE TABLE IF NOT EXISTS "student_attendance_qr_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "student_id" uuid NOT NULL,
  "token_hash" varchar(64) NOT NULL,
  "token_encrypted" text NOT NULL,
  "created_by" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "revoked_at" timestamp,
  CONSTRAINT "student_attendance_qr_tokens_student_id_unique" UNIQUE("student_id"),
  CONSTRAINT "student_attendance_qr_tokens_token_hash_unique" UNIQUE("token_hash"),
  CONSTRAINT "student_attendance_qr_tokens_student_id_fk"
    FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE,
  CONSTRAINT "student_attendance_qr_tokens_created_by_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "student_attendance_qr_tokens_student_idx"
  ON "student_attendance_qr_tokens" USING btree ("student_id");

CREATE INDEX IF NOT EXISTS "student_attendance_qr_tokens_hash_idx"
  ON "student_attendance_qr_tokens" USING btree ("token_hash");