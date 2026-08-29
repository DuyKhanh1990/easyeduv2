ALTER TABLE "commission_configs"
  ADD COLUMN IF NOT EXISTS "invoice_types" text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS "invoice_statuses" text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS "description" text;