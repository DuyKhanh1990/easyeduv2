---
name: Invoice installment adjustments
description: Rules for promotions and surcharges assigned to unpaid invoice installments.
---

The invoice total is authoritative and is calculated from invoice line amounts, invoice promotions, surcharges, and deposit deduction; installment rows must sum to that total and never recalculate it. When the total changes, preserve paid installments and redistribute only across unpaid installments. If there is no unpaid installment capacity, block the edit until a payment is properly reversed.

**Why:** The user clarified that payment schedules allocate the invoice total rather than define it; deriving the parent from child rows caused stale totals and phantom installments.

**How to apply:** Keep paid/confirmed installments immutable. Reconcile edits only into unpaid rows, validate that all saved schedule amounts equal the invoice total, and compute paid/remaining/status from the fixed parent total plus actually paid rows.