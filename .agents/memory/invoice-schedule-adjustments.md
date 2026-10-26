---
name: Child invoice adjustments
description: Adjustment and total ownership in multi-installment invoice groups.
---

Each child invoice owns its own line items, discounts, surcharges, total, payment status, and payment records. The parent is a grouping/link record, not the authority for child totals. A parent-level aggregate, if shown, is informational and must not replace or overwrite the child invoice values.

**Why:** The user clarified that child invoices are the actual financial records and parent invoices do not participate in their payment operations.

**How to apply:** Apply edits, payment locks, and status rules against the child invoice being operated on. Do not calculate a child's total from a parent total or roll a child's adjustment into a parent financial amount. Confirm any intended propagation before implementing it.