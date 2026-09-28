---
name: Transferred session accounting
description: How transferred student-session rows affect active enrollment totals and transfer history.
---

Keep rows marked `transferred` in `student_sessions` so transfer notes and source-session identity remain available, but exclude transferred and cancelled rows from active class totals, dates, attendance/remaining calculations, and future transfer-source selection.

**Why:** Transfers retain the original rows for history; counting them as still enrolled double-counts lessons and leaves the source class overstated.

**How to apply:** Use the same active-session predicate for roster summaries, single and batch student-class recalculation, and transfer-source eligibility. Preserve historical rows and notes; do not delete them.