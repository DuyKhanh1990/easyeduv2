---
name: Invoice print amount variables
description: Product semantics for amount variables in invoice print templates.
---

`{{total}}` means the invoice's final total after promotions, surcharges, and deposit/deduction. `{{thanh_tien}}` means the amount after promotions and surcharges but before the parent invoice's deposit/deduction. When printing one installment, `{{thanh_tien}}` uses that installment's own amount.

For a multi-installment invoice, each child installment is the payment record and source of truth for its own amount, status, due date, and collection details. The parent only links the child installments and summarizes their totals.

**Why:** The user confirmed this distinction matches the amount labels on the invoice and avoids making the intermediate amount look like the final amount due.

**Why:** The user clarified that child installments are the actual payment records; the parent is only a link and aggregate.

**How to apply:** Keep `total` and `thanh_tien` distinct in both template-variable descriptions and print rendering. Child-specific print variables must use that installment's values; parent variables must summarize the children and must not substitute for child data.
