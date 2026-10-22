---
name: Class session ordering
description: Canonical ordering and identity rules for class sessions when dates can be edited.
---

`class_sessions.id` identifies the record. `sessionIndex` is the current chronological lesson number and must be resequenced by `sessionDate`, shift start time, previous index, then ID whenever a session is saved.

**Why:** Users expect a moved 9/9 lesson to appear before 10/9 and become the corresponding earlier lesson number. Keeping the old index made the schedule visibly and operationally out of order.

**How to apply:** Resequence class and student session orders in one transaction while preserving IDs, attendance, content, and remapping cycle-history boundaries. Return/render by `sessionIndex`; use IDs for selection.

When a date/shift edit changes the chronological position, users choose one of two explicit modes:
- Move all information with the edited session record.
- Move schedule fields only while every other field and reference stays fixed at its lesson index.

**Why:** Centers may treat a change as moving the actual lesson or only moving the timetable slot; silently choosing either can misplace attendance, assigned content, and completed homework.

**How to apply:** Do not prompt when the resulting index is unchanged. In schedule-only mode, rotate date, shift, room, teacher, and learning format across fixed session IDs/indexes; never recreate or reassign linked data.

Canceling a class session must preserve every `student_sessions` row and its student-specific details. Mark the class session canceled; do not delete its roster, attendance, notes, pricing, or review records.

**Why:** The user explicitly requires canceled lessons to retain their full student list and information.

**How to apply:** Keep the linked student-session rows intact when changing `class_sessions.status`. The session detail list reads those rows directly, so preserving them keeps the roster and its recorded details available.

Restoring a canceled session only changes its class-session status back to `scheduled`; keep the student-session rows and cancellation metadata unchanged.

**Why:** The user requires a canceled lesson to return to normal without losing any information associated with it.

**How to apply:** Validate the canceled state and edit permission, update only the class-session status, and never recreate or rewrite the linked student-session records.

Cycle updates do not reposition lessons. From the selected lesson through the final lesson, assign the newly calculated timetable sequentially to the existing lesson positions. Every lesson keeps its identity, number, status, and linked data.

**Why:** Recreating lessons can silently break attendance, finance, gradebook, and personalized-content links. A bounded middle range needs separate restoration rules that the current product does not expose.

**How to apply:** Require a continuous suffix ending at the final lesson. Never reindex, reorder, or rotate linked data; only replace timetable fields at each existing position. Reject a result that overlaps or precedes the unchanged prefix.

For actions initiated from the class calendar, identify lessons by their linked `class_sessions` record and its timetable position. Do not compare a class `sessionIndex` with `student_sessions.session_order`; the latter is local to an enrollment and may restart at 1 when the student joins mid-course.

**Why:** A student can be enrolled for class lessons 10–14 while their own session order is 1–5. Comparing those fields can make a schedule action silently select no rows or the wrong rows.

**How to apply:** Use the class-session link/index consistently for preview, mutation, and activity logs. After schedule mutations, invalidate the affected per-session student lists. Keep the student-local order only for logic whose meaning is explicitly enrollment-relative.