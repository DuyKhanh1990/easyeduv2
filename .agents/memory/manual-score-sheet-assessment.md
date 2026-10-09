---
name: Manual score-sheet assessments
description: Keep manually assembled student rosters on the existing score-conversion assessment lifecycle.
---

**Rule:** Manual creation changes how the roster is selected, not the assessment model. Use the standard assessment and attempt records, APIs, score-entry dialogs, and publication flow; do not create a parallel score-sheet model or synthetic class sessions. Attempts for manual assessments must keep `class_session_id` as `NULL`; the manually selected roster is fixed when the assessment is created.

**Why:** The user explicitly clarified that manual assessments have no class/session and their attempts must therefore allow `class_session_id = NULL`, while otherwise behaving like regular score-conversion assessments in the shared `/score-conversion` experience.

**How to apply:** Keep `class_session_id` nullable in every database target. When changing manual assessments, verify creation, listing, score entry, editing, and publication still use the shared flow; assign class sessions only to session-created assessments.

**Rule:** A score-sheet template is reusable configuration: assigning the same template to different class sessions or manual boards should retain the same template code. Each board still needs its own internal assessment ID and its own student/attempt data.

**Why:** The user clarified that choosing a score sheet selects reusable information to assign, as it does for different class sessions; generated manual-instance codes obscured that identity.

**How to apply:** Distinguish the shared template code from each assessment's internal identity. Group filters by template ID, but keep each board's roster, attempts, and publication state scoped to its own assessment; do not merge results just because the template is shared.
