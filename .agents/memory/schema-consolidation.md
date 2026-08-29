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

**Why:** `scripts/push-db-direct.ts` reads only `shared/schema.ts` to create a new DB.
Inline DDL causes new environments to be missing tables/columns.

**How to apply:** Any new table or column → add to `shared/schema.ts`, then run `npx tsx scripts/push-db-direct.ts` against the target DB.

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
