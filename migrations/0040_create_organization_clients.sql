CREATE TABLE IF NOT EXISTS "organization_clients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "classification" varchar(20) NOT NULL,
  "code" varchar(100) NOT NULL,
  "name" varchar(255) NOT NULL,
  "domain" varchar(255),
  "account_status" varchar(20) DEFAULT 'active' NOT NULL,
  "contact_name" varchar(255),
  "phone" varchar(50),
  "email" varchar(255),
  "start_date" date NOT NULL,
  "duration_months" integer NOT NULL,
  "end_date" date NOT NULL,
  "service_package" text,
  "internal_note" text,
  "renewal_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "deleted_at" timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS "organization_clients_code_unique"
  ON "organization_clients" ("code");
CREATE INDEX IF NOT EXISTS "organization_clients_status_idx"
  ON "organization_clients" ("account_status");
CREATE INDEX IF NOT EXISTS "organization_clients_end_date_idx"
  ON "organization_clients" ("end_date");
CREATE INDEX IF NOT EXISTS "organization_clients_created_by_idx"
  ON "organization_clients" ("created_by");

CREATE TABLE IF NOT EXISTS "organization_client_locations" (
  "organization_client_id" uuid NOT NULL REFERENCES "organization_clients"("id") ON DELETE CASCADE,
  "location_id" uuid NOT NULL REFERENCES "locations"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("organization_client_id", "location_id")
);

CREATE INDEX IF NOT EXISTS "organization_client_locations_location_idx"
  ON "organization_client_locations" ("location_id");
