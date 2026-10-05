---
name: Invoice installment filter authority
description: Scheduled invoices use installment values for filtering and must keep results aligned with rendered rows.
---

For scheduled invoices, installment fields are authoritative for payment method, payer, creator, status, amount, and create/due/payment dates. Do not fall back to those parent fields when filtering or rendering a schedule row. Parent-only fields with no schedule equivalent (such as location, type, category, class, and commission context) may still be shared across its installment rows, and parent totals remain for aggregation.

When payment schedules are rendered as separate invoice rows, date filters and all counts (tab badges, totals, and pagination) must apply to the same visible row unit. A parent invoice matching the date must not cause out-of-range installment rows to inflate counts.

**Why:** The user explicitly identified installments as the source of truth for split invoices; parent fields are only for later aggregation. Date filtering can also select a parent because its own date or any schedule date matches, causing unrelated installment rows to inflate counts.

**How to apply:** For schedule-backed invoices, calculate field filters, dates, statuses, and row counts using each schedule consistently across the API, filter options, and client-rendered rows. Retain parent-level behavior only for invoices without schedules; use parent-only metadata as shared context where the schedule schema has no equivalent.