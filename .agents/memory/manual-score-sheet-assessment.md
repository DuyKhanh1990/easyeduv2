---
name: Manual score-sheet assessments
description: Keep manually assembled student rosters on the existing score-conversion assessment lifecycle.
---

**Rule:** Manual creation changes how the roster is selected, not the assessment model. Use the standard assessment and attempt records, APIs, score-entry dialogs, and publication flow; do not create a parallel score-sheet model or synthetic class sessions. The manually selected roster is fixed when the assessment is created.

**Why:** The user explicitly clarified that a manual assessment must otherwise behave like a regular score-conversion assessment and appear in the shared `/score-conversion` experience.

**How to apply:** When changing manual assessments, verify creation, listing, score entry, editing, and publication still use the shared flow. Keep class-session assignment restricted to session-created assessments.
