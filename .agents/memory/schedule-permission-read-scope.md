---
name: Schedule permission read scope
description: Keep schedule-only session viewing separate from general class access and shared test-session APIs.
---

Schedule-only viewers should get read access to only the class and session data required by schedule dialogs. Keep ordinary class-read behavior unchanged, opt in on schedule detail reads, and scope by assigned class/session or assigned location.

For `/schedule` writes, `canCreate` grants only the designated add workflows (adding students, reviews, content, programs, criteria, score sheets, and online links). `canEdit` grants all non-delete schedule work, including additions. `canDelete` grants every schedule workflow, including additions and edits. Enforce the matching action in both UI controls and related APIs. Keep the approved TEST write exception unchanged: TEST schedule writes remain blocked in the Schedule UI, and shared TEST APIs must not be changed for this permission work.

For permission-only work, preserve existing business logic and stored values. Avoid normalizing data or adding request validation; scope lookups are acceptable only to enforce authorization, while authorized requests must continue through the existing business path.

**Why:** the user explicitly required that schedule permission changes not alter the system's existing business behavior. Broadly merging `/schedule` into `/classes` can also expose unrelated class data, while shared test-session APIs serve other screens.

**How to apply:** when a schedule dialog needs another data endpoint, review its row and location scope before allowing schedule readers. Keep read access separate from write capabilities, preserve class/location scope on writes, and gate the existing mutation path without changing its data transformation or handling of valid requests. Do not alter shared test-session writes without checking the other screens that use them.