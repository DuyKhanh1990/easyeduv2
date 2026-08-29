CREATE TABLE IF NOT EXISTS "invoice_commissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "invoice_id" uuid NOT NULL REFERENCES "invoices"("id") ON DELETE CASCADE,
  "staff_id" uuid NOT NULL REFERENCES "staff"("id") ON DELETE CASCADE,
  "percentage" numeric(5, 2) NOT NULL DEFAULT '0',
  "created_at" timestamp DEFAULT now() NOT NULL
);
