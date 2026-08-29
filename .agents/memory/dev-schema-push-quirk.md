---
name: Development schema push quirk
description: Drizzle schema changes may require an explicit development-side database operation when push cannot complete its interactive rename prompt.
---

When `drizzle-kit push` cannot complete its interactive table-choice prompt in the workspace shell, apply only the exact new development table/column DDL through the database tooling, then verify the schema and keep production changes for the Publish flow.

**Why:** The shell invocation may not provide a usable interactive confirmation when unrelated existing constraints are detected, even though the requested schema change is straightforward; the application still needs the development schema before runtime verification.

**How to apply:** Use this only for an exact, non-destructive development table/column after checking the schema source; never use it to bypass production schema migration or resolve ambiguous renames.