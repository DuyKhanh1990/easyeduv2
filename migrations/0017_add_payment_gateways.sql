CREATE TABLE IF NOT EXISTS "payment_gateways" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "provider" varchar(50) NOT NULL,
  "display_name" varchar(100) NOT NULL,
  "is_active" boolean NOT NULL DEFAULT false,
  "credentials" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
