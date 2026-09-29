---
name: Drizzle schema push prompt
description: Development schema pushes can be blocked by unrelated data-loss prompts when the database has pre-existing drift.
---

## Rule
When `drizzle-kit push` detects an unrelated destructive change and requires an interactive confirmation, do not approve truncation just to apply an additive schema change. Keep the Drizzle schema as the source of truth and apply only the verified additive development DDL through the database migration workflow.

**Why:** The project database may contain existing rows that are unrelated to the requested change; accepting the prompt can destroy them. The CLI can also stall at “Pulling schema from database” while the managed development database remains reachable through the database SQL tool.

**How to apply:** First inspect the proposed drift and confirm the target columns/table are absent. If the CLI stalls or cannot run non-interactively, confirm the development target, apply only the additive DDL generated from `shared/schema.ts` through `executeSql` in the development environment, then verify columns, constraints, and indexes before restarting the app. Never force unrelated destructive changes.