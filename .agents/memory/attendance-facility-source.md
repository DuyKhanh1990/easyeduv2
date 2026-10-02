---
name: Attendance facility source
description: Source-of-truth and row-count rule for facility-specific attendance rows.
---

The monthly `/shifts?tab=board` assignments are the source of truth for `/cham-cong` and payroll. For the selected month, render one row for each distinct staff/facility pair with at least one assigned work shift. If one staff member has shifts at multiple facilities, show a separate row for each facility; staff without a work shift that month do not count. Salary generation must use the same scheduled staff/facility pairs so its row count matches attendance for the same dates and locations.

In the salary detail table, keep every row for the same staff member adjacent; order facilities within that staff group for easy comparison.

Salary detail rows are snapshots: running “Tạo chi tiết lương” again recalculates from current rewards/penalties, but replaces all existing detail rows.

**Why:** The user specified that attendance and salary headcount/facility rows must match the selected month's assigned shifts on the shifts board, and confirmed that regenerating the sheet applies later reward/penalty entries.

**How to apply:** Derive attendance and payroll rows from effective monthly shift assignments and their facility IDs, not from staff headcount alone. In salary detail, group by staff ID before sorting facilities. When recalculating, account for the fact that the generator replaces every detail row. Leave the shift board itself unchanged.