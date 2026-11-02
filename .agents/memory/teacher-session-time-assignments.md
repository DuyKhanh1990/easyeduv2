---
name: Teacher session time assignments
description: Defaults and bounds for assigning individual teachers to portions of a class session.
---

The class session's selected shift defines the common time window A–B. A selected teacher without an individual time assignment uses the full A–B window. A custom teacher interval must remain within A–B.

When a schedule moves while session data stays in its numbered slot, the individual teacher-time rows must move with the schedule's teacher assignments and session-specific roles.

My Space calendar teacher names intentionally respect the logged-in staff member's assigned time range: show current session teachers whose intervals overlap it, plus legacy roster teachers without individual intervals as full-shift teachers. Ignore time-assignment rows for teachers outside the current session roster; the resulting list may differ from `/schedule`, which displays the full session roster.

**Why:** The user explicitly clarified that the common shift is the fixed outer bound and per-teacher assignments only split time inside that window.

**Why:** The user needs My Space to reflect per-teacher time overlap and accepts that its teacher list may differ from `/schedule` when teachers have non-overlapping intervals. Stale time-assignment rows must not reintroduce teachers removed from a session.

**How to apply:** Keep the shared session shift unchanged when editing a teacher's individual interval. Validate each interval against the selected shift when saving; do not add adjacency or non-overlap requirements unless requested. When preserving numbered slots, carry time rows with the moved schedule in the same transaction. In My Space, filter time-assignment rows to the current session roster before calculating overlap.