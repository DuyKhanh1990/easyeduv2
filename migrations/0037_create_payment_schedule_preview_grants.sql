CREATE TABLE "payment_schedule_preview_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "center_id" uuid NOT NULL REFERENCES "center_config"("id") ON DELETE CASCADE,
  "payment_schedule_id" uuid NOT NULL REFERENCES "invoice_payment_schedule"("id") ON DELETE CASCADE,
  "token_hash" varchar(64) NOT NULL UNIQUE,
  "expires_at" timestamp NOT NULL,
  "revoked_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "payment_schedule_preview_grants_schedule_idx"
  ON "payment_schedule_preview_grants" ("center_id", "payment_schedule_id");

CREATE INDEX "payment_schedule_preview_grants_expiry_idx"
  ON "payment_schedule_preview_grants" ("expires_at");
