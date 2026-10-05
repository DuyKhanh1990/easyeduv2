ALTER TABLE "zalo_oa_configs"
  ADD COLUMN IF NOT EXISTS "refresh_state" varchar(16) NOT NULL DEFAULT 'ready';
