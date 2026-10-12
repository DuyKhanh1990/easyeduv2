---
name: Learning-status session validity
description: Business rule for using scheduled sessions to classify student learning status.
---

Learning-status summaries must exclude student-session rows marked cancelled or transferred, attendance rows marked cancelled, and class sessions marked cancelled. With a selected date range, a student is learning if a non-paused lesson has started in range, or past/current activity exists with a future lesson. A scheduled lesson today counts as started even while attendance is pending; future pending lessons alone do not. Classify as waiting only when future valid lessons exist but the student has not started; classify as ended only when there is past/current activity and no future valid lesson.

**Why:** A transferred source row remains in the database for history even though it is no longer part of the student's active schedule.

**How to apply:** Use these exclusions in schedule-based status summaries and active-student filters; when evaluating a date range, keep future valid sessions visible to the status classification.

For the Customers page cards and per-student status column, aggregate each class's effective status as of today before combining classes: a class that has not started yet is not “Đang học” just because it has a non-paused future lesson. Any class actively underway now means overall “Đang học”; otherwise, a started class currently in a paused period means “Bảo lưu,” even if a new class or resumed lesson starts later. Only when no class is active or paused should future-only schedules mean waiting; use past activity with no future lessons for ended.

**Why:** The user clarified that current active study overrides a pause, while a future class start must not end an existing pause early.

**How to apply:** Resolve each class's state as of the current date, then aggregate consistently between the Customers page cards and roster column; the Dashboard summary still uses its selected-date-range rules.
