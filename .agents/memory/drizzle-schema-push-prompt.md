---
name: Drizzle schema push prompt
description: Development schema pushes can be blocked by unrelated data-loss prompts when the database has pre-existing drift.
---

## Rule
When `drizzle-kit push` detects an unrelated destructive change and requires an interactive confirmation, do not approve truncation just to apply an additive schema change. Keep the Drizzle schema as the source of truth and apply only the verified additive development DDL through the database migration workflow.

**Why:** The project database may contain existing rows that are unrelated to the requested change; accepting the prompt can destroy them.

**How to apply:** First inspect the proposed drift and confirm the target columns are absent. If the CLI cannot run non-interactively, use the supported development database path for the additive change and verify the resulting columns before restarting the app.