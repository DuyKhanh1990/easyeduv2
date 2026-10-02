---
name: Attendance facility source
description: Source-of-truth and row-count rule for facility-specific attendance rows.
---

The monthly `/shifts?tab=board` assignments are the source of truth for `/cham-cong`. For the selected month, render one row for each distinct staff/facility pair with at least one assigned work shift. If one staff member has shifts at multiple facilities, show a separate row for each facility; staff without a work shift that month do not count.

**Why:** The user specified that attendance headcount and facility rows must match the selected month's assigned shifts on the shifts board.

**How to apply:** Derive the attendance row set from effective monthly shift assignments and their facility IDs, not from staff headcount alone. Leave the shift board itself unchanged.