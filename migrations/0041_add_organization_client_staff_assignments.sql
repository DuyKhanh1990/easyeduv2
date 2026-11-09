ALTER TABLE "organization_clients"
  ADD COLUMN IF NOT EXISTS "sales_staff_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "manager_staff_ids" jsonb NOT NULL DEFAULT '[]'::jsonb;
