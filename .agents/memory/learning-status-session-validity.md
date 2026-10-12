---
name: Learning-status session validity
description: Business rule for using scheduled sessions to classify student learning status.
---

Learning-status summaries must exclude student-session rows marked cancelled or transferred, attendance rows marked cancelled, and class sessions marked cancelled. With a selected date range, a student is learning if there is a valid attended session in range or the real schedule has both past/current activity and a future lesson. Classify as waiting only when future valid lessons exist but the student has not started; classify as ended only when there is past/current activity and no future valid lesson.

**Why:** A transferred source row remains in the database for history even though it is no longer part of the student's active schedule.

**How to apply:** Use these exclusions in schedule-based status summaries and active-student filters; when evaluating a date range, keep future valid sessions visible to the status classification.
