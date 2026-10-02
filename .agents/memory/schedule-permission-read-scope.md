---
name: Schedule permission read scope
description: Keep schedule-only session viewing separate from general class access and shared test-session APIs.
---

Schedule-only viewers should get read access to only the class and session data required by schedule dialogs. Keep ordinary class-read behavior unchanged, opt in on schedule detail reads, and scope by assigned class/session or assigned location. Write access stays separate from read access.

**Why:** broadly merging `/schedule` into `/classes` can expose unrelated class data, while shared test-session APIs also serve the class test tab and staff calendar.

**How to apply:** when a schedule dialog needs another data endpoint, review its row and location scope before allowing schedule readers. Do not alter shared test-session writes without checking the other screens that use them; UI-only edit blocking is acceptable when server permission changes would disrupt those flows.