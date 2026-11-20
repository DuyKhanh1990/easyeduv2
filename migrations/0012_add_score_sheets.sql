-- Migration: Add score categories and score sheets tables

CREATE TABLE IF NOT EXISTS "score_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(255) NOT NULL,
  "code" varchar(255) NOT NULL UNIQUE,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "score_sheets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(255) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "score_sheet_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "score_sheet_id" uuid NOT NULL REFERENCES "score_sheets"("id") ON DELETE CASCADE,
  "category_id" uuid NOT NULL REFERENCES "score_categories"("id") ON DELETE CASCADE,
  "formula" varchar(500) NOT NULL DEFAULT '',
  "order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL
);
