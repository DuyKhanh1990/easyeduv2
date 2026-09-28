---
name: Transferred session accounting
description: How transferred student-session rows affect active enrollment totals and transfer history.
---

Keep rows marked `transferred` in `student_sessions` so transfer notes and source-session identity remain available, but exclude transferred and cancelled rows from active class totals, dates, attendance/remaining calculations, and future transfer-source selection. Compute transfer credit as the sum of the effective values of the moved source sessions, session by session; do not divide that credit across destination sessions. New destination rows retain their own target-package effective per-session price. The difference invoice is target value minus source credit and belongs to the destination class; its adjustment line stays out of normal session-fee allocation. Only actual cash collection changes the wallet; the internal credit movement does not.

**Why:** Transfers retain the original rows for history; counting them as still enrolled double-counts lessons and leaves the source class overstated. Source and destination per-session prices can differ, so using the source credit as the destination rate would distort attendance deductions and later transfer calculations. The wallet must continue to reflect cash movements, not internal class allocation.

**How to apply:** Use the same active-session predicate for roster summaries, single and batch student-class recalculation, and transfer-source eligibility. Preserve historical rows and notes; do not delete them. Derive class values from each session's effective allocation, falling back to its saved session price. Save destination package metadata and price, link the difference invoice to the destination class, and keep internal credit out of wallet transactions.