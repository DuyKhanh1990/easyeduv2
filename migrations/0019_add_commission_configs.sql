CREATE TABLE IF NOT EXISTS "commission_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(255) NOT NULL,
  "location_ids" uuid[] NOT NULL DEFAULT '{}'::uuid[],
  "effective_from" date NOT NULL,
  "effective_to" date,
  "role_configs" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "commission_configs_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "users"("id"),
  CONSTRAINT "commission_configs_updated_by_users_id_fk"
    FOREIGN KEY ("updated_by") REFERENCES "users"("id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commission_configs_effective_from_idx"
  ON "commission_configs" USING btree ("effective_from");