---
name: Invoice installment adjustments
description: Rules for promotions and surcharges assigned to unpaid invoice installments.
---

The invoice total is authoritative and is calculated from invoice line amounts, invoice promotions, surcharges, and deposit deduction; installment rows must sum to that total and never recalculate it. A promotion applied to a specific unpaid installment is a real additional discount: keep it visible on that installment, reduce its net amount, roll the discount into the parent invoice's aggregate promotion/total, and do not redistribute it to another installment. Invoices without installment-specific promotions retain the existing allocation behavior.

**Why:** The user confirmed that a child installment's discount must reduce the parent amount due while preserving the installment-level breakdown, without changing invoices that have no child-specific promotion.

**How to apply:** Keep paid/confirmed installments immutable. When a child promotion exists, calculate the parent aggregate from item/header adjustments plus child promotions and preserve the child details for display/audit; validate that paid amounts do not exceed the revised parent total and that installment allocations still match. When no child promotion exists, retain the current parent-total and allocation path.