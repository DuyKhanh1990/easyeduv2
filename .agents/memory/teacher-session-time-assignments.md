---
name: Teacher session time assignments
description: Defaults and bounds for assigning individual teachers to portions of a class session.
---

The class session's selected shift defines the common time window A–B. A selected teacher without an individual time assignment uses the full A–B window. A custom teacher interval must remain within A–B.

When a schedule moves while session data stays in its numbered slot, the individual teacher-time rows must move with the schedule's teacher assignments and session-specific roles.

**Why:** The user explicitly clarified that the common shift is the fixed outer bound and per-teacher assignments only split time inside that window.

**How to apply:** Keep the shared session shift unchanged when editing a teacher's individual interval. Validate each interval against the selected shift when saving; do not add adjacency or non-overlap requirements unless requested. When preserving numbered slots, carry time rows with the moved schedule in the same transaction.