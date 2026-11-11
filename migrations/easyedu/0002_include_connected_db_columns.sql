ALTER TABLE "center_config" ADD COLUMN "timezone" varchar DEFAULT 'Asia/Ho_Chi_Minh' NOT NULL;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD COLUMN "invoice_scopes" text[];