CREATE TABLE "zbs_template_mappings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "zalo_oa_config_id" uuid NOT NULL REFERENCES "zalo_oa_configs"("id") ON DELETE CASCADE,
  "notification_type" varchar(100) NOT NULL,
  "template_id" varchar(100),
  "template_name" varchar(255),
  "template_status" varchar(32),
  "is_enabled" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "zbs_template_mappings_oa_type_uniq"
    UNIQUE ("zalo_oa_config_id", "notification_type")
);
