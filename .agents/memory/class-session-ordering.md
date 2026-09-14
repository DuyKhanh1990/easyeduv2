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

Cycle updates do not reposition lessons. From the selected lesson through the final lesson, assign the newly calculated timetable sequentially to the existing lesson positions. Every lesson keeps its identity, number, status, and linked data.

**Why:** Recreating lessons can silently break attendance, finance, gradebook, and personalized-content links. A bounded middle range needs separate restoration rules that the current product does not expose.

**How to apply:** Require a continuous suffix ending at the final lesson. Never reindex, reorder, or rotate linked data; only replace timetable fields at each existing position. Reject a result that overlaps or precedes the unchanged prefix.