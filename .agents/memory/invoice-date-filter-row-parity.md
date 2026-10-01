---
name: Invoice date filter row parity
description: Keep invoice date-filter counts aligned with the installment rows actually rendered.
---

When payment schedules are rendered as separate invoice rows, date filters and all counts (tab badges, totals, and pagination) must apply to the same visible row unit. A parent invoice matching the date must not cause out-of-range installment rows to inflate counts.

**Why:** The backend may select a parent because its own creation date or any schedule's creation date matches, while the client filters flattened installments by each schedule's creation date. Counting every paid schedule on that parent then reports more rows than the table displays.

**How to apply:** For invoice list date filtering, calculate row-level status and date eligibility consistently for schedule-backed invoices, including pagination; retain parent-level behavior only for invoices rendered as a single row.