---
name: Manual score-sheet assessments
description: Keep manually assembled student rosters on the existing score-conversion assessment lifecycle.
---

**Rule:** Manual creation changes how the roster is selected, not the assessment model. Use the standard assessment and attempt records, APIs, score-entry dialogs, and publication flow; do not create a parallel score-sheet model or synthetic class sessions. Attempts for manual assessments must keep `class_session_id` as `NULL`; the manually selected roster is fixed when the assessment is created.

**Why:** The user explicitly clarified that manual assessments have no class/session and their attempts must therefore allow `class_session_id = NULL`, while otherwise behaving like regular score-conversion assessments in the shared `/score-conversion` experience.

**How to apply:** Keep `class_session_id` nullable in every database target. When changing manual assessments, verify creation, listing, score entry, editing, and publication still use the shared flow; assign class sessions only to session-created assessments.
