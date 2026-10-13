---
name: Learning-status session validity
description: Business rule for using scheduled sessions to classify student learning status.
---

Learning-status summaries must exclude student-session rows marked cancelled or transferred, attendance rows marked cancelled, and class sessions marked cancelled. With a selected date range, a student is learning if a non-paused lesson has started in range, or past/current activity exists with a future lesson. A scheduled lesson today counts as started even while attendance is pending; future pending lessons alone do not. Classify as waiting only when future valid lessons exist but the student has not started; classify as ended only when there is past/current activity and no future valid lesson.

**Why:** A transferred source row remains in the database for history even though it is no longer part of the student's active schedule.

**How to apply:** Use these exclusions in schedule-based status summaries and active-student filters; when evaluating a date range, keep future valid sessions visible to the status classification.

For the Customers page class badges, derive status from that student's valid sessions within that class, not class-wide date bounds. A non-paused lesson today means “Đang học”; paused attendance today means “Bảo lưu.” On a no-session day, a started class whose nearest upcoming session is marked paused remains “Bảo lưu”; a future-only class is not “Đang học” before it starts. Aggregate per-class results with active first, then paused, then waiting, then ended; waiting outranks ended when another class has future lessons.

**Why:** The user clarified that current active study overrides a pause, future lessons outrank an ended class, and a future class start must not end an existing pause early.

**How to apply:** Resolve each student's state per class from valid student-session rows, use attendance status for paused intervals, and aggregate identically for Customers cards, filters, and roster column; the Dashboard summary still uses its selected-date-range rules.
