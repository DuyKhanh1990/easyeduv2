---
name: Manual score-sheet assessments
description: Keep manually assembled student rosters on the existing score-conversion assessment lifecycle.
---

**Rule:** Manual creation changes how the roster is selected, not the assessment model. Use the standard assessment and attempt records, APIs, score-entry dialogs, and publication flow; do not create a parallel score-sheet model or synthetic class sessions. Attempts for manual assessments must keep `class_session_id` as `NULL`. The initial roster comes from creation, but permitted users can remove and restore students with the same Delete/Edit scopes as session assessments.

**Why:** Manual assessments have no class/session, but the user requires their roster actions to follow the same permissions as session assessments.

**How to apply:** Keep `class_session_id` nullable in every database target. Persist manual roster removals/restorations in assessment configuration without deleting attempt history. Verify creation, listing, score entry, editing, roster actions, and publication in the shared flow; assign class sessions only to session-created assessments.

**Rule:** A score-sheet template is reusable configuration: assigning the same template to different class sessions or manual boards should retain the same template code. Each board still needs its own internal assessment ID and its own student/attempt data.

**Why:** The user clarified that choosing a score sheet selects reusable information to assign, as it does for different class sessions; generated manual-instance codes obscured that identity.

**How to apply:** Distinguish the shared template code from each assessment's internal identity. Group filters by template ID, but keep each board's roster, attempts, and publication state scoped to its own assessment; do not merge results just because the template is shared.

**Rule:** In the score-conversion list, ordinary View is limited to boards assigned to the user as a teacher; for manual boards, the creator or an assigned teacher may view. View All includes every board and its students. Identify creators by user ID, not display name.

**Why:** The user confirmed this visibility rule so manually created boards linked to a teaching session remain accessible to the creator or assigned teacher without exposing unrelated boards.

**How to apply:** Apply the same visibility scope to list, student, and score-entry APIs. Keep create/edit/delete rights separate from visibility; preserve the existing deletion business rules.

**Rule:** Removing a student from a score-assessment roster is a Delete action, not an Edit or Add action; hide its trash icon and reject its API request without Delete permission.

**Why:** The user clarified that Add permission must not expose delete controls inside the student dialog.

**How to apply:** Gate roster-removal controls and server mutations with the dedicated Delete permission; keep roster restoration separate.
