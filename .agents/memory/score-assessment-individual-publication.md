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

The conversion-board status is “Hoàn thành” only when every student has a complete score and publication is complete either session-wide or for every student individually. If scoring has started and any student is missing a complete score or publication, keep the status as “Đang xử lý”.

**Why:** A board whose complete roster has already received results should not remain “Đang xử lý”; the status should identify only unfinished scoring or publication.

**How to apply:** Pass the aggregate all-students-individually-published state into the shared status resolver alongside the session-wide publication flag and completed-score count.

Keep “Đang xử lý” distinct from “Đang thi” and “Hoàn thành”. The “Đang thi” date rule starts on the exam date and continues afterward; do not change the existing completion rule or collapse processing into another status. On the conversion assessment list, show “Đang xử lý” below the student counts instead of as a top-level status tab.

**Why:** The user clarified that only the start rule for “Đang thi” changes; completion retains its existing score/publication logic, while processing remains a separate state.

**How to apply:** Preserve the resolver’s completed/processing precedence for workflow progress. On `/score-conversion`, derive the displayed lifecycle status and the three lifecycle quick filters independently of processing; show “Đang xử lý” separately below student counts and retain it as an independent detailed filter.

In the “Theo học viên” score-conversion view, show a green “Đã công bố” badge beside a student's name when that student has a publishable result released individually or through the whole session.

**Why:** The user expects publication status to remain visible when switching between assessment-group and student views.

**How to apply:** Use each student's own release state and require a publishable result; do not infer the row badge only from the session's aggregate publication summary.

Until the publication policy is reviewed, hide the session-wide publication switch and Save action at the top of the staff assessment roster dialog. Keep per-student publication controls and existing whole-session status indicators.

**Why:** The user asked to defer business-rule decisions about session-wide publication.

**How to apply:** Do not restore the dialog's bulk controls until the release policy has been clarified.

On `/score-conversion`, keep viewing available for assessments marked “Chưa thi”, but disable per-student skill-score entry in both assessment-roster and student views.

**Why:** The user requested that unopened assessments remain viewable without allowing skill scores to be entered before the exam.

**How to apply:** Derive the lock from the parent assessment lifecycle status. Do not disable viewing or unrelated roster/publication actions.

On `/score-conversion`, a student can be removed from the assessment roster only after both session-wide and individual publication are withdrawn. Removal hides the score from the learner but preserves entered attempts; withdrawing publication alone keeps the student in staff tracking.

**Why:** The user confirmed that removing a student should hide the learner-facing score sheet, while withdrawing publication should hide it only from the learner and leave the staff roster intact.

**How to apply:** Enforce the publication checks server-side as well as disabling the delete controls. Treat either session-wide publication or the student's individual publication as a deletion lock.
