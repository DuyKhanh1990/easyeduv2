ALTER TABLE "zbs_template_mappings"
  ADD COLUMN IF NOT EXISTS "compatibility_status" varchar(32) NOT NULL DEFAULT 'compatibility_unverified';
