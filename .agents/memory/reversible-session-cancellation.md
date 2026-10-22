---
name: Reversible session cancellation
description: Preserve student-session relationships when canceling a class session so the same lesson can be restored.
---

Cancel a regular class session by changing `class_sessions.status` to `cancelled`; do not delete its `student_sessions` rows. Restore that same session ID by setting its status back to `scheduled`, clearing current cancellation metadata, and recalculating student/class totals. Any counts, tuition allocations, attendance, makeup, or transfer selection must exclude rows whose parent class session is cancelled.

**Why:** The user wants a mistakenly canceled lesson to return as the same lesson with its original student links and details, not as a newly generated session.

**How to apply:** Preserve row IDs, package/fee fields, enrollment links, teacher assignments, and session content. For legacy canceled sessions, restore existing rows when present; do not invent missing historical student links from the current roster without review.
