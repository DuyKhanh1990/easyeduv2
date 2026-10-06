---
name: Individual score publication
description: Storage and visibility rules for releasing a score-conversion result to one student.
---

**Rule:** Store individual release state in attempt-result metadata rather than adding a database column. A student may see a result when the session-wide release or the individual release is enabled, subject to enrollment and roster exclusion. Keep the configured attempt-selection policy intact.

**Why:** The workspace and production share PostgreSQL, so individual publication should not introduce a schema migration when existing attempt records can hold the release state.

**How to apply:** Synchronize the individual marker across a student's attempts for that assessment and session so `latest` or `highest` selection cannot hide a valid release. Keep student-facing queries limited to enrolled, non-excluded students.
