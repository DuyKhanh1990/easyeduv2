---
name: Grade-book view/edit consistency
description: Non-obvious synchronization and filtering rules for grade-book dialogs.
---

The grade-book view and edit dialogs must use the same student set: active class enrollments filtered to students with at least one saved score or comment, unless the grade book has no student data yet. Excluded student IDs are applied after that filter.

**Why:** The view dialog previously loaded grade details before active enrollments were available and rendered every active student. That caused intermittent blank scores due to incorrect enrollment mapping and showed students absent from the edit dialog.

**How to apply:** When loading grade-book details, wait for active-students data, map actual student IDs to enrollment IDs only after it arrives, and guard against stale requests when the dialog/book changes.