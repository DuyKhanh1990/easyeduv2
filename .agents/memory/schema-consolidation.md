---
name: Schema consolidation
description: Rule and outcomes of moving all inline DDL into shared/schema.ts
---

## Rule
**shared/schema.ts** is the single source of truth for all table/column definitions.
Never add `CREATE TABLE` or `ALTER TABLE ... ADD COLUMN` in:
- server/index.ts
- server/routes/**
- server/storage/**

**Why:** The versioned EasyEdu migration baseline is generated from `shared/schema.ts`.
Inline DDL can drift from the committed migration history.

**How to apply:** Add schema changes to `shared/schema.ts`, then run
`npm run db:migration:generate -- --name <descriptive_name>`. Commit the generated SQL,
journal, snapshots, and schema/code changes together. Use Drizzle custom migrations for
DDL that the schema cannot express. Never use `drizzle-kit push` on production.

## EasyEdu migration lineage
The current standard Drizzle lineage is `migrations/easyedu/`, generated with
`drizzle.easyedu.config.ts` and scoped to the application database schema. The older SQL
files at the root of `migrations/` are legacy history and are not part of this lineage.

**Why:** The legacy journal/snapshots cover only part of the current schema and cannot
safely serve as the starting snapshot for incremental generation.

**How to apply:** Generate future schema migrations with the EasyEdu config. Put manual
database objects in a Drizzle `--custom` migration. Gateway has a separate Drizzle config
and database scope; do not merge its schema into the EasyEdu app lineage.

## Deployment gate
**Rule:** Production schema changes are applied by the versioned EasyEdu migration runner packaged in the same image tag as the app. Never use `drizzle-kit push` as the production runner.

**Why:** A tag must carry the exact SQL it can apply, and a failed migration must stop the app rollout instead of leaving an untracked partial schema.

**How to apply:** Generate and review SQL from the EasyEdu-only Drizzle config, keep unsupported DDL in versioned custom SQL, and package the journal/snapshots with the runner. Empty databases run the baseline. A legacy database without a ledger may adopt only after catalog checks; safe missing columns can be added transactionally, while missing tables or incompatible types/indexes/constraints stop for a reviewed migration. Use a per-database ledger and advisory lock; a newer ledger than the selected image is a downgrade error.

## What IS allowed outside schema.ts
- Seed data (INSERT / ON CONFLICT DO NOTHING)
- One-time data backfills (UPDATE ... SET)
- Constraint changes (ALTER COLUMN ... DROP NOT NULL) — Drizzle can't express dropping constraints
- Raw sequences (CREATE SEQUENCE) — not in Drizzle
- Partial unique indexes (CREATE UNIQUE INDEX ... WHERE ...) — Drizzle only does non-partial uniques
- Service initialization (Tinode, WebSocket, cache)

## Consolidation done
After consolidation, the only inline DDL remaining in server/index.ts is:
1. bidv_virtual_accounts: DROP NOT NULL on student_id + partial unique index idx_bidv_va_invoice_id + sequence bidv_invoice_va_seq
2. Tinode de-dup + unique index logic (complex: clears duplicates before creating unique index)
3. so_cong/cong_thuc type migration: INTEGER → NUMERIC on salary_sheet_employees

## Dual definition eliminated
shared/models/chat.ts now re-exports from shared/schema.ts (was a separate pgTable definition for conversations/messages).

## Gateway exception to watch
`gateway/src/bidv-schema.ts` and `gateway/src/bidv-db.ts` still contain a separate legacy `gateway_registry` definition/DDL that conflicts with the canonical definition in `shared/schema.ts`.

**Why:** A schema-name comparison can pass while the same table still has incompatible id, center_id, length, and nullability definitions across the app and gateway database paths.

**How to apply:** Before changing `gateway_registry`, choose one canonical shape and plan a data-safe migration for existing rows; do not silently overwrite the current table's integer key or rely on `CREATE TABLE IF NOT EXISTS` to reconcile it.
