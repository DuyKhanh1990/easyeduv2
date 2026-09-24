---
name: Timestamp inventory verification
description: How to avoid incorrect timestamp-column counts during the EasyEdu timezone migration.
---

## Rule

Use the live database's `information_schema` as the authority for columns currently storing data. When reconciling it with Drizzle declarations, parse the schema syntax and unwrap chained calls such as `timestamp(...).defaultNow().notNull()` before counting; a simple search for a bare `timestamp(...)` initializer silently misses many columns. Distinguish declared-but-not-yet-created tables from live columns.

**Why:** Independent lexical audits produced incompatible column counts because chained timestamp builders were omitted. An AST reconciliation showed the live columns were declared, with an additional not-yet-created declaration; incorrect counts would invalidate a migration grouping before any writer analysis began.

**How to apply:** Inventory live table/column/type/default first, reconcile each ID to its Drizzle declaration with an AST-aware scan, then audit writers separately. Never infer actual INSERT/UPDATE behavior or historical row provenance from schema defaults alone.