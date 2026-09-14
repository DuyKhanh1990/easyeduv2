---
name: Class session ordering
description: Canonical ordering and identity rules for class sessions when dates can be edited.
---

`class_sessions.id` identifies the record. `sessionIndex` is the current chronological lesson number and must be resequenced by `sessionDate`, shift start time, previous index, then ID whenever a session is saved.

**Why:** Users expect a moved 9/9 lesson to appear before 10/9 and become the corresponding earlier lesson number. Keeping the old index made the schedule visibly and operationally out of order.

**How to apply:** Resequence class and student session orders in one transaction while preserving IDs, attendance, content, and remapping cycle-history boundaries. Return/render by `sessionIndex`; use IDs for selection.