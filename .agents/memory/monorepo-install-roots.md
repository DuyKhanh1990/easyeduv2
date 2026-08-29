---
name: Multiple npm install roots in this project
description: This repo has 3 separate package.json roots that each need their own npm install; missing one breaks the matching workflow with "command not found".
---

The project has independent `node_modules` roots:
- `/` (main app — `Start application` workflow, needs `tsx`, `vite`, etc.)
- `/gateway` (Zalo Gateway workflow — separate `package.json`)
- `/artifacts/mockup-sandbox` (Component Preview Server workflow — separate `package.json`)

**Why:** After a fresh import/clone, only running `npm install` at the repo root leaves `gateway/` and `artifacts/mockup-sandbox/` without their own `node_modules`, so their workflows fail with `sh: line 1: <bin>: No such file or directory` (or the Zalo Gateway workflow silently prompts `Ok to proceed? (y)` for `npx tsx` and hangs) even though the root install succeeded.

**How to apply:** When setting up this project, imports fail, or "app chưa vào được giao diện" / workflows won't start, run `npm install` in all three roots, not just the repo root, before restarting workflows.
