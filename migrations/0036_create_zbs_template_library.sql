CREATE TABLE "zbs_template_library" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "center_id" uuid NOT NULL REFERENCES "center_config"("id") ON DELETE CASCADE,
  "code" varchar(100) NOT NULL,
  "name" varchar(255) NOT NULL,
  "notification_type" varchar(100) NOT NULL,
  "title" varchar(255) NOT NULL DEFAULT '',
  "components" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "variables" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "version" integer NOT NULL DEFAULT 1,
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "compatibility_status" varchar(32) NOT NULL DEFAULT 'unverified',
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "zbs_template_library_center_code_uniq" UNIQUE ("center_id", "code")
);

CREATE INDEX "zbs_template_library_center_status_idx"
  ON "zbs_template_library" ("center_id", "status");
