---
name: Learning-status session validity
description: Business rule for using scheduled sessions to classify student learning status.
---

Learning-status summaries must exclude student-session rows marked cancelled or transferred, attendance rows marked cancelled, and class sessions marked cancelled. With a selected date range, a student is learning if a non-paused lesson has started in range, or past/current activity exists with a future lesson. A scheduled lesson today counts as started even while attendance is pending; future pending lessons alone do not. Classify as waiting only when future valid lessons exist but the student has not started; classify as ended only when there is past/current activity and no future valid lesson.

**Why:** A transferred source row remains in the database for history even though it is no longer part of the student's active schedule.

**How to apply:** Use these exclusions in schedule-based status summaries and active-student filters; when evaluating a date range, keep future valid sessions visible to the status classification.

For the Customers page cards and per-student status column, aggregate valid sessions across classes by the current day first: any non-paused session today means “Đang học”; otherwise, a paused session today means “Bảo lưu,” even if future lessons remain. Only when there is no session today should past/future lessons decide waiting, active, or ended.

**Why:** The user clarified that an active session in any class today overrides a paused session in another class, but future lessons alone must not override a day where all of today's sessions are paused.

**How to apply:** Keep this current-day, cross-class precedence consistent between the Customers page cards and roster column; the Dashboard summary still uses its selected-date-range rules.
