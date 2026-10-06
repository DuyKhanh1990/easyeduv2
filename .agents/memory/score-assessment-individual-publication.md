---
name: Individual score publication
description: Storage and visibility rules for releasing a score-conversion result to one student.
---

**Rule:** Store individual release state in attempt-result metadata rather than adding a database column. A student may see a result when the session-wide release or the individual release is enabled, subject to enrollment and roster exclusion. Keep the configured attempt-selection policy intact.

In score entry, automatically turn on individual publication only after all skill scores and score conversions are complete; staff can still turn it off before saving. Saving while publication is on requires explicit confirmation. If there is no non-empty note/text response and no checked evaluation checkbox, show an additional warning but allow staff to continue.

**Why:** The workspace and production share PostgreSQL, so individual publication should not introduce a schema migration when existing attempt records can hold the release state. The user also requested a confirmation before sending results and a warning when no feedback has been entered.

**How to apply:** Synchronize the individual marker across a student's attempts so `latest` or `highest` selection cannot hide a release. Keep student-facing queries limited to enrolled, non-excluded students. Count any non-blank note or text response, or any checked checkbox, as feedback; blank/whitespace text and unchecked boxes do not count.
