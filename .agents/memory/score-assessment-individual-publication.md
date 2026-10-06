---
name: Individual score publication
description: Storage and visibility rules for releasing a score-conversion result to one student.
---

**Rule:** Store individual release state in attempt-result metadata rather than adding a database column. A student may see a result when the session-wide release or the individual release is enabled, subject to enrollment and roster exclusion. Keep the configured attempt-selection policy intact.

In score entry, automatically turn on individual publication only after all skill scores and score conversions are complete; staff can still turn it off before saving. Saving while publication is on requires explicit confirmation. If there is no non-empty note/text response and no checked evaluation checkbox, show an additional warning but allow staff to continue.

**Why:** The workspace and production share PostgreSQL, so individual publication should not introduce a schema migration when existing attempt records can hold the release state. The user also requested a confirmation before sending results and a warning when no feedback has been entered. PostgreSQL may not infer prepared parameter types inside variadic `any` functions such as `jsonb_build_object`.

**How to apply:** Synchronize the individual marker across a student's attempts so `latest` or `highest` selection cannot hide a release. Keep student-facing queries limited to enrolled, non-excluded students. Count any non-blank note or text response, or any checked checkbox, as feedback; blank/whitespace text and unchecked boxes do not count. Cast values passed to `jsonb_build_object` explicitly (for example `::boolean`) to prevent PostgreSQL's “could not determine data type of parameter” error.

For score-conversion sessions, when the non-excluded roster is non-empty and every student has an individual release, hide the session-wide publish control and show a green “Đã công bố” label on the session row. Keep the controls available if the session is already globally published so staff can still withdraw that release.

**Why:** The user chose hiding bulk publication after individual releases to prevent an accidental duplicate send.

**How to apply:** Derive the label from the current roster and saved attempt metadata; an empty roster must not count as fully published. Refresh the assessment summary when an individual release changes.

In the “Theo học viên” score-conversion view, show a green “Đã công bố” badge beside a student's name when that student has a publishable result released individually or through the whole session.

**Why:** The user expects publication status to remain visible when switching between assessment-group and student views.

**How to apply:** Use each student's own release state and require a publishable result; do not infer the row badge only from the session's aggregate publication summary.

Until the publication policy is reviewed, hide the session-wide publication switch and Save action at the top of the staff assessment roster dialog. Keep per-student publication controls and existing whole-session status indicators.

**Why:** The user asked to defer business-rule decisions about session-wide publication.

**How to apply:** Do not restore the dialog's bulk controls until the release policy has been clarified.
