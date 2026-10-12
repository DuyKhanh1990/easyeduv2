---
name: Learning-status session validity
description: Business rule for using scheduled sessions to classify student learning status.
---

Learning-status summaries must exclude student-session rows marked cancelled or transferred, attendance rows marked cancelled, and class sessions marked cancelled. Valid future lessons outside a selected date range must still prevent a student from being classified as ended.

**Why:** A transferred source row remains in the database for history even though it is no longer part of the student's active schedule.

**How to apply:** Use these exclusions in schedule-based status summaries and active-student filters; when evaluating a date range, keep future valid sessions visible to the status classification.
