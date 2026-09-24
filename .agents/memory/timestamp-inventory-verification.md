---
name: Timestamp inventory verification
description: How to avoid incorrect timestamp-column counts during the EasyEdu timezone migration.
---

## Rule

Use the live database's `information_schema` as the authority for columns currently storing data. When reconciling it with Drizzle declarations, parse the schema syntax and unwrap chained calls such as `timestamp(...).defaultNow().notNull()` before counting; a simple search for a bare `timestamp(...)` initializer silently misses many columns. Distinguish declared-but-not-yet-created tables from live columns.

Before building a batch backup, inspect each target's actual primary key in the live catalog; do not assume every table uses `id`. The backup and row-by-row round-trip check must join on that same key.

**Why:** Independent lexical audits produced incompatible column counts because chained timestamp builders were omitted. A cohort can also contain a different valid row key, so convention-based backup SQL can fail or miss identity checks.

**How to apply:** Inventory live table/column/type/default and primary-key columns first, reconcile each timestamp to its Drizzle declaration with an AST-aware scan, then audit writers separately. Never infer actual INSERT/UPDATE behavior or historical row provenance from schema defaults alone.