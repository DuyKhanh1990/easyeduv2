---
name: Transferred session accounting
description: How transferred student-session rows affect active enrollment totals and transfer history.
---

Keep rows marked `transferred` in `student_sessions` so transfer notes and source-session identity remain available, but exclude transferred and cancelled rows from active class totals, dates, attendance/remaining calculations, and future transfer-source selection. New destination rows must retain their fee package and effective per-session price. A transfer invoice represents only the net difference; keep its adjustment line out of normal session-fee allocation.

**Why:** Transfers retain the original rows for history; counting them as still enrolled double-counts lessons and leaves the source class overstated. Allocating a net transfer difference as ordinary tuition would distort destination session prices and later transfer calculations.

**How to apply:** Use the same active-session predicate for roster summaries, single and batch student-class recalculation, and transfer-source eligibility. Preserve historical rows and notes; do not delete them. Save destination package metadata and effective session price, and mark the adjustment invoice item as non-allocating while recording the source/target price breakdown.